import { Types } from "mongoose";
import { Customer, Event, type Plan } from "../models.js";
import { transition, type CustomerState, type IncomingEvent } from "./apply.js";

/** Small seeded random generator so demo data looks natural but is reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p: number) => next() < p,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)],
    weighted: <T,>(items: readonly (readonly [T, number])[]) => {
      const total = items.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of items) if ((r -= w) <= 0) return v;
      return items[items.length - 1][0];
    },
  };
}
export type Rng = ReturnType<typeof rng>;

const PREFIX = ["Vertex", "Kite", "Lumen", "Orbit", "Nova", "Bright", "Cobalt", "Juniper", "Atlas", "Harbor", "Pixel", "Maple", "Quartz", "Summit", "Ember", "Nimbus", "Cedar", "Fable", "Helix", "Ivory", "Lattice", "Meadow", "Northwind", "Paper", "Relay", "Signal", "Tidal", "Upward", "Velvet", "Willow", "Zephyr", "Beacon", "Canopy", "Drift", "Fern", "Granite", "Hatch", "Inlet", "Keystone", "Loop"];
const SUFFIX = ["AI", "pay", "Labs", "Health", "ly", "works", "Cloud", "HQ", "stack", "Data", "Studio", "Logistics", "Learning", "Capital", "Systems", "Commerce", "Analytics", "Robotics", "Media", "Mobility"];

export function companyName(r: Rng) {
  const p = r.pick(PREFIX);
  const s = r.pick(SUFFIX);
  const name = /^[a-z]/.test(s) ? `${p}${s}` : `${p} ${s}`;
  return { name, domain: `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.io` };
}

/** Pricing used by the demo company ("Orbit Apps") for its own customers. */
export function priceFor(plan: Plan, r: Rng): { mrr: number; seats: number } {
  switch (plan) {
    case "starter": return { mrr: 29, seats: r.int(1, 2) };
    case "pro": return { mrr: 99, seats: r.int(3, 10) };
    case "team": { const seats = r.int(5, 20); return { mrr: seats * 15, seats }; }
    case "enterprise": { const seats = r.int(40, 120); return { mrr: 800 + seats * 5, seats }; }
  }
}
const NEXT_PLAN: Record<Plan, Plan | null> = { starter: "pro", pro: "team", team: "enterprise", enterprise: null };
const PREV_PLAN: Record<Plan, Plan | null> = { starter: null, pro: "starter", team: "pro", enterprise: "team" };
const MONTHLY_CHURN: Record<Plan, number> = { starter: 0.032, pro: 0.019, team: 0.011, enterprise: 0.006 };

export const newPlan = (r: Rng) => r.weighted<Plan>([["starter", 55], ["pro", 30], ["team", 13], ["enterprise", 2]]);

/** Plan change for an existing customer: usually more seats, sometimes a tier change. */
export function upgradeOf(c: CustomerState & { plan?: string | null }, r: Rng): { plan: Plan; mrr: number; seats: number } | null {
  const plan = (c.plan ?? "starter") as Plan;
  if ((plan === "team" && r.chance(0.85)) || plan === "enterprise") {
    const seats = (c.seats ?? 1) + r.int(1, 4);
    return { plan, seats, mrr: plan === "team" ? seats * 15 : 800 + seats * 5 };
  }
  const next = NEXT_PLAN[plan];
  if (!next) return null;
  const p = priceFor(next, r);
  return { plan: next, ...p };
}
export function downgradeOf(c: CustomerState & { plan?: string | null }, r: Rng): { plan: Plan; mrr: number; seats: number } | null {
  const plan = (c.plan ?? "starter") as Plan;
  if (plan === "team" && (c.seats ?? 0) > 6 && r.chance(0.7)) {
    const seats = Math.max(5, (c.seats ?? 10) - r.int(1, 3));
    return { plan, seats, mrr: seats * 15 };
  }
  const prev = PREV_PLAN[plan];
  if (!prev) return null;
  return { plan: prev, ...priceFor(prev, r) };
}

type Sim = CustomerState & { _id: Types.ObjectId; externalId: string; name: string; domain: string; signedUpAt: Date; lastEventAt?: Date; trialEndsAt?: Date; recoverAt?: Date };

const DAY = 86_400_000;

/**
 * Builds two years of history for a demo workspace entirely in memory
 * (using the same rules as the live API), then bulk-inserts it.
 */
export async function generateDemoData(workspaceId: Types.ObjectId, seed = Date.now()) {
  const r = rng(seed);
  const now = Date.now();
  const HISTORY = 730; // two years, so "vs previous 12 months" comparisons are real
  const start = now - HISTORY * DAY;
  const customers: Sim[] = [];
  const events: Record<string, unknown>[] = [];
  let n = 0;

  const emit = (c: Sim, input: Omit<IncomingEvent, "customer">, at: number, source: "demo" = "demo") => {
    const full = { ...input, customer: { id: c.externalId } } as IncomingEvent;
    const { movement, delta } = transition(c, full, new Date(at));
    c.lastEventAt = new Date(at);
    events.push({
      workspaceId, type: input.type, customerId: c._id, customerName: c.name, plan: c.plan, movement,
      mrrDelta: delta, mrrAfter: c.mrr, amount: input.amount, source, at: new Date(at),
    });
  };

  const create = (at: number) => {
    const { name, domain } = companyName(r);
    const c: Sim = { _id: new Types.ObjectId(), externalId: `cus_${(++n).toString(36).padStart(5, "0")}${r.int(100, 999)}`, name, domain, signedUpAt: new Date(at), status: "trialing", mrr: 0, seats: 1, health: 80, convertedAt: null, churnedAt: null };
    customers.push(c);
    emit(c, { type: "customer.signed_up" }, at);
    return c;
  };

  const startSub = (c: Sim, at: number) => {
    const plan = newPlan(r);
    emit(c, { type: "subscription.started", plan, ...priceFor(plan, r) }, at);
  };

  // Customers who were already paying when the history starts.
  for (let i = 0; i < 190; i++) {
    const signed = start - r.int(20, 700) * DAY;
    const c = create(signed);
    startSub(c, signed + 14 * DAY);
  }

  for (let day = 0; day < HISTORY; day++) {
    const dayStart = start + day * DAY;
    const t = () => dayStart + r.int(7, 22) * 3_600_000 + r.int(0, 3599) * 1000;

    // Signups grow through the year
    const signups = Math.floor(0.5 + (day / HISTORY) * 1.7 + r.next() * 1.3);
    for (let i = 0; i < signups; i++) {
      const c = create(t());
      c.trialEndsAt = new Date(c.signedUpAt.getTime() + 14 * DAY);
    }

    for (const c of customers) {
      if (c.status === "trialing" && c.trialEndsAt && c.trialEndsAt.getTime() <= dayStart + DAY) {
        if (r.chance(0.46)) startSub(c, c.trialEndsAt.getTime());
        else emit(c, { type: "subscription.canceled" }, c.trialEndsAt.getTime());
        c.trialEndsAt = undefined;
        continue;
      }
      if (c.status === "past_due" && c.recoverAt && c.recoverAt.getTime() <= dayStart + DAY) {
        if (r.chance(0.8)) emit(c, { type: "payment.succeeded", amount: c.mrr ?? 0 }, c.recoverAt.getTime());
        else emit(c, { type: "subscription.canceled" }, c.recoverAt.getTime());
        c.recoverAt = undefined;
        continue;
      }
      if (c.status === "active") {
        const plan = (c.plan ?? "starter") as Plan;
        if (r.chance(MONTHLY_CHURN[plan] / 30)) { emit(c, { type: "subscription.canceled" }, t()); continue; }
        if (r.chance(0.0024)) { const u = upgradeOf(c, r); if (u) emit(c, { type: "subscription.changed", ...u }, t()); continue; }
        if (r.chance(0.0007)) { const d = downgradeOf(c, r); if (d) emit(c, { type: "subscription.changed", ...d }, t()); continue; }
        if (r.chance(0.0016)) { emit(c, { type: "payment.failed", amount: c.mrr ?? 0 }, t()); c.recoverAt = new Date(dayStart + r.int(2, 6) * DAY); continue; }
      }
      if (c.status === "churned" && c.mrr === 0 && c.convertedAt && r.chance(0.0004)) {
        startSub(c, t());
      }
    }
  }

  // Trials still running end in the future; leave them as trialing.
  const docs = customers.map((c) => ({
    _id: c._id, workspaceId, externalId: c.externalId, name: c.name, domain: c.domain, plan: c.plan ?? "starter", mrr: c.mrr ?? 0,
    seats: c.seats ?? 1, status: c.status, health: healthScore(c, r), signedUpAt: c.signedUpAt, convertedAt: c.convertedAt ?? null,
    churnedAt: c.churnedAt ?? null, lastEventAt: c.lastEventAt,
  }));
  await Customer.insertMany(docs, { ordered: false });
  for (let i = 0; i < events.length; i += 1000) await Event.insertMany(events.slice(i, i + 1000), { ordered: false });
  return { customers: docs.length, events: events.length };
}

function healthScore(c: Sim, r: Rng) {
  if (c.status === "churned") return 0;
  if (c.status === "past_due") return r.int(25, 45);
  if (c.status === "trialing") return r.int(50, 80);
  return Math.max(30, Math.min(98, (c.health ?? 80) + r.int(-15, 12)));
}
