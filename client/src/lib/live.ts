import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { api, API_URL, getToken } from "./api";
import type { LiveEvent } from "./types";

type Kpis = { mrr: number; paying: number; arpa: number; at: string };
type Listener = { event: (e: LiveEvent) => void; kpis: (k: Kpis) => void; status: (connected: boolean) => void };

/**
 * Live updates for the current workspace. Two transports, same interface:
 *  - "poll" (default): asks /api/live every few seconds. Works on serverless hosts.
 *  - "socket": Socket.io push, for the long-running server (VITE_REALTIME=socket).
 */
const MODE = (import.meta.env.VITE_REALTIME as string | undefined) === "socket" ? "socket" : "poll";
const POLL_MS = 3000;

const listeners = new Set<Listener>();
let connected = false;
const setConnected = (v: boolean) => { connected = v; listeners.forEach((l) => l.status(v)); };
const seen = new Set<string>();
const emitEvent = (e: LiveEvent) => {
  if (seen.has(e.id)) return; // never deliver the same event twice
  seen.add(e.id);
  if (seen.size > 500) seen.delete(seen.values().next().value!);
  listeners.forEach((l) => l.event(e));
};
const emitKpis = (k: Kpis) => listeners.forEach((l) => l.kpis(k));

// ---------------------------------------------------------------- polling

let timer: ReturnType<typeof setTimeout> | null = null;
let cursor: string | null | undefined;
let generation = 0;

async function poll(gen: number) {
  if (gen !== generation) return;
  if (document.visibilityState === "visible") {
    try {
      const q = cursor ? `?after=${cursor}` : "";
      const r = await api<{ cursor: string | null; events: LiveEvent[]; kpis: Kpis | null }>(`/api/live${q}`);
      if (gen !== generation) return;
      cursor = r.cursor ?? cursor;
      r.events.forEach(emitEvent);
      if (r.kpis) emitKpis(r.kpis);
      if (!connected) setConnected(true);
    } catch {
      if (gen === generation && connected) setConnected(false);
    }
  }
  if (gen === generation) timer = setTimeout(() => poll(gen), POLL_MS);
}

const startPolling = () => { if (!timer) { cursor = undefined; poll(generation); } };
const stopPolling = () => { generation++; if (timer) clearTimeout(timer); timer = null; cursor = undefined; connected = false; };

// ----------------------------------------------------------------- socket

let socket: Socket | null = null;
let socketStarting: Promise<void> | null = null;
function startSocket() {
  socketStarting ??= import("socket.io-client").then(({ io }) => {
    const s = io(API_URL, { auth: { token: getToken() }, transports: ["websocket", "polling"] });
    s.on("event", emitEvent);
    s.on("kpis", emitKpis);
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    socket = s;
  });
  return socketStarting;
}
const stopSocket = () => {
  const s = socket;
  socket = null;
  connected = false;
  if (s) s.disconnect();
  else socketStarting?.then(() => { socket?.disconnect(); socket = null; });
  socketStarting = null;
};

// ------------------------------------------------------------------- hook

/** Subscribes to live events and headline numbers for the current workspace. */
export function useLive(onEvent?: (e: LiveEvent) => void) {
  const [isConnected, setIsConnected] = useState(connected);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const l: Listener = { event: (e) => handler.current?.(e), kpis: setKpis, status: setIsConnected };
    listeners.add(l);
    setIsConnected(connected);
    if (MODE === "socket") startSocket();
    else startPolling();
    return () => {
      listeners.delete(l);
      if (!listeners.size && MODE === "poll") stopPolling();
    };
  }, []);

  return { connected: isConnected, kpis };
}

/** Call when the signed-in user or workspace changes. */
export const disconnectLive = () => {
  stopSocket();
  stopPolling();
  // Dashboards that stay mounted pick up the new session shortly after.
  setTimeout(() => {
    if (!listeners.size) return;
    if (MODE === "socket") startSocket();
    else startPolling();
  }, 1000);
};
