import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { JOB_KINDS, runJob, tickScheduler, type JobKind } from "@/lib/jobs";
import { JobStatus } from "@/generated/prisma/client";

// GET /api/jobs?status=&kind= — scheduled-work visibility (Agent 4 deliverable 1).
export async function GET(req: NextRequest) {
  try {
    await requirePermission("admin.config");
    const status = req.nextUrl.searchParams.get("status");
    const kind = req.nextUrl.searchParams.get("kind");
    const runs = await prisma.jobRun.findMany({
      where: {
        status: status && Object.values(JobStatus).includes(status as JobStatus) ? (status as JobStatus) : undefined,
        kind: kind ?? undefined,
      },
      orderBy: { createdAt: "desc" }, take: 100,
    });
    return ok({ runs });
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/jobs { action:"run", kind } | { action:"retry", runId } | { action:"tick" }
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("admin.config");
    const body = await req.json();
    if (body.action === "run") {
      if (!(body.kind in JOB_KINDS)) fail(400, "VALIDATION", `kind must be one of ${Object.keys(JOB_KINDS).join(", ")}`);
      return ok({ run: await runJob(body.kind as JobKind) });
    }
    if (body.action === "retry") {
      const run = await prisma.jobRun.findUnique({ where: { id: body.runId } });
      if (!run) fail(404, "NOT_FOUND", "Job run not found");
      // Reset a failed/exhausted run so the next tick picks it up again.
      const updated = await prisma.jobRun.update({
        where: { id: run.id },
        data: { status: "PENDING", attempts: 0, error: null, nextRunAt: new Date() },
      });
      return ok({ run: updated });
    }
    if (body.action === "tick") return ok({ ran: await tickScheduler() });
    void auth;
    fail(400, "VALIDATION", 'Use action="run"|"retry"|"tick"');
  } catch (err) {
    return apiError(err);
  }
}
