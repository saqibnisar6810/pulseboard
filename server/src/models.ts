import mongoose, { Schema, type InferSchemaType, type Types } from "mongoose";

export const ROLES = ["owner", "admin", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PLANS = ["starter", "pro", "team", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export const STATUSES = ["trialing", "active", "past_due", "churned"] as const;
export type CustomerStatus = (typeof STATUSES)[number];

export const EVENT_TYPES = [
  "customer.signed_up",
  "subscription.started",
  "subscription.changed",
  "subscription.canceled",
  "payment.failed",
  "payment.succeeded",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** How an event moved MRR. Used for the MRR movement chart. */
export const MOVEMENTS = ["new", "expansion", "contraction", "churn", "reactivation"] as const;
export type Movement = (typeof MOVEMENTS)[number];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    isDemo: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
    // PulseBoard's own subscription (paid through Stripe test mode)
    billingPlan: { type: String, enum: ["free", "growth", "scale"], default: "free" },
    billingStatus: { type: String, enum: ["none", "active", "past_due", "canceling"], default: "none" },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    // Ingestion API key: only the hash is stored, plus a prefix to show in the UI
    apiKeyHash: { type: String, index: true },
    apiKeyPrefix: String,
  },
  { timestamps: true },
);

const membershipSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { timestamps: true },
);
membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1 });

const inviteSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ["admin", "viewer"], required: true },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: Schema.Types.ObjectId, required: true },
    acceptedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

const customerSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    externalId: { type: String, required: true },
    name: { type: String, required: true },
    domain: String,
    plan: { type: String, enum: PLANS, default: "starter" },
    mrr: { type: Number, default: 0 },
    seats: { type: Number, default: 1 },
    status: { type: String, enum: STATUSES, default: "trialing" },
    health: { type: Number, default: 80 },
    signedUpAt: { type: Date, required: true },
    convertedAt: { type: Date, default: null },
    churnedAt: { type: Date, default: null },
    lastEventAt: { type: Date },
  },
  { timestamps: false },
);
customerSchema.index({ workspaceId: 1, externalId: 1 }, { unique: true });
customerSchema.index({ workspaceId: 1, mrr: -1 });

const eventSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: EVENT_TYPES, required: true },
    customerId: { type: Schema.Types.ObjectId, required: true },
    customerName: String,
    plan: String,
    movement: { type: String, enum: [...MOVEMENTS, null], default: null },
    mrrDelta: { type: Number, default: 0 },
    mrrAfter: { type: Number, default: 0 },
    amount: Number,
    source: { type: String, enum: ["api", "demo", "simulator"], default: "api" },
    at: { type: Date, required: true },
  },
  { timestamps: false },
);
eventSchema.index({ workspaceId: 1, at: -1 });
eventSchema.index({ workspaceId: 1, customerId: 1, at: -1 });

export const User = mongoose.model("User", userSchema);
export const Workspace = mongoose.model("Workspace", workspaceSchema);
export const Membership = mongoose.model("Membership", membershipSchema);
export const Invite = mongoose.model("Invite", inviteSchema);
export const Customer = mongoose.model("Customer", customerSchema);
export const Event = mongoose.model("Event", eventSchema);

export type CustomerDoc = InferSchemaType<typeof customerSchema> & { _id: Types.ObjectId };
export type EventDoc = InferSchemaType<typeof eventSchema> & { _id: Types.ObjectId };
export type WorkspaceDoc = InferSchemaType<typeof workspaceSchema> & { _id: Types.ObjectId };
