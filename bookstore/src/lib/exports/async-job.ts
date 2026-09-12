import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { exportData, type ExportFormat } from "./generic";
import { EXPORT_TYPES, type ExportTypeName } from "./datasets";

// Async export worker (WS2.1): building a 10k-row xlsx inside the request
// risks OOM + 30s timeouts. POST /api/export enqueues an ExportJob row;
// runExportBuilds (registered as "export.build", FREQUENT cadence) picks up
// PENDING rows, builds the file into var/exports/, and flips the row to
// SUCCEEDED (or FAILED with the error message — never a silent drop).

const EXPORT_DIR = process.env.EXPORT_DIR ?? "var/exports";
const MAX_ROWS_ASYNC = 200_000;

export async function enqueueExportJob(input: {
  orgId: string;
  requestedBy: string;
  type: ExportTypeName;
  format: ExportFormat;
  params?: { storeId?: string };
}) {
  return prisma.exportJob.create({
    data: {
      orgId: input.orgId,
      requestedBy: input.requestedBy,
      type: input.type,
      format: input.format,
      params: input.params ?? {},
      status: "PENDING",
    },
  });
}

export async function runExportBuilds(): Promise<{ built: number }> {
  const pending = await prisma.exportJob.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  let built = 0;
  for (const job of pending) {
    const claimed = await prisma.exportJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "RUNNING" },
    });
    if (claimed.count !== 1) continue; // another worker won the race
    try {
      const rowCount = await buildExportFile(job.id);
      await prisma.exportJob.update({
        where: { id: job.id },
        data: { status: "SUCCEEDED", rowCount, finishedAt: new Date() },
      });
      built++;
    } catch (err) {
      await prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
          finishedAt: new Date(),
        },
      });
    }
  }
  return { built };
}

async function buildExportFile(jobId: string): Promise<number> {
  const job = await prisma.exportJob.findUniqueOrThrow({ where: { id: jobId } });
  if (!(job.type in EXPORT_TYPES))
    throw new Error(`Unknown export type: ${job.type}`);
  if (job.format !== "csv" && job.format !== "xlsx")
    throw new Error(`Unknown export format: ${job.format}`);
  const { columns, fetch } = EXPORT_TYPES[job.type as ExportTypeName];

  // Re-resolve the store scope at build time from the requester's CURRENT
  // roles — a demotion between enqueue and build must narrow the export,
  // never widen it. requirePermission() can't be used here: the worker has
  // no session, so the permission + org-usable checks run against the
  // freshly loaded roles below.
  const entry = EXPORT_TYPES[job.type as ExportTypeName];
  const { storeScope } = await resolveExportScope(job, entry.permission);

  const data = await fetch(storeScope, job.orgId);
  if (data.length > MAX_ROWS_ASYNC)
    throw new Error(`Export too large: ${data.length} rows (limit ${MAX_ROWS_ASYNC})`);
  const result = await exportData(
    data as Record<string, unknown>[],
    columns() as never,
    job.type,
    job.format as ExportFormat,
  );
  await mkdir(EXPORT_DIR, { recursive: true });
  const filePath = join(EXPORT_DIR, `${job.id}.${result.extension}`);
  await writeFile(filePath, result.buffer);
  await prisma.exportJob.update({ where: { id: job.id }, data: { filePath } });
  return data.length;
}

async function resolveExportScope(
  job: { requestedBy: string; params: unknown },
  permission: string,
): Promise<{ storeScope: string[] | null }> {
  const { prisma: db } = await import("@/lib/db");
  const { resolveStoreScope, assertOrgUsable } = await import("@/lib/auth");
  const params = (job.params ?? {}) as { storeId?: string };
  // Load the requester's live roles; a deleted/deactivated account fails closed.
  const user = await db.user.findUnique({
    where: { id: job.requestedBy },
    include: {
      org: true,
      roles: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });
  if (!user || user.active === false) throw new Error("Requester account is gone");
  const auth = {
    userId: user.id,
    email: user.email,
    orgId: user.orgId,
    orgStatus: user.org?.status ?? null,
    trialEndsAt: user.org?.trialEndsAt ?? null,
    roles: user.roles.map((ur) => ({
      role: ur.role.name,
      storeId: ur.storeId,
      permissions: ur.role.permissions.map((rp) => rp.permission.code),
    })),
  };
  assertOrgUsable(auth);
  if (!auth.roles.some((r) => r.permissions.includes(permission)))
    throw Object.assign(new Error(`Forbidden: ${permission}`), { status: 403 });
  const scope = resolveStoreScope(auth, params.storeId ?? undefined, permission);
  return { storeScope: scope === null ? null : scope };
}

/** Prune files + rows older than 7 days (registered in pruneFinishedRuns path). */
export async function pruneExportJobs(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  const old = await prisma.exportJob.findMany({
    where: { finishedAt: { lt: cutoff } },
    select: { id: true, filePath: true },
  });
  for (const job of old) {
    if (job.filePath) await unlink(job.filePath).catch(() => {});
  }
  const { count } = await prisma.exportJob.deleteMany({
    where: { finishedAt: { lt: cutoff } },
  });
  return { deleted: count };
}
