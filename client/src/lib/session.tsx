import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";
import type { Me } from "./types";

type Session = {
  me: Me | null;
  loading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) { setMe(null); setLoading(false); return; }
    try { setMe(await api<Me>("/api/auth/me")); } catch { setMe(null); } finally { setLoading(false); }
  }, []);

  const signOut = useCallback(() => { setToken(null); setMe(null); }, []);
  const signIn = useCallback(async (token: string) => { setToken(token); setLoading(true); await refresh(); }, [refresh]);
  const switchWorkspace = useCallback(async (id: string) => {
    const { token } = await api<{ token: string }>("/api/auth/switch", { method: "POST", json: { workspaceId: id } });
    await signIn(token);
  }, [signIn]);

  useEffect(() => { setUnauthorizedHandler(signOut); refresh(); }, [refresh, signOut]);

  return <Ctx.Provider value={{ me, loading, signIn, signOut, refresh, switchWorkspace }}>{children}</Ctx.Provider>;
}

export const useSession = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside provider");
  return s;
};

export const can = (role: string | undefined, min: "admin" | "owner") =>
  role === "owner" || (min === "admin" && role === "admin");
