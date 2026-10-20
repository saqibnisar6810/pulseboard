import { createHash, randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { Membership, type Role } from "./models.js";

export type AuthContext = { userId: string; workspaceId: string; role: Role };

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}

export const signToken = (userId: string, workspaceId: string) =>
  jwt.sign({ sub: userId, ws: workspaceId }, config.jwtSecret, { expiresIn: "7d", algorithm: "HS256" });

export async function verifyToken(token: string): Promise<AuthContext | null> {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as { sub: string; ws: string };
    // Re-check membership on every request, so removing someone takes effect at once.
    const m = await Membership.findOne({ userId: payload.sub, workspaceId: payload.ws }).lean();
    return m ? { userId: payload.sub, workspaceId: payload.ws, role: m.role as Role } : null;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const auth = token ? await verifyToken(token) : null;
  if (!auth) return res.status(401).json({ error: "Please sign in again." });
  req.auth = auth;
  next();
}

const RANK: Record<Role, number> = { viewer: 0, admin: 1, owner: 2 };
export const requireRole = (min: Role) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth || RANK[req.auth.role] < RANK[min]) return res.status(403).json({ error: `This needs the ${min} role.` });
  next();
};
export const atLeast = (role: Role, min: Role) => RANK[role] >= RANK[min];

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = (prefix: string, bytes = 24) => `${prefix}${randomBytes(bytes).toString("base64url")}`;
