import { Types } from "mongoose";
import { Customer, Workspace, type Plan } from "../models.js";
import { applyEvent } from "./apply.js";
import { companyName, downgradeOf, newPlan, priceFor, rng, upgradeOf } from "./demo.js";

const r = rng(Date.now());

/**
 * Keeps demo workspaces alive: while someone has a dashboard open, a new
 * realistic event arrives every few seconds through the normal event pipeline.
 */
export async function tick(workspaceIds: string[]) {
  const demoIds = await Workspace.find({ _id: { $in: workspaceIds.filter((id) => Types.ObjectId.isValid(id)) }, isDemo: true }, { _id: 1 }).lean();
  await Promise.all(demoIds.map((w) => step(w._id).catch((e) => console.error("simulator", e))));
}

async function pickOne(workspaceId: Types.ObjectId, filter: Record<string, unknown>) {
  const where = { workspaceId, ...filter };
  const count = await Customer.countDocuments(where);
  if (!count) return undefined;
  const c = await Customer.findOne(where).skip(r.int(0, count - 1)).lean();
  return (c ?? undefined) as { externalId: string; plan: Plan; mrr: number; seats: number; status: string } | undefined;
}

async function step(workspaceId: Types.ObjectId) {
  const action = r.weighted([["signup", 30], ["convert", 20], ["upgrade", 16], ["downgrade", 4], ["churn", 5], ["fail", 6], ["paid", 19]] as const);
  switch (action) {
    case "signup": {
      const { name, domain } = companyName(r);
      return applyEvent(workspaceId, { type: "customer.signed_up", customer: { id: `cus_live_${new Types.ObjectId().toString().slice(-8)}`, name, domain } }, "simulator");
    }
    case "convert": {
      const c = await pickOne(workspaceId, { status: "trialing" });
      if (!c) return;
      const plan = newPlan(r);
      return applyEvent(workspaceId, { type: "subscription.started", customer: { id: c.externalId }, plan, ...priceFor(plan, r) }, "simulator");
    }
    case "upgrade":
    case "downgrade": {
      const c = await pickOne(workspaceId, { status: "active" });
      if (!c) return;
      const change = action === "upgrade" ? upgradeOf(c, r) : downgradeOf(c, r);
      if (!change) return;
      return applyEvent(workspaceId, { type: "subscription.changed", customer: { id: c.externalId }, ...change }, "simulator");
    }
    case "churn": {
      const c = (await pickOne(workspaceId, { status: { $in: ["active", "past_due"] }, health: { $lt: 55 } })) ?? (await pickOne(workspaceId, { status: "active" }));
      if (!c) return;
      return applyEvent(workspaceId, { type: "subscription.canceled", customer: { id: c.externalId } }, "simulator");
    }
    case "fail": {
      const c = await pickOne(workspaceId, { status: "active" });
      if (!c) return;
      return applyEvent(workspaceId, { type: "payment.failed", customer: { id: c.externalId }, amount: c.mrr }, "simulator");
    }
    case "paid": {
      const c = (await pickOne(workspaceId, { status: "past_due" })) ?? (await pickOne(workspaceId, { status: "active" }));
      if (!c) return;
      return applyEvent(workspaceId, { type: "payment.succeeded", customer: { id: c.externalId }, amount: c.mrr }, "simulator");
    }
  }
}
