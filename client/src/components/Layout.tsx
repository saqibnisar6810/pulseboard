import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { disconnectLive } from "../lib/live";
import { useSession } from "../lib/session";
import { Logo } from "./ui";

const LINKS = [
  { to: "/", label: "Revenue", end: true },
  { to: "/customers", label: "Customers" },
  { to: "/events", label: "Events" },
  { to: "/settings", label: "Settings" },
];

function initials(name = "") {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export function Layout() {
  const { me, signOut, switchWorkspace } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState<"ws" | "user" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!me) return null;
  const hoursLeft = me.workspace.expiresAt ? Math.max(0, Math.round((Date.parse(me.workspace.expiresAt) - Date.now()) / 3_600_000)) : null;

  return (
    <div className="min-h-screen">
      {me.workspace.isDemo && (
        <div className="bg-ink px-4 py-2 text-center text-[13px] text-[#cfe5df]">
          You're in a private demo sandbox with sample data. New events stream in live every few seconds. It's deleted in about {hoursLeft} h.
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div ref={menuRef} className="mx-auto flex h-16 max-w-[1280px] items-center gap-4 px-4 sm:gap-7 sm:px-6">
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5 text-[19px] font-extrabold tracking-tight">
            <Logo size={30} />
            <span className="hidden sm:inline">PulseBoard</span>
          </NavLink>
          <nav className="-mb-px flex h-full min-w-0 items-stretch gap-3.5 overflow-x-auto sm:gap-6" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => `flex items-center border-b-[2.5px] text-[14px] font-semibold sm:text-[14.5px] whitespace-nowrap ${isActive ? "border-ink text-ink" : "border-transparent text-mu hover:text-ink"}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="relative ml-auto hidden shrink-0 md:block">
            <button onClick={() => setOpen(open === "ws" ? null : "ws")} className="rounded-lg border border-line px-3 py-1.5 text-[13.5px] font-semibold hover:bg-page" aria-haspopup="menu" aria-expanded={open === "ws"}>
              {me.workspace.name} ▾
            </button>
            {open === "ws" && (
              <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-white p-1.5 shadow-lg">
                {me.workspaces.map((w) => (
                  <button key={w.id} role="menuitem" onClick={async () => { setOpen(null); if (w.id !== me.workspace.id) { disconnectLive(); await switchWorkspace(w.id); navigate("/"); } }} className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[14px] hover:bg-page">
                    {w.name}
                    {w.id === me.workspace.id && <span className="ml-auto text-teal">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative shrink-0 max-md:ml-auto">
            <button onClick={() => setOpen(open === "user" ? null : "user")} className="grid size-9 place-items-center rounded-full bg-[#f2c9a8] text-[13px] font-bold text-[#5b3a1f]" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open === "user"}>
              {initials(me.user.name)}
            </button>
            {open === "user" && (
              <div role="menu" className="absolute right-0 mt-2 w-60 rounded-xl border border-line bg-white p-1.5 shadow-lg">
                <div className="px-3 py-2">
                  <div className="text-[14px] font-semibold">{me.user.name}</div>
                  <div className="truncate text-[12.5px] text-mu">{me.workspace.name} · {me.role}</div>
                </div>
                <button role="menuitem" onClick={() => { disconnectLive(); signOut(); navigate("/login"); }} className="w-full rounded-lg px-3 py-2 text-left text-[14px] hover:bg-page">
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
