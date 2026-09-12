#!/usr/bin/env tsx
// Standalone job worker (WS1.2 / REL-001): runs the scheduler tick loop OUTSIDE
// the Next.js HTTP processes, so job load never competes with checkouts and a
// dead web worker can't stall all background work.
//
// Run:  pm2 start ecosystem.config.js --only bookstore-worker --env production
//       (or: npx tsx scripts/worker.ts)
// Env:  JOB_TICK_MS (default 5 min), JOB_LEASE_MS (default 5 min, see lib/jobs).
//
// The web app should then set JOB_SCHEDULER_ENABLED=false (already the
// documented flag in instrumentation.ts) so only this process schedules.
// DB claims keep a transitional double-scheduler safe but wasteful.
import { scheduleNightly, tickScheduler, pruneFinishedRuns } from "../src/lib/jobs";
import { pruneRateLimits } from "../src/lib/rate-limit";
import { pruneExpiredSessions, pruneExpiredResetTokens } from "../src/lib/auth";

const TICK_MS = Number(process.env.JOB_TICK_MS ?? 5 * 60_000);
let stopped = false;

async function tick() {
  try {
    await scheduleNightly();
    await tickScheduler();
    await Promise.all([
      pruneRateLimits(),
      pruneExpiredSessions(),
      pruneExpiredResetTokens(),
      pruneFinishedRuns(),
    ]);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "worker_tick_error", message: String(err) }));
  }
}

async function main() {
  console.log(JSON.stringify({ level: "info", event: "worker_start", tickMs: TICK_MS }));
  await tick();
  while (!stopped) {
    await new Promise((r) => setTimeout(r, TICK_MS));
    if (!stopped) await tick();
  }
  console.log(JSON.stringify({ level: "info", event: "worker_stop" }));
}

process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT", () => { stopped = true; });

main().catch((err) => {
  console.error(JSON.stringify({ level: "error", event: "worker_fatal", message: String(err) }));
  process.exit(1);
});
