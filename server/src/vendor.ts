import type { RequestHandler } from "express";
import * as rateLimitModule from "express-rate-limit";
import type { Options as RateLimitOptions, RateLimitRequestHandler } from "express-rate-limit";
import * as helmetModule from "helmet";

/**
 * helmet and express-rate-limit ship a CommonJS build whose types use an ES default
 * export. Depending on the compiler's module mode (Vercel's build uses its own), a
 * plain default import is typed as the module object, so resolve the function here.
 */
const pickDefault = <T>(mod: unknown): T => ((mod as { default?: unknown }).default ?? mod) as T;

export const helmet = pickDefault<() => RequestHandler>(helmetModule);
export const rateLimit = pickDefault<(options?: Partial<RateLimitOptions>) => RateLimitRequestHandler>(rateLimitModule);
