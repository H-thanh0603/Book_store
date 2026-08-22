import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, requireAuth } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { createReservedOrder, type CreateOrderInput } from "@/lib/orders";

// POST /api/orders — create order (WEB/APP), reserve stock at store/warehouse
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = await requireAuth();
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

// GET /api/orders
export async function GET() {
  try {
    await requirePermission("reports.store.view");
    const orders = await prisma.order.findMany({
      include: { customer: true, items: { include: { variant: true } } },
      orderBy: { createdAt: "desc" }, take: 50,
    });
    return ok({ orders });
  } catch (err) {
    return apiError(err);
  }
}
