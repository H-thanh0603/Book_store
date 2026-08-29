// Rearm a dead-lettered delivery. Moves nextRetryAt to now and
// clears lastError so the next worker tick retries it. Endpoint
// owner only — org-scoped via the nested where filter.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("settings.write");
    const { id } = await params;
    const result = await prisma.webhookDelivery.updateMany({
      where: { id, endpoint: { orgId: auth.orgId! } },
      data: { nextRetryAt: new Date(), lastError: null },
    });
    if (result.count === 0) return ok({ error: "NOT_FOUND" }, 404);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return apiError(err);
  }
}
