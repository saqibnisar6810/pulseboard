export const money = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

export const compactMoney = (n: number) => {
  const a = Math.abs(n);
  const body = a >= 1000 ? `$${(a / 1000).toFixed(a >= 10_000 ? 0 : 1)}k` : `$${Math.round(a)}`;
  return n < 0 ? `−${body}` : body;
};
export const pct = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? "—" : `${n.toFixed(digits)}%`);

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

export const PLAN_LABEL: Record<string, string> = { starter: "Starter", pro: "Pro", team: "Team", enterprise: "Enterprise" };
export const STATUS_LABEL: Record<string, string> = { trialing: "Trial", active: "Active", past_due: "Past due", churned: "Churned" };

/** One line describing an event, for feeds and timelines. */
export function describe(e: { type: string; customerName: string; plan: string; mrrDelta: number; amount: number | null }) {
  const plan = PLAN_LABEL[e.plan] ?? e.plan;
  switch (e.type) {
    case "customer.signed_up": return `New trial · ${e.customerName}`;
    case "subscription.started": return `${e.customerName} subscribed to ${plan}`;
    case "subscription.changed": return e.mrrDelta >= 0 ? `${e.customerName} upgraded (${plan})` : `${e.customerName} downgraded (${plan})`;
    case "subscription.canceled": return `${e.customerName} canceled`;
    case "payment.failed": return `Payment failed · ${e.customerName}`;
    case "payment.succeeded": return `Payment received · ${e.customerName}`;
    default: return e.type;
  }
}

export const eventTone = (e: { type: string; mrrDelta: number }) =>
  e.type === "subscription.canceled" || e.type === "payment.failed" ? (e.type === "payment.failed" ? "amber" : "rose") : e.mrrDelta > 0 ? "teal" : e.type === "customer.signed_up" ? "teal2" : "mu";
