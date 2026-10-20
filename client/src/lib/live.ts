import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, getToken } from "./api";
import type { LiveEvent } from "./types";

type Kpis = { mrr: number; paying: number; arpa: number; at: string };
let socket: Socket | null = null;
let socketToken: string | null = null;

function connect() {
  const token = getToken();
  if (socket && socketToken === token) return socket;
  socket?.disconnect();
  socketToken = token;
  socket = io(API_URL, { auth: { token }, transports: ["websocket", "polling"] });
  return socket;
}

/** Subscribes to live events and headline numbers for the current workspace. */
export function useLive(onEvent?: (e: LiveEvent) => void) {
  const [connected, setConnected] = useState(false);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const s = connect();
    const ev = (e: LiveEvent) => handler.current?.(e);
    const k = (x: Kpis) => setKpis(x);
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on("event", ev);
    s.on("kpis", k);
    s.on("connect", on);
    s.on("disconnect", off);
    setConnected(s.connected);
    return () => { s.off("event", ev); s.off("kpis", k); s.off("connect", on); s.off("disconnect", off); };
  }, []);

  return { connected, kpis };
}

export const disconnectLive = () => { socket?.disconnect(); socket = null; socketToken = null; };
