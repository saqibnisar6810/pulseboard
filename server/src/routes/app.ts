import { Router, type Request } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { atLeast, newToken, requireAuth, requireRole, sha256, signToken } from "../auth.js";
import { config } from "../config.js";
import { computeMetrics, liveKpis, RANGE_DAYS, type Range } from "../domain/metrics.js";
import { catchUp } from "../domain/simulator.js";
import { newApiKey } from "../domain/workspaces.js";
import { Customer, Event, EVENT_TYPES, Invite, Membership, PLANS, STATUSES, User, Workspace } from "../models.js";

export const appRoutes = Router();
appRoutes.use(requireAuth);

const ws = (req: Request) => new Types.ObjectId(req.auth!.workspaceId);
const isId = (s: string) => Types.ObjectId.isValid(s);

export const publicEvent = (e: { _id: unknown; type: string; customerId: unknown; customerName?: string | null; plan?: string | null; movement?: string | null; mrrDelta: number; mrrAfter: number; amount?: number | null; source?: string | null; at: Date }) => ({
  id: String(e._id), type: e.type, customerId: String(e.customerId), customerName: e.customerName, plan: e.plan,
  movement: e.movement ?? null, mrrDelta: e.mrrDelta, mrrAfter: e.mrrAfter, amount: e.amount ?? null, source: e.source, at: e.at,
});

// ------------------------------------------------------------------ metrics

const MetricsQuery = z.object({ range: z.enum(["30d", "90d", "12m"]).default("12m"), plan: z.enum(["all", ...PLANS]).default("all") });

appRoutes.get("/metrics", async (req, res) => {
  const q = MetricsQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "Invalid filters." });
  const days = RANGE_DAYS[q.data.range as Range];
  const since = new Date(Date.now() - (2 * days + 5) * 86_400_000);
  const [customers, events] = await Promise.all([
    Customer.find({ workspaceId: ws(req) }, { name: 1, plan: 1, mrr: 1, seats: 1, status: 1, health: 1, convertedAt: 1, churnedAt: 1 }).lean(),
    Event.find({ workspaceId: ws(req), at: { $gt: since } }, { type: 1, plan: 1, movement: 1, mrrDelta: 1, customerId: 1, at: 1 }).lean(),
  ]);
  res.json(computeMetrics({ customers: customers as never, events: events as never, range: q.data.range, plan: q.data.plan }));
});

// ---------------------------------------------------------------- customers

const CustomerQuery = z.object({
  q: z.string().max(80).default(""),
  plan: z.enum(["all", ...PLANS]).default("all"),
  status: z.enum(["all", ...STATUSES]).default("all"),
  sort: z.enum(["mrr", "-mrr", "name", "signedUpAt", "-signedUpAt", "health", "-health"]).default("-mrr"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

function customerFilter(req: Request, q: z.infer<typeof CustomerQuery>) {
  const filter: Record<string, unknown> = { workspaceId: ws(req) };
  if (q.plan !== "all") filter.plan = q.plan;
  if (q.status !== "all") filter.status = q.status;
  if (q.q) {
    const safe = q.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ name: { $regex: safe, $options: "i" } }, { domain: { $regex: safe, $options: "i" } }, { externalId: q.q }];
  }
  return filter;
}
const sortOf = (s: string) => (s.startsWith("-") ? { [s.slice(1)]: -1 as const, _id: 1 as const } : { [s]: 1 as const, _id: 1 as const });

appRoutes.get("/customers", async (req, res) => {
  const q = CustomerQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "Invalid filters." });
  const filter = customerFilter(req, q.data);
  const pageSize = 25;
  const [items, total] = await Promise.all([
    Customer.find(filter).sort(sortOf(q.data.sort)).skip((q.data.page - 1) * pageSize).limit(pageSize).lean(),
    Customer.countDocuments(filter),
  ]);
  res.json({
    total, page: q.data.page, pageSize,
    items: items.map((c) => ({ id: String(c._id), externalId: c.externalId, name: c.name, domain: c.domain, plan: c.plan, mrr: c.mrr, seats: c.seats, status: c.status, health: c.health, signedUpAt: c.signedUpAt, convertedAt: c.convertedAt, churnedAt: c.churnedAt })),
  });
});

appRoutes.get("/customers/:id", async (req, res) => {
  if (!isId(String(req.params.id))) return res.status(404).json({ error: "Customer not found." });
  const c = await Customer.findOne({ _id: req.params.id, workspaceId: ws(req) }).lean();
  if (!c) return res.status(404).json({ error: "Customer not found." });
  const events = await Event.find({ workspaceId: ws(req), customerId: c._id }).sort({ at: -1 }).limit(50).lean();
  res.json({
    customer: { id: String(c._id), externalId: c.externalId, name: c.name, domain: c.domain, plan: c.plan, mrr: c.mrr, seats: c.seats, status: c.status, health: c.health, signedUpAt: c.signedUpAt, convertedAt: c.convertedAt, churnedAt: c.churnedAt },
    events: events.map(publicEvent),
  });
});

// ------------------------------------------------------------------- events

appRoutes.get("/events", async (req, res) => {
  const q = z.object({ type: z.enum(["all", ...EVENT_TYPES]).default("all"), limit: z.coerce.number().int().min(1).max(200).default(60) }).safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "Invalid filters." });
  const filter: Record<string, unknown> = { workspaceId: ws(req) };
  if (q.data.type !== "all") filter.type = q.data.type;
  const events = await Event.find(filter).sort({ at: -1 }).limit(q.data.limit).lean();
  res.json({ items: events.map(publicEvent) });
});

// --------------------------------------------------------------------- live

/**
 * Polling alternative to the Socket.io feed (used on serverless hosts).
 * `after` is the id of the last event the client has; ids increase over time.
 * Demo workspaces get their simulated events here, on demand.
 */
appRoutes.get("/live", async (req, res) => {
  const after = String(req.query.after ?? "");
  const workspaceId = ws(req);
  await catchUp(req.auth!.workspaceId, config.simulatorSeconds * 1000);
  if (!isId(after)) {
    const last = await Event.findOne({ workspaceId }, { _id: 1 }).sort({ _id: -1 }).lean();
    const customers = await Customer.find({ workspaceId }, { mrr: 1, status: 1 }).lean();
    return res.json({ cursor: last ? String(last._id) : null, events: [], kpis: { ...liveKpis(customers), at: new Date().toISOString() } });
  }
  const events = await Event.find({ workspaceId, _id: { $gt: new Types.ObjectId(after) } }).sort({ _id: 1 }).limit(50).lean();
  let kpis = null;
  if (events.length) {
    const customers = await Customer.find({ workspaceId }, { mrr: 1, status: 1 }).lean();
    kpis = { ...liveKpis(customers), at: new Date().toISOString() };
  }
  res.json({ cursor: events.length ? String(events[events.length - 1]._id) : after, events: events.map(publicEvent), kpis });
});

// ------------------------------------------------------------------- export

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`; // no spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

appRoutes.get("/export/customers.csv", async (req, res) => {
  const q = CustomerQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "Invalid filters." });
  const items = await Customer.find(customerFilter(req, q.data)).sort(sortOf(q.data.sort)).limit(20_000).lean();
  const rows = [["id", "name", "domain", "plan", "status", "mrr", "seats", "health", "signed_up_at", "converted_at", "churned_at"], ...items.map((c) => [c.externalId, c.name, c.domain, c.plan, c.status, c.mrr, c.seats, c.health, c.signedUpAt, c.convertedAt, c.churnedAt])];
  res.attachment("pulseboard-customers.csv").type("text/csv").send("﻿" + csv(rows));
});

appRoutes.get("/export/mrr.csv", async (req, res) => {
  const q = MetricsQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "Invalid filters." });
  const days = RANGE_DAYS[q.data.range as Range];
  const since = new Date(Date.now() - (2 * days + 5) * 86_400_000);
  const [customers, events] = await Promise.all([
    Customer.find({ workspaceId: ws(req) }).lean(),
    Event.find({ workspaceId: ws(req), at: { $gt: since } }).lean(),
  ]);
  const m = computeMetrics({ customers: customers as never, events: events as never, range: q.data.range, plan: q.data.plan });
  const rows = [["period", "new", "expansion", "contraction", "churn", "net", "mrr_end"], ...m.movement.map((b) => [b.label, b.new, b.expansion, b.contraction, b.churn, b.net, b.mrr])];
  res.attachment(`pulseboard-mrr-${q.data.range}.csv`).type("text/csv").send("﻿" + csv(rows));
});

// ---------------------------------------------------------------- workspace

appRoutes.patch("/workspace", requireRole("admin"), async (req, res) => {
  const p = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Enter a workspace name." });
  await Workspace.updateOne({ _id: ws(req) }, { name: p.data.name });
  res.json({ ok: true });
});

/** Rotates the ingestion key. The full key is shown once and never stored. */
appRoutes.post("/workspace/api-key", requireRole("admin"), async (req, res) => {
  const api = newApiKey();
  await Workspace.updateOne({ _id: ws(req) }, { apiKeyHash: api.hash, apiKeyPrefix: api.prefix });
  res.json({ key: api.key, prefix: api.prefix });
});

// ----------------------------------------------------------------- members

appRoutes.get("/members", async (req, res) => {
  const ms = await Membership.find({ workspaceId: ws(req) }).sort({ createdAt: 1 }).lean();
  const users = await User.find({ _id: { $in: ms.map((m) => m.userId) } }, { name: 1, email: 1 }).lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const invites = atLeast(req.auth!.role, "admin")
    ? await Invite.find({ workspaceId: ws(req), acceptedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean()
    : [];
  res.json({
    members: ms.map((m) => ({ userId: String(m.userId), name: byId.get(String(m.userId))?.name, email: byId.get(String(m.userId))?.email, role: m.role, you: String(m.userId) === req.auth!.userId })),
    invites: invites.map((i) => ({ id: String(i._id), email: i.email, role: i.role, expiresAt: i.expiresAt })),
  });
});

appRoutes.patch("/members/:userId", requireRole("owner"), async (req, res) => {
  const p = z.object({ role: z.enum(["admin", "viewer"]) }).safeParse(req.body);
  if (!p.success || !isId(String(req.params.userId))) return res.status(400).json({ error: "Pick admin or viewer." });
  if (req.params.userId === req.auth!.userId) return res.status(400).json({ error: "You can't change your own role." });
  const m = await Membership.findOneAndUpdate({ workspaceId: ws(req), userId: req.params.userId, role: { $ne: "owner" } }, { role: p.data.role }, { new: true });
  if (!m) return res.status(404).json({ error: "Member not found." });
  res.json({ ok: true });
});

appRoutes.delete("/members/:userId", requireRole("admin"), async (req, res) => {
  if (!isId(String(req.params.userId))) return res.status(404).json({ error: "Member not found." });
  if (req.params.userId === req.auth!.userId) return res.status(400).json({ error: "You can't remove yourself." });
  const target = await Membership.findOne({ workspaceId: ws(req), userId: req.params.userId });
  if (!target) return res.status(404).json({ error: "Member not found." });
  if (target.role === "owner") return res.status(403).json({ error: "The owner can't be removed." });
  if (target.role === "admin" && req.auth!.role !== "owner") return res.status(403).json({ error: "Only the owner can remove admins." });
  await target.deleteOne();
  res.json({ ok: true });
});

appRoutes.post("/invites", requireRole("admin"), async (req, res) => {
  const p = z.object({ email: z.email().max(200), role: z.enum(["admin", "viewer"]) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Enter a valid email and role." });
  if (p.data.role === "admin" && req.auth!.role !== "owner") return res.status(403).json({ error: "Only the owner can invite admins." });
  const token = newToken("inv_", 24);
  await Invite.create({ workspaceId: ws(req), email: p.data.email, role: p.data.role, tokenHash: sha256(token), invitedBy: req.auth!.userId, expiresAt: new Date(Date.now() + 7 * 86_400_000) });
  // No email service in the demo: the link is shown to copy and share.
  res.status(201).json({ link: `${config.appUrl}/join/${token}` });
});

appRoutes.delete("/invites/:id", requireRole("admin"), async (req, res) => {
  if (!isId(String(req.params.id))) return res.status(404).json({ error: "Invite not found." });
  await Invite.deleteOne({ _id: req.params.id, workspaceId: ws(req) });
  res.json({ ok: true });
});

appRoutes.post("/invites/:token/accept", async (req, res) => {
  const inv = await Invite.findOne({ tokenHash: sha256(String(req.params.token)), acceptedAt: null, expiresAt: { $gt: new Date() } });
  if (!inv) return res.status(404).json({ error: "This invite has expired or was already used." });
  const exists = await Membership.exists({ workspaceId: inv.workspaceId, userId: req.auth!.userId });
  if (!exists) await Membership.create({ workspaceId: inv.workspaceId, userId: req.auth!.userId, role: inv.role });
  inv.acceptedAt = new Date();
  await inv.save();
  res.json({ token: signToken(req.auth!.userId, String(inv.workspaceId)) });
});
