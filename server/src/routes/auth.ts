import { Router } from "express";
import { z } from "zod";
import { requireAuth, signToken } from "../auth.js";
import { Membership, User, Workspace } from "../models.js";
import { cleanupExpired, createDemoSandbox, logIn, signUp } from "../domain/workspaces.js";
import { rateLimit } from "../vendor.js";

export const authRoutes = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts. Try again in a few minutes." } });
const demoLimiter = rateLimit({ windowMs: 60 * 60_000, limit: Number(process.env.DEMO_PER_HOUR || 8), standardHeaders: true, legacyHeaders: false, message: { error: "You've opened a lot of demos this hour. Try again later." } });

const SignUp = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(200),
  password: z.string().min(8).max(200),
  workspaceName: z.string().trim().min(1).max(80),
  sampleData: z.boolean().default(true),
});

authRoutes.post("/signup", authLimiter, async (req, res) => {
  const parsed = SignUp.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check the form: a valid email and a password of 8+ characters." });
  const result = await signUp(parsed.data);
  if ("error" in result) return res.status(409).json({ error: result.error });
  res.status(201).json(result);
});

authRoutes.post("/login", authLimiter, async (req, res) => {
  const parsed = z.object({ email: z.string().max(200), password: z.string().max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter your email and password." });
  const token = await logIn(parsed.data.email, parsed.data.password);
  if (!token) return res.status(401).json({ error: "Wrong email or password." });
  res.json({ token });
});

let lastSweep = 0;
authRoutes.post("/demo", demoLimiter, async (_req, res) => {
  // Serverless hosts have no background timer, so expired sandboxes are swept here too.
  if (Date.now() - lastSweep > 30 * 60_000) {
    lastSweep = Date.now();
    await cleanupExpired().catch((e) => console.error("cleanup", e));
  }
  const demo = await createDemoSandbox();
  res.status(201).json(demo);
});

authRoutes.get("/me", requireAuth, async (req, res) => {
  const { userId, workspaceId, role } = req.auth!;
  const [user, workspace, memberships] = await Promise.all([
    User.findById(userId, { name: 1, email: 1, isDemo: 1 }).lean(),
    Workspace.findById(workspaceId).lean(),
    Membership.find({ userId }).lean(),
  ]);
  const others = await Workspace.find({ _id: { $in: memberships.map((m) => m.workspaceId) } }, { name: 1 }).lean();
  res.json({
    user: { id: userId, name: user?.name, email: user?.email, isDemo: user?.isDemo },
    workspace: {
      id: workspaceId, name: workspace?.name, isDemo: workspace?.isDemo, expiresAt: workspace?.expiresAt,
      billingPlan: workspace?.billingPlan, apiKeyPrefix: workspace?.apiKeyPrefix,
    },
    role,
    workspaces: others.map((w) => ({ id: String(w._id), name: w.name })),
  });
});

authRoutes.post("/switch", requireAuth, async (req, res) => {
  const id = String(req.body?.workspaceId ?? "");
  const m = await Membership.findOne({ userId: req.auth!.userId, workspaceId: id }).lean().catch(() => null);
  if (!m) return res.status(404).json({ error: "Workspace not found." });
  res.json({ token: signToken(req.auth!.userId, id) });
});
