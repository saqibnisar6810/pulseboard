import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { verifyToken } from "./auth.js";
import { config } from "./config.js";
import { onEventApplied } from "./domain/apply.js";
import { liveKpis } from "./domain/metrics.js";
import { Customer } from "./models.js";
import { publicEvent } from "./routes/app.js";

export let io: Server;

/** Workspaces with at least one open dashboard. */
export const watchedWorkspaces = () =>
  [...io.of("/").adapter.rooms.keys()].filter((k) => k.startsWith("ws:")).map((k) => k.slice(3));

export function startRealtime(server: HttpServer, origins: string[]) {
  io = new Server(server, { cors: { origin: origins }, serveClient: false });

  io.use(async (socket, next) => {
    const token = String(socket.handshake.auth?.token ?? "");
    const auth = await verifyToken(token);
    if (!auth) return next(new Error("unauthorized"));
    socket.data.auth = auth;
    next();
  });

  io.on("connection", (socket) => {
    socket.join(`ws:${socket.data.auth.workspaceId}`);
  });

  // Push every applied event, plus fresh headline numbers, to open dashboards.
  const pending = new Map<string, NodeJS.Timeout>();
  onEventApplied((workspaceId, event) => {
    io.to(`ws:${workspaceId}`).emit("event", publicEvent(event));
    if (pending.has(workspaceId)) return; // KPIs at most once a second per workspace
    pending.set(workspaceId, setTimeout(async () => {
      pending.delete(workspaceId);
      const customers = await Customer.find({ workspaceId }, { mrr: 1, status: 1 }).lean();
      io.to(`ws:${workspaceId}`).emit("kpis", { ...liveKpis(customers), at: new Date().toISOString() });
    }, 1000));
  });
}

export const allowedOrigins = () => [config.appUrl, "http://localhost:5173", "http://127.0.0.1:5173"];
