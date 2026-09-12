// Agent 4: background job runner — run ledger, retries with backoff, failed-job visibility.
import { prisma } from "./db";
import { scanLossPrevention } from "./loss-prevention";
import { generateReplenishmentSuggestions } from "./replenishment";
import { expireStaleReservations } from "./order-expiry";
import { issuePendingInvoices, pollPendingInvoices } from "./einvoice-jobs";
import { processPendingDeliveries } from "./webhook-bus";
import { rotateInventoryPartitions, detachOldInventoryPartitions } from "./partitions";
import { runDailyMisaExport } from "./exports/misa-job";
import { suspendOverdueOrgs } from "./billing";
import { scanRefundRequired } from "./payment-refunds";
import { pruneAuditLogs, pruneWebhookDeliveries } from "./prune";
import { runExportBuilds, pruneExportJobs } from "./exports/async-job";
import { randomUUID } from "crypto";

export const JOB_KINDS = {
  "replenishment.generate": generateReplenishmentSuggestions,
  "loss.scan": scanLossPrevention,
  "order.expire_reservations": expireStaleReservations,
  "einvoice.issue": issuePendingInvoices,
  "einvoice.poll": pollPendingInvoices,
  "webhook.deliver": processPendingDeliveries,
  "partitions.rotate": rotateInventoryPartitions,
  "partitions.detach_old": detachOldInventoryPartitions,
  "prune.audit_logs": pruneAuditLogs,
  "prune.webhook_deliveries": pruneWebhookDeliveries,
  "misa.export": runDailyMisaExport,
  "billing.suspend_overdue": suspendOverdueOrgs,
  "payments.refund_scan": scanRefundRequired,
  "export.build": runExportBuilds,
  // ponytail: integration dispatch is inline today (integrations route runs jobs on
  // request); add a real queue consumer here when a connector pushes work.
} as const;

export type JobKind = keyof typeof JOB_KINDS;
const WORKER_ID = `${process.env.HOSTNAME ?? "local"}:${randomUUID()}`;
// Takeover window for a dead worker (REL-001): a RUNNING run whose lease
// expired is claimable by another worker. 30 min stalled everything on a
// worker-0 crash; 5 min bounds the stall. Long jobs renew the lease via
// heartbeat below, so a short window never double-runs healthy work — only
// genuinely dead workers lose their runs. Override with JOB_LEASE_MS.
const LEASE_MS = Number(process.env.JOB_LEASE_MS ?? 5 * 60_000);

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

  // Heartbeat: renew our own lease while the job runs, so a healthy long job
  // (replenishment, MISA export) is never reaped by the takeover above.
  // Only the owning workerId can renew; a dead worker's timer dies with it.
  const heartbeat = setInterval(() => {
    void prisma.jobRun.updateMany({
      where: { id: run.id, status: "RUNNING", workerId: WORKER_ID },
      data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
    }).catch(() => {});
  }, Math.max(30_000, Math.floor(LEASE_MS / 3)));
  if (typeof (heartbeat as unknown as { unref?: () => void }).unref === "function")
    (heartbeat as unknown as { unref: () => void }).unref();

  try {
    const result = await JOB_KINDS[kind]();
    await prisma.jobRun.updateMany({
      where: { id: run.id, status: "RUNNING", workerId: WORKER_ID },
      data: {
        status: "SUCCEEDED", finishedAt: new Date(), leaseExpiresAt: null, workerId: null,
        // Preserve the job's own result when it's a plain object (e.g.
        // {deleted: 12} from the prune jobs, {created: [...]} from rotation) —
        // ops dashboards read these. Arrays collapse to a count (they were
        // never stored in full); null/undefined stays {count: null}. The
        // JSON round-trip is purely a TS-level InputJsonValue cast — the
        // values are job results we produced ourselves, not user input.
        result: Array.isArray(result)
          ? { count: result.length }
          : result && typeof result === "object"
            ? JSON.parse(JSON.stringify(result))
            : { count: null },
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
  } finally {
    clearInterval(heartbeat);
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
const NIGHTLY: JobKind[] = ["replenishment.generate", "loss.scan", "partitions.rotate", "partitions.detach_old", "prune.audit_logs", "prune.webhook_deliveries", "misa.export", "billing.suspend_overdue"];
const FREQUENT: JobKind[] = ["order.expire_reservations", "einvoice.issue", "einvoice.poll", "webhook.deliver", "payments.refund_scan", "export.build"];
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
  await pruneExportJobs().catch(() => {});
  return prisma.jobRun.deleteMany({
    where: { status: "SUCCEEDED", finishedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
  });
}
