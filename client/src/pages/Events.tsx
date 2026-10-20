import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, LiveBadge } from "../components/ui";
import { api, API_URL } from "../lib/api";
import { describe, eventTone, money, timeAgo } from "../lib/format";
import { useLive } from "../lib/live";
import { useSession } from "../lib/session";
import type { LiveEvent } from "../lib/types";

const TYPES = ["all", "customer.signed_up", "subscription.started", "subscription.changed", "subscription.canceled", "payment.failed", "payment.succeeded"];
const TONE: Record<string, string> = { teal: "bg-teal", teal2: "bg-teal-2", amber: "bg-amber", rose: "bg-rose", mu: "bg-faint" };

export function Events() {
  const { me } = useSession();
  const [type, setType] = useState("all");
  const [items, setItems] = useState<LiveEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [queued, setQueued] = useState<LiveEvent[]>([]);
  const [now, setNow] = useState(Date.now());
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => { api<{ items: LiveEvent[] }>(`/api/events?limit=60&type=${type}`).then((r) => setItems(r.items)).catch(() => {}); }, [type]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const { connected } = useLive((e) => {
    if (type !== "all" && e.type !== type) return;
    if (pausedRef.current) setQueued((q) => [e, ...q]);
    else setItems((list) => (list.some((x) => x.id === e.id) ? list : [e, ...list].slice(0, 200)));
  });

  const resume = () => { setItems((list) => [...queued, ...list].slice(0, 200)); setQueued([]); setPaused(false); };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-extrabold tracking-tight">Events</h1>
          <LiveBadge connected={connected} text={paused ? "Paused" : "Streaming"} />
          <div className="ml-auto flex gap-2">
            <select aria-label="Event type" value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2 text-[14px]">
              {TYPES.map((t) => <option key={t} value={t}>{t === "all" ? "All events" : t}</option>)}
            </select>
            <Button variant="secondary" onClick={() => (paused ? resume() : setPaused(true))}>{paused ? `Resume${queued.length ? ` (${queued.length} new)` : ""}` : "Pause"}</Button>
          </div>
        </div>
        <Card>
          <ul aria-live={paused ? "off" : "polite"}>
            {items.map((e) => (
              <li key={e.id} className="flash flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                <span className={`size-2.5 shrink-0 rounded-full ${TONE[eventTone(e)]}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px]">{describe(e)}</div>
                  <div className="font-mono text-[12px] text-faint">{e.type}{e.source === "api" ? " · via API" : ""}</div>
                </div>
                {e.mrrDelta !== 0 && <span className={`tabular text-[13.5px] font-semibold ${e.mrrDelta > 0 ? "text-teal" : "text-rose"}`}>{e.mrrDelta > 0 ? "+" : "−"}{money(Math.abs(e.mrrDelta))}</span>}
                <span className="tabular w-10 text-right text-[12.5px] text-faint">{timeAgo(e.at, now)}</span>
              </li>
            ))}
            {!items.length && <li className="px-5 py-10 text-center text-mu">No events yet.</li>}
          </ul>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <h2 className="text-[16px] font-bold">Send events from your app</h2>
          <p className="mt-1 text-[13.5px] text-mu">
            PulseBoard works from six subscription events. Post them from your backend (or a Stripe webhook handler) and the dashboard updates for everyone instantly.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-ink p-3 text-[11.5px] leading-relaxed text-[#cfe5df]">{`curl -X POST ${API_URL}/api/v1/events \\
  -H "Authorization: Bearer ${me?.workspace.apiKeyPrefix ?? "pk_"}…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "subscription.started",
    "customer": { "id": "cus_42", "name": "Acme" },
    "plan": "pro", "mrr": 99, "seats": 4
  }'`}</pre>
          <p className="mt-3 text-[13px] text-mu">
            Your full API key is shown once when you create it in <Link to="/settings/api" className="font-semibold text-teal hover:underline">Settings → API</Link>.
          </p>
        </Card>
        <Card className="p-5 text-[13.5px]">
          <h2 className="text-[15px] font-bold">Event types</h2>
          <dl className="mt-2 space-y-1.5">
            {[["customer.signed_up", "A trial starts"], ["subscription.started", "First payment, or a churned customer returns"], ["subscription.changed", "Plan or seat change (expansion / contraction)"], ["subscription.canceled", "Churn"], ["payment.failed", "Moves the account to past due"], ["payment.succeeded", "Recovers a past-due account"]].map(([t, d]) => (
              <div key={t}><dt className="font-mono text-[12px]">{t}</dt><dd className="text-mu">{d}</dd></div>
            ))}
          </dl>
        </Card>
      </aside>
    </div>
  );
}
