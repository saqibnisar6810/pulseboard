import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { sha256 } from "./auth.js";
import { allowedOrigins, config, maskMongoUri } from "./config.js";
import { Invite, Workspace } from "./models.js";
import { appRoutes } from "./routes/app.js";
import { authRoutes } from "./routes/auth.js";
import { billingRoutes, stripeWebhook } from "./routes/billing.js";
import { ingestRoutes } from "./routes/ingest.js";

/**
 * The HTTP API. This module only builds the Express app, so it runs both as a
 * serverless function (Vercel imports the default export) and inside the
 * long-running server in main.ts (which adds Socket.io and timers).
 */

let connecting: Promise<unknown> | null = null;
export function connectDb() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connecting) {
    console.log(`Connecting to ${maskMongoUri(config.mongoUrl)}`);
    connecting = mongoose.connect(config.mongoUrl, { serverSelectionTimeoutMS: 15_000, maxPoolSize: 5 }).catch((e) => {
      connecting = null; // let the next request try again
      throw e;
    });
  }
  return connecting;
}

const app = express();
app.set("trust proxy", 1); // behind the host's proxy: real client IPs for rate limits
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: allowedOrigins(), exposedHeaders: ["Content-Disposition"] }));

app.use(async (_req, _res, next) => {
  try {
    await connectDb();
    next();
  } catch (e) {
    next(e);
  }
});

// Stripe needs the raw body, so its route comes before the JSON parser.
app.use("/api/stripe/webhook", stripeWebhook);
app.use(express.json({ limit: "200kb" }));

app.get("/", (_req, res) => res.json({ name: "PulseBoard API", health: "/api/health" }));
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

export { app };
export default app;
