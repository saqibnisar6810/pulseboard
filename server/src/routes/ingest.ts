import { Router } from "express";
import { z } from "zod";
import { sha256 } from "../auth.js";
import { applyEvent, EventError, IncomingEvent } from "../domain/apply.js";
import { Workspace } from "../models.js";
import { publicEvent } from "./app.js";
import { rateLimit } from "../vendor.js";

/**
 * Public ingestion API. Your app sends subscription events here:
 *   curl -X POST $API/api/v1/events -H "Authorization: Bearer pk_..." -d '{...}'
 */
export const ingestRoutes = Router();

ingestRoutes.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => (req.headers.authorization ?? "").slice(-16) || "anon", message: { error: "Rate limit: 300 requests per minute." } }));

ingestRoutes.post("/events", async (req, res) => {
  const header = req.headers.authorization ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const workspace = key.startsWith("pk_") ? await Workspace.findOne({ apiKeyHash: sha256(key) }, { _id: 1 }).lean() : null;
  if (!workspace) return res.status(401).json({ error: "Invalid API key." });

  const body = z.union([z.object({ events: z.array(IncomingEvent).min(1).max(100) }), IncomingEvent]).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid event.", details: z.flattenError(body.error) });
  const list = "events" in body.data ? body.data.events : [body.data];

  const results = [];
  for (const [i, ev] of list.entries()) {
    try {
      const { event } = await applyEvent(workspace._id, ev, "api");
      results.push({ index: i, ok: true, event: publicEvent(event) });
    } catch (e) {
      if (!(e instanceof EventError)) throw e;
      results.push({ index: i, ok: false, error: e.message });
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  res.status(failed === list.length ? 422 : failed ? 207 : 201).json({ accepted: list.length - failed, failed, results });
});
