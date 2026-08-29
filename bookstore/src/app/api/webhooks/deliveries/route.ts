// List deliveries for the caller's org. Filters: endpointId,
// eventType, status (pending|delivered|dead). Pending = deliveredAt
// null AND nextRetryAt not in the deep-future. Dead = nextRetryAt
// beyond 30 days from now (matches the bus's dead-letter horizon).
// Bounded to 200 rows; pagination is a follow-up.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.write");
    const sp = req.nextUrl.searchParams;
    const endpointId = sp.get("endpointId") ?? undefined;
    const eventType = sp.get("eventType") ?? undefined;
    const status = sp.get("status") ?? undefined;

    const farFuture = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const statusFilter =
      status === "delivered" ? { deliveredAt: { not: null } }
      : status === "dead" ? { deliveredAt: null, nextRetryAt: { gt: farFuture } }
      : status === "pending" ? { deliveredAt: null, nextRetryAt: { lte: farFuture } }
      : {};

    const deliveries = await prisma.webhookDelivery.findMany({
      where: {
        ...statusFilter,
        ...(endpointId ? { endpointId } : {}),
        ...(eventType ? { eventType } : {}),
        endpoint: { orgId: auth.orgId! },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { endpoint: { select: { id: true, provider: true, url: true } } },
    });
    return NextResponse.json({ deliveries });
  } catch (err) {
    return apiError(err);
  }
}
