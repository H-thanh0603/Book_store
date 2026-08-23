// Agent 4: in-process scheduler. Seeds nightly jobs and ticks the queue on an
// interval so scheduled work (replenishment, loss scan, retries) runs without
// external cron. Runs once per server instance via Next's register hook.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { scheduleNightly, tickScheduler } = await import("./lib/jobs");
  const { pruneRateLimits } = await import("./lib/rate-limit");
  const { pruneExpiredSessions } = await import("./lib/auth");
  const tick = () => scheduleNightly()
    .then(() => tickScheduler())
    .then(() => Promise.all([pruneRateLimits(), pruneExpiredSessions()]))
    .catch((err) => console.error(JSON.stringify({ level: "error", event: "scheduler_error", message: String(err) })));
  void tick();
  // Database claims make duplicate timers safe; use a dedicated worker when job load warrants it.
  setInterval(tick, 5 * 60_000).unref();
}
