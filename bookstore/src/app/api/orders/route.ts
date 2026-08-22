import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, requireAuth, resolveStoreScope } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { createReservedOrder, type CreateOrderInput } from "@/lib/orders";

// POST /api/orders — create order (WEB/APP), reserve stock at store/warehouse
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = await requireAuth();
    // Store-scoped callers may only order for their own store (resolveStoreScope throws 403 otherwise).
    resolveStoreScope(auth, body.storeId);
    const result = await createReservedOrder({
      channel: body.channel ?? "WEB", type: body.type, storeId: body.storeId,
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
