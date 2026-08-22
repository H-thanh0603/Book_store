import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, nextBusinessNumber, ok } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
import { MovementType } from "@/generated/prisma/client";

// POST /api/returns { action: "create"|"receive"|"refund", ... }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = await requirePermission("inventory.adjust");

    if (body.action === "create") {
      if (!body.orderId || !body.locationId || !Array.isArray(body.items) || body.items.length === 0)
        fail(400, "VALIDATION", "orderId, locationId and items required");
      const location = await prisma.stockLocation.findUnique({ where: { id: body.locationId } });
      if (!location) fail(404, "NOT_FOUND", "Return location not found");
      await requirePermission("inventory.adjust", location.storeId ?? undefined);
      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: body.orderId }, include: { items: true } });
        if (!order) fail(404, "NOT_FOUND", "Order not found");
        const items = body.items.map((input: { orderItemId: string; quantity: number; disposition?: string }) => {
          if (!Number.isInteger(input.quantity) || input.quantity <= 0) fail(400, "VALIDATION", "quantity must be a positive integer");
          const item = order.items.find((i) => i.id === input.orderItemId);
          if (!item || input.quantity > item.quantity) fail(400, "VALIDATION", "Invalid returned order item quantity");
          const refundAmount = (item.unitPrice * BigInt(input.quantity)) - (item.discount * BigInt(input.quantity) / BigInt(item.quantity));
          return { orderItemId: item.id, variantId: item.variantId, quantity: input.quantity, disposition: input.disposition === "DAMAGED" ? "DAMAGED" : "RESTOCK", refundAmount };
        });
        const ret = await tx.return.create({
          data: {
            number: await nextBusinessNumber("RET"), orderId: order.id, customerId: order.customerId,
            locationId: body.locationId, reason: typeof body.reason === "string" ? body.reason : null,
            refundTotal: items.reduce((sum: bigint, item: { refundAmount: bigint }) => sum + item.refundAmount, 0n), items: { create: items },
          },
        });
        return ret;
      });
      return ok({ id: result.id, number: result.number, status: result.status }, 201);
    }

    if (!body.returnId) fail(400, "VALIDATION", "returnId required");
    if (body.action === "refund") {
      const ret = await prisma.return.update({ where: { id: body.returnId }, data: { status: "REFUNDED" } });
      return ok({ number: ret.number, status: ret.status, refundTotal: Number(ret.refundTotal) });
    }
    if (body.action !== "receive") fail(400, "VALIDATION", "Unknown action");

    const ret = await prisma.$transaction(async (tx) => {
      const current = await tx.return.findUnique({ where: { id: body.returnId }, include: { items: true } });
      if (!current) fail(404, "NOT_FOUND", "Return not found");
      const location = await tx.stockLocation.findUnique({ where: { id: current.locationId } });
      await requirePermission("inventory.adjust", location?.storeId ?? undefined);
      if (current.status !== "REQUESTED") fail(409, "INVALID_STATUS_TRANSITION", "Return was already processed");
      for (const item of current.items) {
        await applyMovement(tx, {
          variantId: item.variantId, locationId: current.locationId,
          type: item.disposition === "DAMAGED" ? MovementType.DAMAGED : MovementType.RETURN,
          quantityDelta: item.disposition === "DAMAGED" ? 0 : item.quantity,
          damagedDelta: item.disposition === "DAMAGED" ? item.quantity : 0,
          refType: "return", refId: current.id, userId: auth.userId,
        });
      }
      return tx.return.update({ where: { id: current.id }, data: { status: "RECEIVED", receivedBy: auth.userId } });
    });
    return ok({ number: ret.number, status: ret.status });
  } catch (err) {
    return apiError(err);
  }
}
