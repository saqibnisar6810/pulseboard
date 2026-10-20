export type Role = "owner" | "admin" | "viewer";
export type Range = "30d" | "90d" | "12m";
export type Plan = "starter" | "pro" | "team" | "enterprise";

export type Me = {
  user: { id: string; name: string; email: string; isDemo: boolean };
  workspace: { id: string; name: string; isDemo: boolean; expiresAt: string | null; billingPlan: string; apiKeyPrefix: string };
  role: Role;
  workspaces: { id: string; name: string }[];
};

export type Kpi = { value: number | null; change: number | null };
export type Metrics = {
  range: Range;
  plan: string;
  generatedAt: string;
  kpis: { mrr: Kpi; nrr: Kpi; churn: Kpi; arpa: Kpi; paying: number };
  movement: { label: string; new: number; expansion: number; contraction: number; churn: number; net: number; mrr: number }[];
  cohorts: { label: string; size: number; cells: (number | null)[] }[];
  topAccounts: { id: string; name: string; plan: string; mrr: number; seats: number; health: number; status: string }[];
  planMix: { plan: string; mrr: number; customers: number }[];
  today: { trials: number; upgrades: number; upgradeMrr: number; churned: number; events: number; perMinute: number[] };
};

export type LiveEvent = {
  id: string; type: string; customerId: string; customerName: string; plan: string;
  movement: string | null; mrrDelta: number; mrrAfter: number; amount: number | null; source: string; at: string;
};

export type Customer = {
  id: string; externalId: string; name: string; domain?: string; plan: Plan; mrr: number; seats: number;
  status: "trialing" | "active" | "past_due" | "churned"; health: number; signedUpAt: string; convertedAt: string | null; churnedAt: string | null;
};
