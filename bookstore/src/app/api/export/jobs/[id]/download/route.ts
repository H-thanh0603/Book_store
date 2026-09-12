import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { withOrg } from "@/lib/org-scope";
import { apiError } from "@/lib/api";

// GET /api/export/jobs/[id]/download — download a finished async export.
// Org-scoped: a job id from another org resolves to 404, never 403 (no oracle).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("reports.store.view");
    const { id } = await ctx.params;
    const job = await prisma.exportJob.findFirst({
      where: withOrg(auth, { id }),
    });
    if (!job) return NextResponse.json({ code: "NOT_FOUND", message: "Export not found" }, { status: 404 });
    if (job.status !== "SUCCEEDED" || !job.filePath)
      return NextResponse.json(
        { code: "NOT_READY", message: `Export is ${job.status}`, error: job.error },
        { status: 409 },
      );
    const buf = await readFile(job.filePath).catch(() => null);
    if (!buf)
      return NextResponse.json({ code: "GONE", message: "Export file was pruned" }, { status: 410 });
    const contentType =
      job.format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv; charset=utf-8";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="export_${job.type}_${job.id.slice(0, 8)}.${job.format}"`,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
