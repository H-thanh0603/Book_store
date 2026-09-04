import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { snapshot } from "@/lib/metrics";
import { prismaRead } from "@/lib/db";

/**
 * GET /api/metrics — operational snapshot for uptime monitoring.
 *
 * Admin-gated like /api/jobs. A single call answers the four pre-sale checks:
 *   1. p95 latency per route (catalog target: < 500 ms)
 *   2. 429 rejection rate (rate limiter + checkout admission control)
 *   3. DB pool wait time (p95 of acquire waits + queue high-water mark)
 *   4. FAILED job runs (alert source — see scripts/ops/check-alerts.ts)
 */
export async function GET() {
  try {
    await requirePermission("admin.config");
    const metrics = snapshot();

    const failedRuns = await prismaRead.jobRun.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, kind: true, error: true, attempts: true, finishedAt: true, workerId: true },
    });

    return NextResponse.json({
      ...metrics,
      jobs: {
        failedCount: failedRuns.length,
        failed: failedRuns,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
