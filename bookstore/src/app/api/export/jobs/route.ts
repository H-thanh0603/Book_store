import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { withOrg } from "@/lib/org-scope";
import { apiError } from "@/lib/api";

// GET /api/export/jobs — list my org's async export jobs (newest first).
export async function GET() {
  try {
    const auth = await requirePermission("reports.store.view");
    const jobs = await prisma.exportJob.findMany({
      where: withOrg(auth),
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, type: true, format: true, status: true,
        rowCount: true, error: true, createdAt: true, finishedAt: true,
      },
    });
    return NextResponse.json({ jobs });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  // Alias: allow enqueueing from the same path clients already poll.
  try {
    const auth = await requirePermission("reports.store.view");
    const body = (await req.json().catch(() => ({}))) as {
      type?: string;
      format?: string;
      params?: { storeId?: string };
    };
    const { EXPORT_TYPES } = await import("@/lib/exports/datasets");
    const { enqueueExportJob } = await import("@/lib/exports/async-job");
    const type = body.type as keyof typeof EXPORT_TYPES | undefined;
    const format = (body.format ?? "csv") as "csv" | "xlsx";
    if (!type || !(type in EXPORT_TYPES))
      throw Object.assign(new Error("Invalid export type"), { status: 400, code: "VALIDATION" });
    if (format !== "csv" && format !== "xlsx")
      throw Object.assign(new Error("Invalid format"), { status: 400, code: "VALIDATION" });
    await requirePermission(EXPORT_TYPES[type].permission);
    if (!auth.orgId)
      throw Object.assign(new Error("Export requires an org-scoped account"), { status: 403, code: "FORBIDDEN" });
    const job = await enqueueExportJob({
      orgId: auth.orgId,
      requestedBy: auth.userId,
      type,
      format,
      params: { storeId: body.params?.storeId },
    });
    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
  } catch (e) {
    return apiError(e);
  }
}
