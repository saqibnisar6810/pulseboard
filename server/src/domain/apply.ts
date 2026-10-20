import type { Types } from "mongoose";
import { z } from "zod";
import { Customer, Event, EVENT_TYPES, PLANS, type CustomerDoc, type EventDoc, type Movement } from "../models.js";

/** The public shape of an incoming event (REST API, demo generator and simulator all use it). */
export const IncomingEvent = z.object({
  type: z.enum(EVENT_TYPES),
  customer: z.object({
    id: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(120).optional(),
    domain: z.string().trim().max(120).optional(),
  }),
  plan: z.enum(PLANS).optional(),
  mrr: z.number().min(0).max(1_000_000).optional(),
  seats: z.number().int().min(1).max(100_000).optional(),
  amount: z.number().min(0).max(1_000_000).optional(),
  at: z.coerce.date().optional(),
});
export type IncomingEvent = z.infer<typeof IncomingEvent>;

export class EventError extends Error {}

export type CustomerState = {
  plan?: string | null;
  mrr?: number | null;
  seats?: number | null;
  status?: string | null;
  health?: number | null;
  convertedAt?: Date | null;
  churnedAt?: Date | null;
};

const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * The business rules for one event, as a pure function: it updates the
 * customer state and says how MRR moved. Shared by the live API and the
 * demo-data generator so both produce identical numbers.
 */
export function transition(c: CustomerState, input: IncomingEvent, at: Date): { movement: Movement | null; delta: number } {
  const before = c.mrr ?? 0;
  const health = c.health ?? 80;

  switch (input.type) {
    case "customer.signed_up":
      return { movement: null, delta: 0 };

    case "subscription.started": {
      if (!input.plan || input.mrr === undefined) throw new EventError("subscription.started needs plan and mrr.");
      const wasChurned = c.status === "churned";
      const wasPaying = c.status === "active" || c.status === "past_due";
      const delta = round(input.mrr - (wasPaying ? before : 0));
      const movement: Movement = wasChurned ? "reactivation" : wasPaying ? (delta >= 0 ? "expansion" : "contraction") : "new";
      c.plan = input.plan;
      c.mrr = input.mrr;
      c.seats = input.seats ?? c.seats ?? 1;
      c.status = "active";
      c.churnedAt = null;
      if (!c.convertedAt || wasChurned) c.convertedAt = at;
      c.health = clamp(health + 5, 5, 99);
      return { movement, delta };
    }

    case "subscription.changed": {
      if (c.status !== "active" && c.status !== "past_due") throw new EventError("Customer has no active subscription.");
      const next = input.mrr ?? before;
      const delta = round(next - before);
      if (input.plan) c.plan = input.plan;
      if (input.seats) c.seats = input.seats;
      c.mrr = next;
      c.health = clamp(health + (delta > 0 ? 6 : delta < 0 ? -8 : 0), 5, 99);
      return { movement: delta > 0 ? "expansion" : delta < 0 ? "contraction" : null, delta };
    }

    case "subscription.canceled": {
      if (c.status === "churned") throw new EventError("Customer already canceled.");
      const wasTrial = c.status === "trialing";
      c.status = "churned";
      c.churnedAt = at;
      c.mrr = 0;
      if (wasTrial) return { movement: null, delta: 0 }; // a trial ending moves no MRR
      c.health = 0;
      return { movement: "churn", delta: round(-before) };
    }

    case "payment.failed":
      if (c.status === "active") c.status = "past_due";
      c.health = clamp(health - 25, 5, 99);
      return { movement: null, delta: 0 };

    case "payment.succeeded":
      if (c.status === "past_due") c.status = "active";
      c.health = clamp(health + 8, 5, 99);
      return { movement: null, delta: 0 };
  }
}

type Listener = (workspaceId: string, event: EventDoc, customer: CustomerDoc) => void;
const listeners: Listener[] = [];
/** The realtime layer subscribes here so every applied event is pushed to open dashboards. */
export const onEventApplied = (l: Listener) => listeners.push(l);

/** Applies one event to the database and notifies open dashboards. */
export async function applyEvent(
  workspaceId: Types.ObjectId | string,
  input: IncomingEvent,
  source: "api" | "demo" | "simulator" = "api",
): Promise<{ event: EventDoc; customer: CustomerDoc }> {
  const at = input.at ?? new Date();
  let customer = await Customer.findOne({ workspaceId, externalId: input.customer.id });

  if (!customer) {
    if (input.type !== "customer.signed_up" && input.type !== "subscription.started") {
      throw new EventError(`Unknown customer "${input.customer.id}". Send customer.signed_up or subscription.started first.`);
    }
    customer = new Customer({
      workspaceId,
      externalId: input.customer.id,
      name: input.customer.name ?? input.customer.id,
      domain: input.customer.domain,
      signedUpAt: at,
      status: "trialing",
      mrr: 0,
      health: 80,
    });
  } else {
    if (input.customer.name) customer.name = input.customer.name;
    if (input.customer.domain) customer.domain = input.customer.domain;
  }

  const state: CustomerState = {
    plan: customer.plan, mrr: customer.mrr, seats: customer.seats, status: customer.status,
    health: customer.health, convertedAt: customer.convertedAt, churnedAt: customer.churnedAt,
  };
  const { movement, delta } = transition(state, input, at);
  customer.set({ ...state, lastEventAt: at });
  await customer.save();

  const event = await Event.create({
    workspaceId,
    type: input.type,
    customerId: customer._id,
    customerName: customer.name,
    plan: customer.plan,
    movement,
    mrrDelta: delta,
    mrrAfter: customer.mrr,
    amount: input.amount,
    source,
    at,
  });

  const c = customer.toObject() as CustomerDoc;
  const e = event.toObject() as EventDoc;
  for (const l of listeners) l(String(workspaceId), e, c);
  return { event: e, customer: c };
}
