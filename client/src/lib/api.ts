export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:4000";

const TOKEN_KEY = "pulseboard.token";
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.json !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, body.error || `Request failed (${res.status})`);
  return body as T;
}

/** Downloads an authenticated file (CSV export). */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, "Export failed");
  const blob = await res.blob();
  const name = /filename="?([^"]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Free hosting sleeps when idle. This waits for the API to wake up. */
export async function waitForApi(onSlow: () => void, signal: AbortSignal) {
  const slow = setTimeout(onSlow, 1500);
  try {
    for (let i = 0; i < 40 && !signal.aborted; i++) {
      try {
        const res = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(8000) });
        if (res.ok && (await res.json()).db) return true;
      } catch { /* still waking */ }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  } finally {
    clearTimeout(slow);
  }
}
