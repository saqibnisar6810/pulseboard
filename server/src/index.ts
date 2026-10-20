import { createServer } from "node:http";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { sha256 } from "./auth.js";
import { config } from "./config.js";
import { tick } from "./domain/simulator.js";
import { cleanupExpired } from "./domain/workspaces.js";
import { Invite, Workspace } from "./models.js";
import { allowedOrigins, startRealtime, watchedWorkspaces } from "./realtime.js";
import { appRoutes } from "./routes/app.js";
import { authRoutes } from "./routes/auth.js";
import { billingRoutes, stripeWebhook } from "./routes/billing.js";
import { ingestRoutes } from "./routes/ingest.js";

const app = express();
app.set("trust proxy", 1); // behind Render's proxy: real client IPs for rate limits
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: allowedOrigins(), exposedHeaders: ["Content-Disposition"] }));

// Stripe needs the raw body, so its route comes before the JSON parser.
app.use("/api/stripe/webhook", stripeWebhook);
app.use(express.json({ limit: "200kb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.get("/api/invites/:token", async (req, res) => {
  const inv = await Invite.findOne({ tokenHash: sha256(String(req.params.token)), acceptedAt: null, expiresAt: { $gt: new Date() } }).lean();
  if (!inv) return res.status(404).json({ error: "This invite has expired or was already used." });
  const w = await Workspace.findById(inv.workspaceId, { name: 1 }).lean();
  res.json({ workspace: w?.name, role: inv.role, email: inv.email });
});
app.use("/api/auth", authRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/v1", ingestRoutes);
app.use("/api", appRoutes);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side." });
});

async function main() {
  await mongoose.connect(config.mongoUrl, { serverSelectionTimeoutMS: 15_000 });
  await mongoose.connection.syncIndexes().catch((e) => console.warn("Index sync:", e.message));
  const server = createServer(app);
  startRealtime(server, allowedOrigins());
  server.listen(config.port, () => console.log(`PulseBoard API on :${config.port}`));

  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    await tick(watchedWorkspaces()).finally(() => (busy = false));
  }, config.simulatorSeconds * 1000);

  const sweep = () => cleanupExpired().then((n) => n && console.log(`Removed ${n} expired demo workspaces`)).catch(console.error);
  sweep();
  setInterval(sweep, 30 * 60_000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
