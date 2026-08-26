// Agent 4: in-process scheduler. Seeds nightly jobs and ticks the queue on an
// interval so scheduled work (replenishment, loss scan, retries) runs without
// external cron.
//
// Multi-instance gate: DB claims make duplicate timers SAFE but wasteful — every
// instance would wake up and race for the same JobRun rows. By default only the
// first PM2 cluster worker (NODE_APP_INSTANCE=0) schedules; single-node deploys
// have no NODE_APP_INSTANCE and behave exactly as before. Override freely:
//   JOB_SCHEDULER_ENABLED=false → never schedule here (drive /api/jobs from external cron)
//   JOB_SCHEDULER_ENABLED=true  → always schedule (e.g. a dedicated worker instance)
export function schedulerEnabled(): boolean {
  const flag = process.env.JOB_SCHEDULER_ENABLED;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_APP_INSTANCE === undefined || process.env.NODE_APP_INSTANCE === "0";
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!schedulerEnabled()) {
    console.log(JSON.stringify({ level: "info", event: "scheduler_disabled", instance: process.env.NODE_APP_INSTANCE ?? null }));
    return;
  }
  const { scheduleNightly, tickScheduler, pruneFinishedRuns } = await import("./lib/jobs");
  const { pruneRateLimits } = await import("./lib/rate-limit");
  const { pruneExpiredSessions, pruneExpiredResetTokens } = await import("./lib/auth");
  const tick = () => scheduleNightly()
    .then(() => tickScheduler())
    .then(() => Promise.all([pruneRateLimits(), pruneExpiredSessions(), pruneExpiredResetTokens(), pruneFinishedRuns()]))
    .catch((err) => console.error(JSON.stringify({ level: "error", event: "scheduler_error", message: String(err) })));
  void tick();
  // Database claims make duplicate timers safe; use a dedicated worker when job load warrants it.
  setInterval(tick, 5 * 60_000).unref();
}
