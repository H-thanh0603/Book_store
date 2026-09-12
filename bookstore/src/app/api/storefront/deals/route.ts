import { NextRequest, NextResponse } from "next/server";
import { prismaRead } from "@/lib/db";
import { apiError } from "@/lib/api";

// GET /api/storefront/deals?storeId= — N3a: public "giờ vàng" feed showing REAL
// active promotions (code + time window + value), never hardcoded marketing.
// storeId is required so one tenant's vouchers never leak into another's page.
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId");
    if (!storeId)
      throw Object.assign(new Error("storeId is required"), { status: 400, code: "VALIDATION" });
    const store = await prismaRead.store.findFirst({
      where: { id: storeId, active: true },
      select: { orgId: true },
    });
    if (!store)
      throw Object.assign(new Error("Store not found"), { status: 404, code: "NOT_FOUND" });
    const now = new Date();
    const promos = await prismaRead.promotion.findMany({
      where: {
        orgId: store.orgId,
        active: true,
        channel: { in: ["WEB", "ALL"] },
        startAt: { lte: now },
        OR: [{ endAt: null }, { endAt: { gt: now } }],
        // Mirror the engine (promotions.ts): empty store list = org-wide.
        AND: [{ OR: [{ stores: { none: {} } }, { stores: { some: { storeId } } }] }],
      },
      select: {
        code: true, name: true, type: true, value: true,
        startAt: true, endAt: true, minQty: true,
      },
      orderBy: [{ endAt: "asc" }],
      take: 20,
    });
    return NextResponse.json({
      deals: promos.map((p) => ({
        code: p.code,
        title: p.name,
        kind: p.type,
        // percent (0-100) or fixed VND (BigInt serializes via NextResponse? no —
        // convert explicitly: values fit Number for display).
        value: Number(p.value),
        startAt: p.startAt,
        endAt: p.endAt,
        // A deal with an endAt inside 48h counts as "giờ vàng" (flashing).
        flash: p.endAt ? p.endAt.getTime() - now.getTime() < 48 * 3600_000 : false,
      })),
    });
  } catch (e) {
    return apiError(e);
  }
}
