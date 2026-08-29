// Agent 4: background job runner — run ledger, retries with backoff, failed-job visibility.
import { prisma } from "./db";
import { scanLossPrevention } from "./loss-prevention";
import { generateReplenishmentSuggestions } from "./replenishment";
import { expireStaleReservations } from "./order-expiry";
import { issuePendingInvoices, pollPendingInvoices } from "./einvoice-jobs";
import { processPendingDeliveries } from "./webhook-bus";
import { randomUUID } from "crypto";

export const JOB_KINDS = {
  "replenishment.generate": generateReplenishmentSuggestions,
  "loss.scan": scanLossPrevention,
  "order.expire_reservations": expireStaleReservations,
  "einvoice.issue": issuePendingInvoices,
  "einvoice.poll": pollPendingInvoices,
  "webhook.deliver": processPendingDeliveries,
  // ponytail: integration dispatch is inline today (integrations route runs jobs on
  // request); add a real queue consumer here when a connector pushes work.
} as const;

export type JobKind = keyof typeof JOB_KINDS;
const WORKER_ID = `${process.env.HOSTNAME ?? "local"}:${randomUUID()}`;
const LEASE_MS = 30 * 60_000;

/**
 * Run one job kind under the JobRun ledger: attempts++, RUNNING while in flight,
 * FAILED + exponential backoff (nextRunAt) on error, SUCCEEDED otherwise.
 * Retries happen when the scheduler tick finds FAILED/PENDING runs past nextRunAt.
 */
export async function runJob(kind: JobKind, runId?: string) {
  const run = runId
    ? await prisma.$transaction(async (tx) => {
      const claimed = await tx.jobRun.updateMany({
        where: {
          id: runId, kind,
          OR: [
            { status: "PENDING", nextRunAt: { lte: new Date() } },
            { status: "RUNNING", leaseExpiresAt: { lt: new Date() } },
          ],
        },
        data: {
          status: "RUNNING", attempts: { increment: 1 }, startedAt: new Date(),
          leaseExpiresAt: new Date(Date.now() + LEASE_MS), workerId: WORKER_ID,
          finishedAt: null, error: null,
        },
      });
      return claimed.count === 1 ? tx.jobRun.findUniqueOrThrow({ where: { id: runId } }) : null;
    })
    : await prisma.jobRun.create({ data: {
      kind, status: "RUNNING", attempts: 1, startedAt: new Date(), workerId: WORKER_ID,
      leaseExpiresAt: new Date(Date.now() + LEASE_MS),
    } });
  if (!run) return null;

  try {
    const result = await JOB_KINDS[kind]();
    await prisma.jobRun.updateMany({
      where: { id: run.id, status: "RUNNING", workerId: WORKER_ID },
      data: {
        status: "SUCCEEDED", finishedAt: new Date(), leaseExpiresAt: null, workerId: null,
        result: { count: Array.isArray(result) ? result.length : null },
      },
    });
    return prisma.jobRun.findUnique({ where: { id: run.id } });
  } catch (err) {
    const exhausted = run.attempts >= run.maxAttempts;
    await prisma.jobRun.updateMany({
      where: { id: run.id, status: "RUNNING", workerId: WORKER_ID },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        finishedAt: exhausted ? new Date() : null,
        error: err instanceof Error ? err.message : String(err),
        nextRunAt: new Date(Date.now() + Math.min(2 ** run.attempts, 60) * 60_000),
        leaseExpiresAt: null, workerId: null,
      },
    });
    return prisma.jobRun.findUnique({ where: { id: run.id } });
  }
}

/** One scheduler tick: due PENDING runs (retries included) execute sequentially. */
export async function tickScheduler() {
  const due = await prisma.jobRun.findMany({
    where: { OR: [
      { status: "PENDING", nextRunAt: { lte: new Date() } },
      { status: "RUNNING", leaseExpiresAt: { lt: new Date() } },
    ] },
    orderBy: { createdAt: "asc" }, take: 10,
  });
  const ran = [];
  for (const run of due) if (run.kind in JOB_KINDS) ran.push(await runJob(run.kind as JobKind, run.id));
  return ran;
}

/**
 * Schedule seed: nightly jobs get one run per day; frequent jobs (reservation
 * expiry) get one slot per scheduler tick (5 min). Slot ids make both idempotent.
 * Called by the instrumentation interval; safe to call repeatedly.
 */
const NIGHTLY: JobKind[] = ["replenishment.generate", "loss.scan"];
const FREQUENT: JobKind[] = ["order.expire_reservations", "einvoice.issue", "einvoice.poll", "webhook.deliver"];
const TICK_MS = 5 * 60_000;

export async function scheduleNightly() {
  const created = [];
  const day = new Date().toISOString().slice(0, 10);
  for (const kind of NIGHTLY) {
    const id = `nightly:${kind}:${day}`;
    created.push(await prisma.jobRun.upsert({
      where: { id }, update: {}, create: { id, kind, nextRunAt: new Date(Date.now() + 60_000) },
    }));
  }
  // Frequent cadence: one pending row per elapsed tick window, due immediately.
  const slot = Math.floor(Date.now() / TICK_MS);
  for (const kind of FREQUENT) {
    const id = `freq:${kind}:${slot}`;
    created.push(await prisma.jobRun.upsert({
      where: { id }, update: {}, create: { id, kind },
    }));
  }
  return created;
}

/** Keep the ledger table bounded — succeeded runs are history after a week. */
export async function pruneFinishedRuns() {
  return prisma.jobRun.deleteMany({
    where: { status: "SUCCEEDED", finishedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
  });
}
