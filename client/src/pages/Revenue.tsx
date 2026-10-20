import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHead, ErrorNote, HealthBar, LiveBadge, Segmented, StatusBadge } from "../components/ui";
import { api, download } from "../lib/api";
import { compactMoney, describe, eventTone, money, PLAN_LABEL, pct, STATUS_LABEL, timeAgo } from "../lib/format";
import { useLive } from "../lib/live";
import type { LiveEvent, Metrics, Range } from "../lib/types";

const COLORS = { new: "#0F766E", expansion: "#5EB8AE", contraction: "#E08A12", churn: "#D9485F" };
const PLANS = [["all", "All plans"], ["starter", "Starter"], ["pro", "Pro"], ["team", "Team"], ["enterprise", "Enterprise"]] as const;
const TONE: Record<string, string> = { teal: "bg-teal", teal2: "bg-teal-2", amber: "bg-amber", rose: "bg-rose", mu: "bg-faint" };

function Change({ value, unit = "%", invert = false, suffix }: { value: number | null; unit?: string; invert?: boolean; suffix: string }) {
  if (value === null) return <span className="text-[13px] text-faint">No earlier data</span>;
  const good = invert ? value <= 0 : value >= 0;
  return (
    <span className={`text-[13px] font-semibold ${good ? "text-teal" : "text-rose"}`}>
      {value >= 0 ? "+" : "−"}{Math.abs(value).toFixed(1)}{unit} {suffix}
    </span>
  );
}

function Kpi({ label, value, children, flash }: { label: string; value: string; children: React.ReactNode; flash?: number }) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="text-[13.5px] text-mu">{label}</div>
      <div key={flash} className={`tabular mt-1 text-[30px] font-bold leading-tight tracking-tight ${flash ? "flash rounded-md" : ""}`}>{value}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function MovementTip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number; payload: Metrics["movement"][number] }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] shadow-md">
      <div className="mb-1 font-bold">{label}</div>
      {(["new", "expansion", "contraction", "churn"] as const).map((k) => (
        <div key={k} className="flex justify-between gap-6"><span className="capitalize text-mu">{k}</span><span className="tabular font-semibold">{money(row[k])}</span></div>
      ))}
      <div className="mt-1 flex justify-between gap-6 border-t border-line pt-1"><span className="text-mu">Net</span><span className="tabular font-bold">{money(row.net)}</span></div>
      <div className="flex justify-between gap-6"><span className="text-mu">MRR at end</span><span className="tabular font-bold">{money(row.mrr)}</span></div>
    </div>
  );
}

function cohortColor(v: number) {
  const a = 0.15 + (v / 100) * 0.85;
  return { background: `rgba(15,118,110,${a})`, color: v > 55 ? "#fff" : "#0e1a16" };
}

export function Revenue() {
  const [range, setRange] = useState<Range>("12m");
  const [plan, setPlan] = useState("all");
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<LiveEvent[]>([]);
  const [today, setToday] = useState<Metrics["today"] | null>(null);
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const load = useCallback(async (quiet = false) => {
    try {
      const m = await api<Metrics>(`/api/metrics?range=${range}&plan=${plan}`);
      setData(m);
      setToday(m.today);
      setLastUpdate(Date.now());
      if (!quiet) setError(null);
    } catch (e) {
      if (!quiet) setError((e as Error).message);
    }
  }, [range, plan]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => load(true), 45_000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { api<{ items: LiveEvent[] }>("/api/events?limit=8").then((r) => setFeed(r.items)).catch(() => {}); }, []);

  const { connected, kpis } = useLive((e) => {
    setFeed((f) => [e, ...f].slice(0, 8));
    setLastUpdate(Date.now());
    setToday((t) => t && {
      ...t,
      events: t.events + 1,
      trials: t.trials + (e.type === "customer.signed_up" ? 1 : 0),
      upgrades: t.upgrades + (e.movement === "expansion" ? 1 : 0),
      upgradeMrr: t.upgradeMrr + (e.movement === "expansion" ? e.mrrDelta : 0),
      perMinute: [...t.perMinute.slice(0, -1), t.perMinute[t.perMinute.length - 1] + 1],
    });
  });

  // Live MRR from the socket, when looking at all plans
  const liveMrr = plan === "all" && kpis ? kpis.mrr : null;
  useEffect(() => { if (liveMrr !== null) setFlash((f) => f + 1); }, [liveMrr]);

  const k = data?.kpis;
  const suffix = range === "12m" ? "vs last year" : range === "90d" ? "vs prior 90 days" : "vs prior 30 days";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-extrabold tracking-tight">Revenue</h1>
          <LiveBadge connected={connected} text={`Live · updated ${now - lastUpdate < 5000 ? "just now" : `${timeAgo(new Date(lastUpdate).toISOString(), now)} ago`}`} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="plan">Plan</label>
            <select id="plan" value={plan} onChange={(e) => setPlan(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-1.5 text-[13.5px] font-semibold">
              {PLANS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <Segmented label="Date range" value={range} onChange={setRange} options={[{ value: "30d", label: "30d" }, { value: "90d", label: "90d" }, { value: "12m", label: "12m" }]} />
            <button onClick={() => download(`/api/export/mrr.csv?range=${range}&plan=${plan}`, "mrr.csv")} className="rounded-lg bg-ink px-3.5 py-1.5 text-[13.5px] font-semibold text-white hover:bg-[#1f2f29]">
              Export CSV
            </button>
          </div>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line lg:grid-cols-4">
          <Kpi label="MRR" value={k ? money(liveMrr ?? k.mrr.value) : "…"} flash={liveMrr !== null ? flash : undefined}>{k && <Change value={k.mrr.change} suffix={suffix} />}</Kpi>
          <Kpi label="Net revenue retention" value={k ? pct(k.nrr.value, 0) : "…"}>{k && <Change value={k.nrr.change} unit=" pts" suffix={suffix} />}</Kpi>
          <Kpi label="Customer churn (monthly)" value={k ? pct(k.churn.value) : "…"}>{k && <Change value={k.churn.change} unit=" pts" invert suffix={suffix} />}</Kpi>
          <Kpi label="Avg. revenue / account" value={k ? money(plan === "all" && kpis ? kpis.arpa : k.arpa.value, 2) : "…"}>{k && <Change value={k.arpa.change} suffix={suffix} />}</Kpi>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <Card>
            <CardHead title="MRR movement">
              {(["new", "expansion", "contraction", "churn"] as const).map((key) => (
                <span key={key} className="flex items-center gap-1.5 text-[12.5px] capitalize text-mu"><span className="size-2.5 rounded-sm" style={{ background: COLORS[key] }} />{key}</span>
              ))}
            </CardHead>
            <div className="h-[290px] px-2 pb-3">
              {data && (
                <ResponsiveContainer>
                  <BarChart data={data.movement} stackOffset="sign" margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid vertical={false} stroke="#edf1ef" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#5c6a65" }} interval="preserveStartEnd" minTickGap={8} />
                    <YAxis tickFormatter={compactMoney} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#8b9792" }} width={52} />
                    <ReferenceLine y={0} stroke="#9aa6a1" />
                    <Tooltip content={<MovementTip />} cursor={{ fill: "#f1f5f3" }} />
                    <Bar dataKey="new" stackId="m" fill={COLORS.new} />
                    <Bar dataKey="expansion" stackId="m" fill={COLORS.expansion} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="contraction" stackId="m" fill={COLORS.contraction} />
                    <Bar dataKey="churn" stackId="m" fill={COLORS.churn} radius={[0, 0, 3, 3]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Retention by start month" />
            <div className="overflow-x-auto px-5 pb-5">
              <table className="w-full border-separate border-spacing-[3px] text-[12px]">
                <thead>
                  <tr className="text-faint">
                    <th className="text-left font-medium" />
                    {["M0", "M1", "M2", "M3", "M4", "M5"].map((m) => <th key={m} className="font-medium">{m}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data?.cohorts.map((c) => (
                    <tr key={c.label}>
                      <th className="pr-2 text-left font-medium whitespace-nowrap text-mu">{c.label} <span className="text-faint">({c.size})</span></th>
                      {c.cells.map((v, i) => (
                        <td key={i} className="tabular h-8 min-w-10 rounded text-center font-semibold" style={v === null ? { background: "#f1f4f3" } : cohortColor(v)}>
                          {v === null ? "" : `${v}%`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[12.5px] text-faint">Share of customers who started paying that month and still pay N months later.</p>
            </div>
          </Card>
        </div>

        <Card>
          <CardHead title="Top accounts"><Link to="/customers" className="text-[13.5px] font-semibold text-teal hover:underline">All customers →</Link></CardHead>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead>
                <tr className="border-y border-line text-left text-[12px] font-semibold tracking-wider text-mu uppercase">
                  <th className="px-5 py-2.5">Account</th><th className="px-3">Plan</th><th className="px-3 text-right">MRR</th><th className="px-3 text-right">Seats</th><th className="px-5">Health</th>
                </tr>
              </thead>
              <tbody>
                {data?.topAccounts.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-semibold">{a.name} {a.status === "past_due" && <StatusBadge status="past_due" label={STATUS_LABEL.past_due} />}</td>
                    <td className="px-3">{PLAN_LABEL[a.plan]}</td>
                    <td className="tabular px-3 text-right">{money(a.mrr)}</td>
                    <td className="tabular px-3 text-right">{a.seats}</td>
                    <td className="px-5"><HealthBar value={a.health} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Today rail (shown first on phones via order) */}
      <aside className="space-y-4 max-xl:order-first">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold">Today</h2>
            <LiveBadge connected={connected} text="Live" />
          </div>
          <div className="mt-3 rounded-xl border border-line p-3.5">
            <div className="text-[13px] text-mu">Events, last 5 minutes</div>
            <div className="tabular text-[30px] font-bold">{today ? today.perMinute.slice(-5).reduce((a, b) => a + b, 0) : "…"}</div>
            <div className="h-14">
              {today && (
                <ResponsiveContainer>
                  <AreaChart data={today.perMinute.map((v, i) => ({ i, v }))} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <Area type="monotone" dataKey="v" stroke="#0F766E" strokeWidth={2} fill="#e3f1ee" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line p-3">
              <div className="text-[13px] text-mu">New trials</div>
              <div className="tabular text-[24px] font-bold">{today?.trials ?? "…"}</div>
              <div className="text-[12.5px] font-semibold text-teal">last 24 h</div>
            </div>
            <div className="rounded-xl border border-line p-3">
              <div className="text-[13px] text-mu">Upgrades</div>
              <div className="tabular text-[24px] font-bold">{today?.upgrades ?? "…"}</div>
              <div className="text-[12.5px] font-semibold text-teal">+{money(today?.upgradeMrr ?? 0)}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between"><h2 className="text-[16px] font-bold">Live feed</h2><Link to="/events" className="text-[13px] font-semibold text-teal hover:underline">All events</Link></div>
          <ul className="mt-2" aria-live="polite">
            {feed.map((e) => (
              <li key={e.id} className="flash flex items-center gap-2.5 rounded-md py-1.5 text-[13.5px]">
                <span className={`size-2 shrink-0 rounded-full ${TONE[eventTone(e)]}`} />
                <span className="min-w-0 flex-1 truncate">{describe(e)}</span>
                <span className="tabular shrink-0 text-[12px] text-faint">{timeAgo(e.at, now)}</span>
              </li>
            ))}
            {!feed.length && <li className="py-2 text-[13.5px] text-mu">No events yet.</li>}
          </ul>
        </Card>
      </aside>
    </div>
  );
}
