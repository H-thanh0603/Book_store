import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertStoreAccess, requirePermission, resolveStoreScope } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";
import { createReservedOrder, type CreateOrderInput } from "@/lib/orders";

// POST /api/orders — create order (WEB/APP), reserve stock at store/warehouse
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = await requirePermission("pos.sell");
    // Resolve scope explicitly — passing client-controlled storeId into
    // requirePermission would skip the binding when omitted (auth.ts treats
    // undefined as "caller clamps later"). Here we clamp/verify up front.
    const scope = resolveStoreScope(auth, body.storeId ?? undefined, "pos.sell");

    let locationStoreId: string | null | undefined;
    if (body.locationId) {
      const loc = await prisma.stockLocation.findUnique({
        where: { id: body.locationId }, select: { storeId: true },
      });
      if (!loc) fail(404, "NOT_FOUND", "Fulfillment location not found");
      // Warehouse locations (storeId null) are org-wide; store-scoped callers
      // may only reserve at their own stores.
      assertStoreAccess(auth, loc.storeId, "pos.sell");
      locationStoreId = loc.storeId;
    }
    // Scoped callers must name an in-scope store or an in-scope location —
    // never fall through to the org-wide warehouse default.
    if (scope !== null && !body.storeId && !body.locationId)
      fail(400, "VALIDATION", "storeId or locationId is required for your role");
    const effectiveStoreId = (body.storeId ?? locationStoreId ?? null) as string | null;

    const result = await createReservedOrder({
      channel: body.channel ?? "WEB", type: body.type, storeId: effectiveStoreId,
      customerId: body.customerId, locationId: body.locationId, couponCode: body.couponCode,
      items: body.items,
    } as CreateOrderInput, auth.userId);
    return ok({ number: result.number, status: result.status }, 201);
  } catch (err) {
    return apiError(err);
  }
}

// GET /api/orders — scoped to caller's stores
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const auth = await requirePermission("reports.store.view");
    const scope = resolveStoreScope(auth, sp.get("storeId") ?? undefined, "reports.store.view");
    const orders = await prisma.order.findMany({
      where: scope ? { storeId: { in: scope } } : undefined,
      include: { customer: true, items: { include: { variant: true } } },
      orderBy: { createdAt: "desc" }, take: 50,
    });
    return ok({ orders });
  } catch (err) {
    return apiError(err);
  }
}
