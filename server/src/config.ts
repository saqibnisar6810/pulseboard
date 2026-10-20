import "dotenv/config";

const required = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing environment variable ${name}`);
  return v;
};

const isProd = process.env.NODE_ENV === "production";

export const config = {
  port: Number(process.env.PORT || 4000),
  isProd,
  mongoUrl: required("MONGODB_URI", isProd ? undefined : "mongodb://127.0.0.1:27017/pulseboard"),
  jwtSecret: required("JWT_SECRET", isProd ? undefined : "dev-only-secret-change-me"),
  /** Where the React app lives (CORS + links in invites and Stripe redirects). */
  appUrl: (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, ""),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  /** Demo sandboxes are deleted after this many hours. */
  demoTtlHours: Number(process.env.DEMO_TTL_HOURS || 24),
  /** Seconds between simulated events in demo workspaces that someone is watching. */
  simulatorSeconds: Number(process.env.SIMULATOR_SECONDS || 3),
};
