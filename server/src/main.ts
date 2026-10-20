import { createServer } from "node:http";
import mongoose from "mongoose";
import { allowedOrigins, config } from "./config.js";
import { tick } from "./domain/simulator.js";
import { cleanupExpired } from "./domain/workspaces.js";
import app, { connectDb } from "./index.js";
import { startRealtime, watchedWorkspaces } from "./realtime.js";

/**
 * Long-running server (Docker, Render, a VM): the same API plus a Socket.io
 * live feed, a demo simulator on a timer, and a periodic sandbox sweep.
 */
async function main() {
  await connectDb();
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
