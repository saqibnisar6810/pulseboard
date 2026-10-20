/**
 * Revenue metrics, computed from customers and their events.
 * Pure functions: easy to test, and the same code serves every chart.
 */

export type MetricCustomer = {
  _id: unknown;
  name: string;
  plan: string;
  mrr: number;
  seats: number;
  status: string;
  health: number;
  convertedAt: Date | null;
  churnedAt: Date | null;
};

export type MetricEvent = {
  type: string;
  plan?: string | null;
  movement?: string | null;
  mrrDelta: number;
  customerId: unknown;
  customerName?: string | null;
  at: Date;
};

export type Range = "30d" | "90d" | "12m";
export const RANGE_DAYS: Record<Range, number> = { "30d": 30, "90d": 90, "12m": 365 };

const DAY = 86_400_000;
const paying = (s: string) => s === "active" || s === "past_due";
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (now: number, before: number) => (before === 0 ? null : r2(((now - before) / before) * 100));

function periodStats(customers: MetricCustomer[], events: MetricEvent[], mrrNow: number, from: number, to: number, isNow: boolean) {
  const after = (t: number) => events.filter((e) => e.at.getTime() > t).reduce((s, e) => s + e.mrrDelta, 0);
  const mrrFrom = mrrNow - after(from);
  const mrrTo = mrrNow - after(to);
  const payingAt = (t: number) =>
    customers.filter((c) => c.convertedAt && c.convertedAt.getTime() <= t && (!c.churnedAt || c.churnedAt.getTime() > t)).length;
  const payingFrom = payingAt(from);
  const payingTo = isNow ? customers.filter((c) => paying(c.status)).length : payingAt(to);
  const inPeriod = events.filter((e) => e.at.getTime() > from && e.at.getTime() <= to);
  const churned = inPeriod.filter((e) => e.movement === "churn").length;
  // NRR only counts customers who were already paying when the period began.
  const existing = new Set(customers.filter((c) => c.convertedAt && c.convertedAt.getTime() <= from && (!c.churnedAt || c.churnedAt.getTime() > from)).map((c) => String(c._id)));
  const sum = (m: string) => inPeriod.filter((e) => e.movement === m && existing.has(String(e.customerId))).reduce((s, e) => s + e.mrrDelta, 0);
  const expansion = sum("expansion");
  const contraction = sum("contraction"); // negative
  const churnMrr = sum("churn"); // negative
  const months = (to - from) / (30 * DAY);
  return {
    mrr: r2(mrrTo),
    paying: payingTo,
    arpa: payingTo ? r2(mrrTo / payingTo) : 0,
    // Average monthly logo churn: churned accounts / average paying accounts / months
    churnRate: payingFrom + payingTo ? r2((churned / ((payingFrom + payingTo) / 2) / Math.max(months, 1)) * 100) : 0,
    nrr: mrrFrom > 0 ? r2(((mrrFrom + expansion + contraction + churnMrr) / mrrFrom) * 100) : null,
    mrrFrom: r2(mrrFrom),
  };
}

type Bucket = { label: string; start: number; end: number };

function buckets(range: Range, now: number): Bucket[] {
  const out: Bucket[] = [];
  if (range === "12m") {
    const d = new Date(now);
    for (let i = 11; i >= 0; i--) {
      const s = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1);
      const e = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i + 1, 1);
      out.push({ label: new Date(s).toLocaleString("en-US", { month: "short", timeZone: "UTC" }), start: s, end: Math.min(e, now) });
    }
  } else {
    const size = range === "90d" ? 7 * DAY : DAY;
    const count = range === "90d" ? 13 : 30;
    const endAligned = Math.ceil(now / DAY) * DAY;
    for (let i = count - 1; i >= 0; i--) {
      const e = endAligned - i * size;
      const s = e - size;
      out.push({ label: new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), start: s, end: Math.min(e, now) });
    }
  }
  return out;
}

export function computeMetrics(input: { customers: MetricCustomer[]; events: MetricEvent[]; range: Range; plan?: string; now?: number }) {
  const now = input.now ?? Date.now();
  const days = RANGE_DAYS[input.range];
  const plan = input.plan && input.plan !== "all" ? input.plan : null;
  const customers = plan ? input.customers.filter((c) => c.plan === plan) : input.customers;
  const events = plan ? input.events.filter((e) => e.plan === plan) : input.events;

  const mrrNow = customers.filter((c) => paying(c.status)).reduce((s, c) => s + c.mrr, 0);
  const current = periodStats(customers, events, mrrNow, now - days * DAY, now, true);
  const previous = periodStats(customers, events, mrrNow, now - 2 * days * DAY, now - days * DAY, false);

  const kpis = {
    mrr: { value: current.mrr, change: pct(current.mrr, previous.mrr) },
    nrr: { value: current.nrr, change: current.nrr !== null && previous.nrr !== null ? r2(current.nrr - previous.nrr) : null },
    churn: { value: current.churnRate, change: r2(current.churnRate - previous.churnRate) },
    arpa: { value: current.arpa, change: pct(current.arpa, previous.arpa) },
    paying: current.paying,
  };

  const after = (t: number) => events.filter((e) => e.at.getTime() > t).reduce((s, e) => s + e.mrrDelta, 0);
  const movement = buckets(input.range, now).map((b) => {
    const inB = events.filter((e) => e.at.getTime() > b.start && e.at.getTime() <= b.end);
    const sum = (...m: string[]) => r2(inB.filter((e) => e.movement && m.includes(e.movement)).reduce((s, e) => s + e.mrrDelta, 0));
    const row = { label: b.label, new: sum("new", "reactivation"), expansion: sum("expansion"), contraction: sum("contraction"), churn: sum("churn") };
    return { ...row, net: r2(row.new + row.expansion + row.contraction + row.churn), mrr: r2(mrrNow - after(b.end)) };
  });

  // Retention by conversion month: share of each cohort still paying N months later.
  const d = new Date(now);
  const cohorts = [];
  for (let i = 5; i >= 0; i--) {
    const s = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1);
    const e = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i + 1, 1);
    const members = customers.filter((c) => c.convertedAt && c.convertedAt.getTime() >= s && c.convertedAt.getTime() < e);
    const cells: (number | null)[] = [];
    for (let k = 0; k <= 5; k++) {
      const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i + k + 1, 1);
      if (k > i) { cells.push(null); continue; }
      const point = Math.min(at, now);
      const alive = members.filter((c) => !c.churnedAt || c.churnedAt.getTime() > point).length;
      cells.push(members.length ? Math.round((alive / members.length) * 100) : null);
    }
    cohorts.push({ label: new Date(s).toLocaleString("en-US", { month: "short", timeZone: "UTC" }), size: members.length, cells });
  }

  const topAccounts = customers
    .filter((c) => paying(c.status))
    .sort((a, b) => b.mrr - a.mrr)
    .slice(0, 6)
    .map((c) => ({ id: String(c._id), name: c.name, plan: c.plan, mrr: c.mrr, seats: c.seats, health: c.health, status: c.status }));

  const planMix = ["starter", "pro", "team", "enterprise"].map((p) => ({
    plan: p,
    mrr: r2(input.customers.filter((c) => c.plan === p && paying(c.status)).reduce((s, c) => s + c.mrr, 0)),
    customers: input.customers.filter((c) => c.plan === p && paying(c.status)).length,
  }));

  return { range: input.range, plan: plan ?? "all", generatedAt: new Date(now).toISOString(), kpis, movement, cohorts, topAccounts, planMix, today: today(input.events, now) };
}

/** The "Today" panel: last 24 hours plus an events-per-minute sparkline for the last hour. */
export function today(events: MetricEvent[], now = Date.now()) {
  const recent = events.filter((e) => e.at.getTime() > now - DAY);
  const upgrades = recent.filter((e) => e.movement === "expansion");
  const perMinute = Array.from({ length: 30 }, (_, i) => {
    const end = now - (29 - i) * 60_000;
    return recent.filter((e) => e.at.getTime() > end - 60_000 && e.at.getTime() <= end).length;
  });
  return {
    trials: recent.filter((e) => e.type === "customer.signed_up").length,
    upgrades: upgrades.length,
    upgradeMrr: r2(upgrades.reduce((s, e) => s + e.mrrDelta, 0)),
    churned: recent.filter((e) => e.movement === "churn").length,
    events: recent.length,
    perMinute,
  };
}

/** Quick KPIs after each live event, without reloading every event. */
export function liveKpis(customers: Pick<MetricCustomer, "mrr" | "status">[]) {
  const p = customers.filter((c) => paying(c.status));
  const mrr = r2(p.reduce((s, c) => s + c.mrr, 0));
  return { mrr, paying: p.length, arpa: p.length ? r2(mrr / p.length) : 0 };
}
