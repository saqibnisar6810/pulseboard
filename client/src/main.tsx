import "@fontsource-variable/figtree";
import "./index.css";
import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Logo } from "./components/ui";
import { waitForApi } from "./lib/api";
import { SessionProvider, useSession } from "./lib/session";
import { Customers } from "./pages/Customers";
import { Events } from "./pages/Events";
import { Join } from "./pages/Join";
import { Login } from "./pages/Login";
import { Revenue } from "./pages/Revenue";
import { Settings } from "./pages/Settings";

/** Free hosting sleeps when idle; explain the short wait instead of showing a broken page. */
function WakeGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "waking" | "ready" | "down">("checking");
  useEffect(() => {
    const ctl = new AbortController();
    waitForApi(() => setState((s) => (s === "checking" ? "waking" : s)), ctl.signal).then((ok) => setState(ok ? "ready" : "down"));
    return () => ctl.abort();
  }, []);
  if (state === "ready") return <>{children}</>;
  if (state === "checking") return null;
  return (
    <div className="grid min-h-screen place-items-center bg-sage px-6 text-center">
      <div className="max-w-sm">
        <div className="flex justify-center"><Logo size={44} /></div>
        <h1 className="mt-4 text-[22px] font-extrabold">{state === "down" ? "The demo server isn't responding" : "Starting the demo server…"}</h1>
        <p className="mt-2 text-[15px] text-[#33443e]">
          {state === "down" ? "Please try again in a minute." : "The first visit can take a few seconds while the server starts."}
        </p>
        {state === "waking" && <div className="mx-auto mt-5 h-1.5 w-48 overflow-hidden rounded-full bg-white/70"><div className="h-full w-1/3 animate-[pulse-bar_1.2s_ease-in-out_infinite] rounded-full bg-teal" /></div>}
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  const loc = useLocation();
  if (loading) return null;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

function App() {
  const { me, loading } = useSession();
  return (
    <Routes>
      <Route path="/login" element={loading ? null : me ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/join/:token" element={<Join />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Revenue />} />
        <Route path="customers" element={<Customers />} />
        <Route path="events" element={<Events />} />
        <Route path="settings/:tab?" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WakeGate>
      <BrowserRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </WakeGate>
  </StrictMode>,
);
