import { useEffect, useState } from "react";
import { NavLink, useParams, useSearchParams } from "react-router-dom";
import { Button, Card, ErrorNote } from "../components/ui";
import { api, API_URL } from "../lib/api";
import { can, useSession } from "../lib/session";
import type { Role } from "../lib/types";

const TABS = [["general", "General"], ["team", "Team"], ["api", "API"], ["billing", "Billing"]] as const;

export function Settings() {
  const { tab = "general" } = useParams();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-[28px] font-extrabold tracking-tight">Settings</h1>
      <nav className="flex gap-1 rounded-lg bg-[#e9eeec] p-1" aria-label="Settings">
        {TABS.map(([id, label]) => (
          <NavLink key={id} to={`/settings/${id}`} className={() => `flex-1 rounded-md px-3 py-1.5 text-center text-[14px] font-semibold ${tab === id ? "bg-white shadow-sm" : "text-mu hover:text-ink"}`}>{label}</NavLink>
        ))}
      </nav>
      {tab === "general" && <General />}
      {tab === "team" && <Team />}
      {tab === "api" && <ApiKey />}
      {tab === "billing" && <Billing />}
    </div>
  );
}

function ReadOnlyNote({ role }: { role?: Role }) {
  return role === "viewer" ? <p className="rounded-lg bg-[#eef1f0] px-3 py-2 text-[13.5px] text-mu">You're a viewer in this workspace, so these settings are read-only.</p> : null;
}

function General() {
  const { me, refresh } = useSession();
  const [name, setName] = useState(me?.workspace.name ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = can(me?.role, "admin");
  return (
    <Card className="space-y-4 p-6">
      <ReadOnlyNote role={me?.role} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try { await api("/api/workspace", { method: "PATCH", json: { name } }); await refresh(); setMsg("Saved."); } catch (err) { setError((err as Error).message); }
        }}
        className="space-y-3"
      >
        <label className="block text-[14px] font-semibold" htmlFor="wsname">Workspace name</label>
        <div className="flex gap-2">
          <input id="wsname" value={name} disabled={!editable} onChange={(e) => { setName(e.target.value); setMsg(null); }} className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-[14px] disabled:bg-page" />
          <Button disabled={!editable || !name.trim()}>Save</Button>
        </div>
        {msg && <p className="text-[13.5px] text-teal">{msg}</p>}
        {error && <ErrorNote>{error}</ErrorNote>}
      </form>
      <div className="border-t border-line pt-4 text-[13.5px] text-mu">
        Your role: <b className="text-ink capitalize">{me?.role}</b>. Owners manage billing and roles, admins manage settings and invites, viewers can look at everything but change nothing.
      </div>
    </Card>
  );
}

type Members = { members: { userId: string; name: string; email: string; role: Role; you: boolean }[]; invites: { id: string; email: string; role: string; expiresAt: string }[] };

function Team() {
  const { me } = useSession();
  const [data, setData] = useState<Members | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "admin">("viewer");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api<Members>("/api/members").then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const isOwner = me?.role === "owner";
  const isAdmin = can(me?.role, "admin");

  const act = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } };

  return (
    <div className="space-y-5">
      {error && <ErrorNote>{error}</ErrorNote>}
      <Card>
        <ul>
          {data?.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5 last:border-0">
              <div className="grid size-9 place-items-center rounded-full bg-teal-soft text-[13px] font-bold text-teal">{m.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{m.name} {m.you && <span className="text-[12.5px] font-normal text-mu">(you)</span>}</div>
                <div className="truncate text-[13px] text-mu">{m.email}</div>
              </div>
              {isOwner && !m.you && m.role !== "owner" ? (
                <select aria-label={`Role for ${m.name}`} value={m.role} onChange={(e) => act(() => api(`/api/members/${m.userId}`, { method: "PATCH", json: { role: e.target.value } }))} className="rounded-lg border border-line px-2 py-1.5 text-[13.5px]">
                  <option value="admin">Admin</option><option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className="rounded-full bg-[#eef1f0] px-2.5 py-1 text-[12.5px] font-semibold capitalize">{m.role}</span>
              )}
              {isAdmin && !m.you && m.role !== "owner" && (isOwner || m.role === "viewer") && (
                <Button variant="ghost" onClick={() => act(() => api(`/api/members/${m.userId}`, { method: "DELETE" }))}>Remove</Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {isAdmin ? (
        <Card className="space-y-3 p-5">
          <h2 className="text-[16px] font-bold">Invite a teammate</h2>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => { e.preventDefault(); act(async () => { const r = await api<{ link: string }>("/api/invites", { method: "POST", json: { email, role } }); setLink(r.link); setEmail(""); }); }}
          >
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" aria-label="Email" className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-[14px]" />
            <select value={role} onChange={(e) => setRole(e.target.value as "viewer" | "admin")} aria-label="Role" className="rounded-lg border border-line px-3 py-2 text-[14px]">
              <option value="viewer">Viewer</option>
              {isOwner && <option value="admin">Admin</option>}
            </select>
            <Button>Create invite</Button>
          </form>
          {link && (
            <div className="rounded-lg bg-teal-soft p-3 text-[13.5px]">
              Share this link (valid 7 days). They sign in or try the demo, then join this workspace:
              <div className="mt-1.5 flex gap-2">
                <input readOnly value={link} className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1 font-mono text-[12px]" onFocus={(e) => e.target.select()} />
                <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(link)}>Copy</Button>
              </div>
            </div>
          )}
          {!!data?.invites.length && (
            <ul className="text-[13.5px]">
              {data.invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 border-t border-line py-2">
                  <span className="flex-1">{i.email} · <span className="capitalize text-mu">{i.role}</span> · pending</span>
                  <Button variant="ghost" onClick={() => act(() => api(`/api/invites/${i.id}`, { method: "DELETE" }))}>Revoke</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : <ReadOnlyNote role={me?.role} />}
    </div>
  );
}

function ApiKey() {
  const { me, refresh } = useSession();
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = can(me?.role, "admin");
  return (
    <Card className="space-y-4 p-6">
      <ReadOnlyNote role={me?.role} />
      <div>
        <h2 className="text-[16px] font-bold">Ingestion API key</h2>
        <p className="mt-1 text-[13.5px] text-mu">Your backend uses this key to send subscription events. Only a hash is stored, so the full key is shown once.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-page px-3 py-2 font-mono text-[13px]">{key ?? `${me?.workspace.apiKeyPrefix}••••••••••••••••`}</code>
        {key && <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(key)}>Copy</Button>}
        <Button disabled={!editable} onClick={async () => { setError(null); try { const r = await api<{ key: string }>("/api/workspace/api-key", { method: "POST" }); setKey(r.key); await refresh(); } catch (e) { setError((e as Error).message); } }}>
          {key ? "Create another" : "Create new key"}
        </Button>
      </div>
      {key && <p className="text-[13px] text-amber">Copy it now. The old key stopped working.</p>}
      {error && <ErrorNote>{error}</ErrorNote>}
      <pre className="overflow-x-auto rounded-lg bg-ink p-3 text-[12px] leading-relaxed text-[#cfe5df]">{`curl -X POST ${API_URL}/api/v1/events \\
  -H "Authorization: Bearer ${key ?? "pk_..."}" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"customer.signed_up","customer":{"id":"cus_1","name":"Acme"}}'`}</pre>
    </Card>
  );
}

type BillingInfo = { enabled: boolean; testMode: boolean; plan: string; status: string; prices: Record<string, { name: string; cents: number }> };

function Billing() {
  const { me } = useSession();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const result = params.get("checkout");
  useEffect(() => { api<BillingInfo>("/api/billing").then(setInfo).catch((e) => setError(e.message)); }, []);
  const owner = me?.role === "owner";

  const checkout = async (plan: string) => {
    setBusy(true); setError(null);
    try { const r = await api<{ url: string }>("/api/billing/checkout", { method: "POST", json: { plan } }); window.location.href = r.url; } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <Card className="space-y-4 p-6">
      {result === "success" && <p className="rounded-lg bg-teal-soft px-3 py-2 text-[13.5px] text-teal">Payment received. Your plan updates as soon as Stripe confirms it (a few seconds).</p>}
      {result === "cancelled" && <p className="rounded-lg bg-[#eef1f0] px-3 py-2 text-[13.5px] text-mu">Checkout cancelled. Nothing was charged.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[16px] font-bold">PulseBoard plan</h2>
        <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-[12.5px] font-semibold capitalize text-teal">{info?.plan ?? "…"}</span>
        {info?.status === "canceling" && <span className="text-[13px] text-amber">Cancels at period end</span>}
        {info?.testMode && <span className="ml-auto rounded-full bg-amber-soft px-2.5 py-0.5 text-[12px] font-semibold text-[#a15f00]">Stripe test mode</span>}
      </div>
      {info && !info.enabled && <p className="text-[13.5px] text-mu">Billing isn't connected on this server. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to turn on Stripe Checkout.</p>}
      {info?.enabled && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(info.prices).map(([id, p]) => (
              <div key={id} className={`rounded-xl border p-4 ${info.plan === id ? "border-teal bg-teal-soft/40" : "border-line"}`}>
                <div className="font-bold">{p.name}</div>
                <div className="tabular text-[24px] font-extrabold">${p.cents / 100}<span className="text-[14px] font-medium text-mu">/mo</span></div>
                <Button className="mt-3 w-full" disabled={!owner || busy || info.plan === id} onClick={() => checkout(id)}>{info.plan === id ? "Current plan" : "Upgrade"}</Button>
              </div>
            ))}
          </div>
          {info.testMode && <p className="text-[13px] text-mu">Test mode: pay with card <code className="font-mono">4242 4242 4242 4242</code>, any future date and any CVC. No real money moves.</p>}
          {owner && info.plan !== "free" && info.status !== "canceling" && (
            <Button variant="danger" onClick={async () => { try { await api("/api/billing/cancel", { method: "POST" }); setInfo(await api<BillingInfo>("/api/billing")); } catch (e) { setError((e as Error).message); } }}>Cancel plan</Button>
          )}
          {!owner && <p className="text-[13.5px] text-mu">Only the workspace owner can change the plan.</p>}
        </>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </Card>
  );
}
