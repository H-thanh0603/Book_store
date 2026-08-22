// Agent 4: in-process scheduler. Seeds nightly jobs and ticks the queue on an
// interval so scheduled work (replenishment, loss scan, retries) runs without
// external cron. Runs once per server instance via Next's register hook.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { scheduleNightly, tickScheduler } = await import("./lib/jobs");
  // ponytail: interval in every server instance — fine for single-node deploy;
  // move to a dedicated worker/cron container when scaling horizontally.
  setInterval(() => {
    scheduleNightly()
      .then(() => tickScheduler())
      .catch((err) => console.error("[scheduler]", err));
  }, 5 * 60_000).unref();
}
