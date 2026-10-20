import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, ErrorNote, Logo } from "../components/ui";
import { api } from "../lib/api";
import { useSession } from "../lib/session";

export function Login() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", workspaceName: "", sampleData: true });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"demo" | "form" | null>(null);

  const go = async (token: string) => { await signIn(token); navigate(next, { replace: true }); };

  const demo = async () => {
    setBusy("demo"); setError(null);
    try { const r = await api<{ token: string }>("/api/auth/demo", { method: "POST" }); await go(r.token); } catch (e) { setError((e as Error).message); setBusy(null); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("form"); setError(null);
    try {
      const r = mode === "login"
        ? await api<{ token: string }>("/api/auth/login", { method: "POST", json: { email: form.email, password: form.password } })
        : await api<{ token: string }>("/api/auth/signup", { method: "POST", json: form });
      await go(r.token);
    } catch (err) { setError((err as Error).message); setBusy(null); }
  };

  const field = (k: keyof typeof form) => ({ value: form[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="flex flex-col justify-between bg-sage px-6 py-8 sm:px-12 sm:py-12">
        <div className="flex items-center gap-2.5 text-[20px] font-extrabold"><Logo size={32} /> PulseBoard</div>
        <div className="my-10 max-w-xl">
          <h1 className="text-[36px] leading-[1.08] font-extrabold tracking-tight sm:text-[46px]">Revenue and usage analytics for SaaS teams, updating live.</h1>
          <p className="mt-4 text-[17px] text-[#33443e]">MRR, churn, net revenue retention and cohort retention from your subscription events, with a live feed of every signup, upgrade and cancellation.</p>
          <ul className="mt-6 grid gap-2 text-[15px] text-[#33443e] sm:grid-cols-2">
            {["Live updates over WebSockets", "Owner, admin and viewer roles", "Events API for your backend", "Stripe billing (test mode)", "CSV export of any report", "Private demo with a year of data"].map((t) => (
              <li key={t} className="flex gap-2"><span className="text-teal">✓</span>{t}</li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-[#5c6a65]">A portfolio project built with React, Node.js/Express, MongoDB and Socket.io.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <Button className="w-full py-3 text-[15px]" onClick={demo} disabled={busy !== null}>
            {busy === "demo" ? "Building your demo workspace…" : "Try the live demo →"}
          </Button>
          <p className="mt-2 text-center text-[13px] text-mu">No sign-up. You get a private sandbox with sample data.</p>

          <div className="my-6 flex items-center gap-3 text-[12px] text-faint"><span className="h-px flex-1 bg-line" />or use an account<span className="h-px flex-1 bg-line" /></div>

          <div className="mb-4 flex rounded-lg bg-[#e9eeec] p-0.5">
            {(["login", "signup"] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(null); }} className={`flex-1 rounded-md py-1.5 text-[14px] font-semibold ${mode === m ? "bg-white shadow-sm" : "text-mu"}`}>{m === "login" ? "Sign in" : "Create account"}</button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <>
                <input required placeholder="Your name" aria-label="Your name" autoComplete="name" className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[14px]" {...field("name")} />
                <input required placeholder="Company / workspace name" aria-label="Workspace name" className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[14px]" {...field("workspaceName")} />
              </>
            )}
            <input required type="email" placeholder="Email" aria-label="Email" autoComplete="email" className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[14px]" {...field("email")} />
            <input required type="password" minLength={mode === "signup" ? 8 : undefined} placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"} aria-label="Password" autoComplete={mode === "signup" ? "new-password" : "current-password"} className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[14px]" {...field("password")} />
            {mode === "signup" && (
              <label className="flex items-center gap-2 text-[13.5px] text-mu">
                <input type="checkbox" checked={form.sampleData} onChange={(e) => setForm({ ...form, sampleData: e.target.checked })} className="accent-[#0F766E]" />
                Fill my workspace with sample data
              </label>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button variant="secondary" className="w-full py-2.5" disabled={busy !== null}>{busy === "form" ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}</Button>
          </form>
        </div>
      </section>
    </div>
  );
}
