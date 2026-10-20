import express, { Router } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { config } from "../config.js";
import { Workspace } from "../models.js";

/**
 * PulseBoard's own subscription, paid through Stripe Checkout (test mode).
 * Prices are defined inline, so no Stripe dashboard setup is needed.
 */
const PRICES = { growth: { name: "PulseBoard Growth", cents: 4900 }, scale: { name: "PulseBoard Scale", cents: 14900 } } as const;
const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

export const billingRoutes = Router();
billingRoutes.use(requireAuth);

billingRoutes.get("/", async (req, res) => {
  const w = await Workspace.findById(req.auth!.workspaceId, { billingPlan: 1, billingStatus: 1 }).lean();
  res.json({ enabled: Boolean(stripe), testMode: config.stripeSecretKey.startsWith("sk_test_"), plan: w?.billingPlan ?? "free", status: w?.billingStatus ?? "none", prices: PRICES });
});

billingRoutes.post("/checkout", requireRole("owner"), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Billing isn't configured on this server." });
  const p = z.object({ plan: z.enum(["growth", "scale"]) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pick a plan." });
  const w = await Workspace.findById(req.auth!.workspaceId);
  if (!w) return res.status(404).json({ error: "Workspace not found." });
  const price = PRICES[p.data.plan];
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: price.cents, recurring: { interval: "month" }, product_data: { name: price.name } } }],
    customer: w.stripeCustomerId || undefined,
    client_reference_id: String(w._id),
    metadata: { workspaceId: String(w._id), plan: p.data.plan },
    subscription_data: { metadata: { workspaceId: String(w._id), plan: p.data.plan } },
    success_url: `${config.appUrl}/settings/billing?checkout=success`,
    cancel_url: `${config.appUrl}/settings/billing?checkout=cancelled`,
  });
  res.json({ url: session.url });
});

billingRoutes.post("/cancel", requireRole("owner"), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Billing isn't configured on this server." });
  const w = await Workspace.findById(req.auth!.workspaceId);
  if (!w?.stripeSubscriptionId) return res.status(400).json({ error: "There's no paid plan to cancel." });
  await stripe.subscriptions.update(w.stripeSubscriptionId, { cancel_at_period_end: true });
  w.billingStatus = "canceling";
  await w.save();
  res.json({ ok: true });
});

/** Stripe calls this. Mounted with a raw body parser so the signature can be checked. */
export const stripeWebhook = Router();
stripeWebhook.post("/", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
  if (!stripe || !config.stripeWebhookSecret) return res.status(503).send("Billing not configured");
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, req.headers["stripe-signature"] as string, config.stripeWebhookSecret);
  } catch {
    return res.status(400).send("Bad signature");
  }
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const id = s.metadata?.workspaceId;
      if (id) await Workspace.updateOne({ _id: id }, { billingPlan: s.metadata?.plan ?? "growth", billingStatus: "active", stripeCustomerId: String(s.customer ?? ""), stripeSubscriptionId: String(s.subscription ?? "") });
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      await Workspace.updateOne({ stripeSubscriptionId: sub.id }, { billingPlan: "free", billingStatus: "none", stripeSubscriptionId: null });
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice & { customer?: string };
      if (inv.customer) await Workspace.updateOne({ stripeCustomerId: String(inv.customer) }, { billingStatus: "past_due" });
      break;
    }
  }
  res.json({ received: true });
});
