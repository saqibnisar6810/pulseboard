import "dotenv/config";

const required = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing environment variable ${name}`);
  return v;
};

const isProd = process.env.NODE_ENV === "production";

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

/**
 * Accepts a connection string whose password was pasted raw (with @ : / % etc.)
 * and percent-encodes the credentials, as the MongoDB driver requires.
 */
export function normalizeMongoUri(raw: string) {
  const uri = raw.trim().replace(/^['"]|['"]$/g, "");
  const m = uri.match(/^(mongodb(?:\+srv)?:\/\/)(.*)$/);
  if (!m) return uri;
  const [, scheme, rest] = m;
  const slash = rest.indexOf("/", rest.lastIndexOf("@") + 1);
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  const at = authority.lastIndexOf("@");
  if (at === -1) return uri;
  const creds = authority.slice(0, at);
  const colon = creds.indexOf(":");
  const user = colon === -1 ? creds : creds.slice(0, colon);
  const pass = colon === -1 ? null : creds.slice(colon + 1);
  const enc = (s: string) => encodeURIComponent(safeDecode(s));
  return `${scheme}${enc(user)}${pass === null ? "" : `:${enc(pass)}`}@${rest.slice(at + 1)}`;
}

/** For logs: the connection string with the password hidden. */
export const maskMongoUri = (uri: string) => uri.replace(/(\/\/[^:/@]+:)[^@]*@/, "$1****@");

export const config = {
  port: Number(process.env.PORT || 4000),
  isProd,
  mongoUrl: normalizeMongoUri(required("MONGODB_URI", isProd ? undefined : "mongodb://127.0.0.1:27017/pulseboard")),
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
