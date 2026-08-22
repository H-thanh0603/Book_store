import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, nextBusinessNumber, toMoney } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";

// POST /api/orders — create order (WEB/APP), reserve stock at store/warehouse
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!Array.isArray(body.items) || body.items.length === 0 || !body.customerId)
      fail(400, "VALIDATION", "customerId and items required");

    const auth = await requireAuthSafe();

    const result = await prisma.$transaction(async (tx) => {
      const variants = await tx.productVariant.findMany({
        where: { id: { in: body.items.map((i: any) => i.variantId) }, active: true },
        include: {
          prices: { where: { priceList: { kind: "retail" } }, orderBy: { validFrom: "desc" }, take: 1 },
        },
      });
      const lines = body.items.map((i: any) => {
        const v = variants.find((x) => x.id === i.variantId);
        if (!v) fail(404, "NOT_FOUND", `Unknown variant ${i.variantId}`);
        return { variantId: v.id, quantity: i.quantity, unitPrice: v.prices[0]?.amount ?? 0n };
      });
      const subtotal = lines.reduce((s: bigint, l: any) => s + l.unitPrice * toMoney(l.quantity, "quantity"), 0n);
      const total = subtotal;

      const location = await tx.stockLocation.findFirst({
        where: body.locationId ? { id: body.locationId } : { type: "WAREHOUSE" },
      });
      if (!location) fail(400, "VALIDATION", "No fulfillment location");

      const number = await nextBusinessNumber("ORD");
      const order = await tx.order.create({
        data: {
          number, channel: body.channel ?? "WEB",
          type: body.type ?? "delivery",
          storeId: body.storeId ?? null,
          customerId: body.customerId,
          status: "CONFIRMED",
          subtotal, total,
          items: { create: lines },
          statusHistory: { create: { fromStatus: null, toStatus: "CONFIRMED", userId: auth?.userId } },
        },
        include: { items: true },
      });

      // Reserve inventory
      for (const l of lines) {
        await applyMovement(tx, {
          variantId: l.variantId, locationId: location.id,
          type: "RESERVATION", quantityDelta: 0, reservedDelta: l.quantity,
          refType: "order", refId: order.id, userId: auth?.userId,
        });
      }
      return order;
    });
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

async function requireAuthSafe() {
  try {
    const { requireAuth } = await import("@/lib/auth");
    return await requireAuth();
  } catch {
    return null;
  }
}
