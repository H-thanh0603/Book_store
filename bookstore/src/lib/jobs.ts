// Agent 4: background job runner — run ledger, retries with backoff, failed-job visibility.
import { prisma } from "./db";
import { scanLossPrevention } from "./loss-prevention";
import { generateReplenishmentSuggestions } from "./replenishment";

export const JOB_KINDS = {
  "replenishment.generate": generateReplenishmentSuggestions,
  "loss.scan": scanLossPrevention,
  // ponytail: integration dispatch is inline today (integrations route runs jobs on
  // request); add a real queue consumer here when a connector pushes work.
} as const;

export type JobKind = keyof typeof JOB_KINDS;

/**
 * Run one job kind under the JobRun ledger: attempts++, RUNNING while in flight,
 * FAILED + exponential backoff (nextRunAt) on error, SUCCEEDED otherwise.
 * Retries happen when the scheduler tick finds FAILED/PENDING runs past nextRunAt.
 */
export async function runJob(kind: JobKind) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.jobRun.create({ data: { kind, status: "RUNNING", attempts: 1, startedAt: new Date() } });
    try {
      const result = await JOB_KINDS[kind]();
      return await tx.jobRun.update({
        where: { id: run.id },
        data: { status: "SUCCEEDED", finishedAt: new Date(), result: { count: Array.isArray(result) ? result.length : null } },
      });
    } catch (err) {
      // ponytail: single-node scheduler — no row lock; duplicate ticks possible if
      // scaled horizontally. Add SELECT ... FOR UPDATE SKIP LOCKED then.
      const current = await tx.jobRun.findUniqueOrThrow({ where: { id: run.id } });
      const exhausted = current.attempts >= current.maxAttempts;
      return await tx.jobRun.update({
        where: { id: run.id },
        data: {
          status: exhausted ? "FAILED" : "PENDING",
          finishedAt: exhausted ? new Date() : null,
          error: err instanceof Error ? err.message : String(err),
          nextRunAt: new Date(Date.now() + Math.min(2 ** current.attempts, 60) * 60_000),
        },
      });
    }
  });
}

/** One scheduler tick: due PENDING runs (retries included) execute sequentially. */
export async function tickScheduler() {
  const due = await prisma.jobRun.findMany({
    where: { status: "PENDING", nextRunAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" }, take: 10,
  });
  const ran = [];
  for (const run of due) if (run.kind in JOB_KINDS) ran.push(await runJob(run.kind as JobKind));
  return ran;
}

/**
 * Nightly schedule seed: enqueue today's recurring jobs if none is pending for them.
 * Called by the instrumentation interval; safe to call repeatedly (idempotent).
 */
const NIGHTLY: JobKind[] = ["replenishment.generate", "loss.scan"];

export async function scheduleNightly() {
  const created = [];
  for (const kind of NIGHTLY) {
    const pending = await prisma.jobRun.count({ where: { kind, status: { in: ["PENDING", "RUNNING"] } } });
    if (pending === 0)
      created.push(await prisma.jobRun.create({ data: { kind, nextRunAt: new Date(Date.now() + 60_000) } }));
  }
  return created;
}
