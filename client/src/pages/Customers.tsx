import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Card, ErrorNote, HealthBar, StatusBadge } from "../components/ui";
import { api, download } from "../lib/api";
import { date, describe, money, PLAN_LABEL, STATUS_LABEL, timeAgo } from "../lib/format";
import type { Customer, LiveEvent } from "../lib/types";

type Page = { total: number; page: number; pageSize: number; items: Customer[] };

const SORTS = [["-mrr", "Highest MRR"], ["mrr", "Lowest MRR"], ["-signedUpAt", "Newest"], ["health", "Lowest health"], ["name", "Name A–Z"]] as const;

export function Customers() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const plan = params.get("plan") ?? "all";
  const status = params.get("status") ?? "all";
  const sort = params.get("sort") ?? "-mrr";
  const page = Number(params.get("page") ?? 1);
  const [search, setSearch] = useState(q);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);

  const query = new URLSearchParams({ q, plan, status, sort, page: String(page) }).toString();
  useEffect(() => {
    api<Page>(`/api/customers?${query}`).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message));
  }, [query]);

  // Debounced search box
  useEffect(() => {
    const t = setTimeout(() => { if (search !== q) set({ q: search, page: "1" }); }, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v && v !== "all" ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true });
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-extrabold tracking-tight">Customers</h1>
        {data && <span className="text-[14px] text-mu">{data.total.toLocaleString()} total</span>}
        <Button className="ml-auto" onClick={() => download(`/api/export/customers.csv?${new URLSearchParams({ q, plan, status, sort })}`, "customers.csv")}>Export CSV</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, domain or ID" aria-label="Search customers" className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-[14px] sm:max-w-xs" />
        <select aria-label="Plan" value={plan} onChange={(e) => set({ plan: e.target.value, page: "1" })} className="rounded-lg border border-line bg-white px-3 py-2 text-[14px]">
          <option value="all">All plans</option>{Object.entries(PLAN_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => set({ status: e.target.value, page: "1" })} className="rounded-lg border border-line bg-white px-3 py-2 text-[14px]">
          <option value="all">All statuses</option>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => set({ sort: e.target.value })} className="rounded-lg border border-line bg-white px-3 py-2 text-[14px]">
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] font-semibold tracking-wider text-mu uppercase">
                <th className="px-5 py-3">Account</th><th className="px-3">Plan</th><th className="px-3">Status</th><th className="px-3 text-right">MRR</th><th className="px-3 text-right">Seats</th><th className="px-3">Health</th><th className="px-5">Signed up</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((c) => (
                <tr key={c.id} onClick={() => setOpen(c.id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-page">
                  <td className="px-5 py-3">
                    <button onClick={(e) => { e.stopPropagation(); setOpen(c.id); }} className="text-left font-semibold hover:text-teal">{c.name}</button>
                    <div className="text-[12.5px] text-faint">{c.domain}</div>
                  </td>
                  <td className="px-3">{PLAN_LABEL[c.plan]}</td>
                  <td className="px-3"><StatusBadge status={c.status} label={STATUS_LABEL[c.status]} /></td>
                  <td className="tabular px-3 text-right">{money(c.mrr)}</td>
                  <td className="tabular px-3 text-right">{c.seats}</td>
                  <td className="px-3">{c.status === "churned" ? <span className="text-faint">—</span> : <HealthBar value={c.health} />}</td>
                  <td className="px-5 whitespace-nowrap text-mu">{date(c.signedUpAt)}</td>
                </tr>
              ))}
              {data && !data.items.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-mu">No customers match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13.5px] text-mu">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>Previous</Button>
            <Button variant="secondary" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Next</Button>
          </div>
        </div>
      </Card>

      {open && <CustomerDrawer id={open} onClose={close} />}
    </div>
  );
}

function CustomerDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<{ customer: Customer; events: LiveEvent[] } | null>(null);
  useEffect(() => { api<{ customer: Customer; events: LiveEvent[] }>(`/api/customers/${id}`).then(setData).catch(() => onClose()); }, [id, onClose]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const c = data?.customer;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={c?.name ?? "Customer"} onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[22px] font-extrabold">{c?.name ?? "…"}</h2>
            <div className="text-[13.5px] text-mu">{c?.domain} · <span className="font-mono text-[12.5px]">{c?.externalId}</span></div>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-[20px] text-mu hover:bg-page" aria-label="Close">×</button>
        </div>
        {c && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[["MRR", money(c.mrr)], ["Plan", PLAN_LABEL[c.plan]], ["Seats", String(c.seats)], ["Customer since", date(c.convertedAt ?? c.signedUpAt)]].map(([l, v]) => (
                <div key={l} className="rounded-xl border border-line p-3"><div className="text-[12.5px] text-mu">{l}</div><div className="tabular text-[18px] font-bold">{v}</div></div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3"><StatusBadge status={c.status} label={STATUS_LABEL[c.status]} />{c.status !== "churned" && <HealthBar value={c.health} />}</div>
            <h3 className="mt-6 mb-2 text-[15px] font-bold">Timeline</h3>
            <ol className="relative border-l border-line pl-4">
              {data!.events.map((e) => (
                <li key={e.id} className="mb-3">
                  <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-white bg-teal" />
                  <div className="text-[14px]">{describe(e)}</div>
                  <div className="text-[12.5px] text-faint">
                    {new Date(e.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {timeAgo(e.at)} ago
                    {e.mrrDelta !== 0 && <span className={`ml-2 font-semibold ${e.mrrDelta > 0 ? "text-teal" : "text-rose"}`}>{e.mrrDelta > 0 ? "+" : ""}{money(e.mrrDelta)} MRR</span>}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </aside>
    </div>
  );
}
