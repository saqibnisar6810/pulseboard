import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { newToken, sha256, signToken } from "../auth.js";
import { config } from "../config.js";
import { Customer, Event, Invite, Membership, User, Workspace, type Role } from "../models.js";
import { generateDemoData, rng } from "./demo.js";

export function newApiKey() {
  const key = newToken("pk_", 24);
  return { key, hash: sha256(key), prefix: key.slice(0, 10) };
}

export async function createWorkspace(name: string, ownerId: Types.ObjectId, opts: { demo?: boolean } = {}) {
  const api = newApiKey();
  const ws = await Workspace.create({
    name,
    isDemo: Boolean(opts.demo),
    expiresAt: opts.demo ? new Date(Date.now() + config.demoTtlHours * 3_600_000) : null,
    apiKeyHash: api.hash,
    apiKeyPrefix: api.prefix,
  });
  await Membership.create({ workspaceId: ws._id, userId: ownerId, role: "owner" });
  return ws;
}

/** One click: a private sandbox with a year of data and two fake teammates. */
export async function createDemoSandbox() {
  const r = rng(Date.now());
  const tag = new Types.ObjectId().toString().slice(-8);
  const user = await User.create({ email: `demo-${tag}@demo.pulseboard.dev`, name: "Demo User", isDemo: true });
  const ws = await createWorkspace("Orbit Apps", user._id, { demo: true });
  const mates: [string, Role][] = [["Maya Chen", "admin"], ["Leo Park", "viewer"]];
  for (const [name, role] of mates) {
    const mate = await User.create({ email: `${name.split(" ")[0].toLowerCase()}-${tag}@demo.pulseboard.dev`, name, isDemo: true });
    await Membership.create({ workspaceId: ws._id, userId: mate._id, role });
  }
  const stats = await generateDemoData(ws._id, r.int(1, 1e9));
  return { token: signToken(String(user._id), String(ws._id)), workspaceId: String(ws._id), stats };
}

export async function signUp(input: { name: string; email: string; password: string; workspaceName: string; sampleData: boolean }) {
  const exists = await User.exists({ email: input.email.toLowerCase() });
  if (exists) return { error: "An account with this email already exists." as const };
  const user = await User.create({ email: input.email, name: input.name, passwordHash: await bcrypt.hash(input.password, 10) });
  const ws = await createWorkspace(input.workspaceName, user._id);
  if (input.sampleData) await generateDemoData(ws._id);
  return { token: signToken(String(user._id), String(ws._id)) };
}

export async function logIn(email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase() });
  // Same message either way, so the form doesn't reveal which emails exist.
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) return null;
  const m = await Membership.findOne({ userId: user._id }).sort({ createdAt: 1 });
  if (!m) return null;
  return signToken(String(user._id), String(m.workspaceId));
}

/** Deletes demo sandboxes past their expiry, with everything in them. */
export async function cleanupExpired() {
  const expired = await Workspace.find({ isDemo: true, expiresAt: { $lt: new Date() } }, { _id: 1 }).lean();
  const ids = expired.map((w) => w._id);
  if (!ids.length) return 0;
  await Promise.all([
    Customer.deleteMany({ workspaceId: { $in: ids } }),
    Event.deleteMany({ workspaceId: { $in: ids } }),
    Invite.deleteMany({ workspaceId: { $in: ids } }),
  ]);
  const members = await Membership.find({ workspaceId: { $in: ids } }, { userId: 1 }).lean();
  await Membership.deleteMany({ workspaceId: { $in: ids } });
  await Workspace.deleteMany({ _id: { $in: ids } });
  // Demo users that no longer belong anywhere
  for (const { userId } of members) {
    if (!(await Membership.exists({ userId }))) await User.deleteOne({ _id: userId, isDemo: true });
  }
  return ids.length;
}
