import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, assertStoreAccess, audit } from "@/lib/auth";
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
      await requirePermission("inventory.adjust", location.storeId);
      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: body.orderId }, include: { items: true } });
        if (!order) fail(404, "NOT_FOUND", "Order not found");
        assertStoreAccess(auth, order.storeId, "inventory.adjust");
        // Audit 2026-08-30 RET-001: a return on a CANCELLED order re-credited
        // stock the reservation-expiry job had already released (creating
        // inventory from nothing) and refunded money for goods never delivered.
        if (order.status === "CANCELLED")
          fail(400, "INVALID_STATUS_TRANSITION", "Cannot return items on a CANCELLED order");
        // Cumulative over-return guard: total returned per order item (all returns,
        // any status except REJECTED) can never exceed the ordered quantity.
        const priorReturned = new Map<string, number>();
        const priorReturns = await tx.return.findMany({
          where: { orderId: order.id, status: { not: "REJECTED" } },
          include: { items: true },
        });
        for (const r of priorReturns)
          for (const ri of r.items)
            if (ri.orderItemId)
              priorReturned.set(ri.orderItemId, (priorReturned.get(ri.orderItemId) ?? 0) + ri.quantity);
        const items = body.items.map((input: { orderItemId: string; quantity: number; disposition?: string }) => {
          if (!Number.isInteger(input.quantity) || input.quantity <= 0) fail(400, "VALIDATION", "quantity must be a positive integer");
          const item = order.items.find((i) => i.id === input.orderItemId);
          const already = item ? priorReturned.get(item.id) ?? 0 : 0;
          if (!item || already + input.quantity > item.quantity)
            fail(400, "VALIDATION", `Invalid returned order item quantity (ordered ${item?.quantity ?? 0}, already returned ${already})`);
          const refundAmount = (item.unitPrice * BigInt(input.quantity)) - (item.discount * BigInt(input.quantity) / BigInt(item.quantity));
          return { orderItemId: item.id, variantId: item.variantId, quantity: input.quantity, disposition: input.disposition === "DAMAGED" ? "DAMAGED" : "RESTOCK", refundAmount };
        });
        // Return starts non-refunded; money moves only when a real refund is recorded.
        const ret = await tx.return.create({
          data: {
            number: await nextBusinessNumber("RET"), orderId: order.id, customerId: order.customerId,
            locationId: body.locationId, reason: typeof body.reason === "string" ? body.reason : null,
            refundTotal: items.reduce((sum: bigint, item: { refundAmount: bigint }) => sum + item.refundAmount, 0n), items: { create: items },
          },
        });
        await audit(auth.userId, "return.create", "Return", ret.id, { number: ret.number }, tx);
        return ret;
      });
      return ok({ id: result.id, number: result.number, status: result.status }, 201);
    }

    if (!body.returnId) fail(400, "VALIDATION", "returnId required");
    if (body.action === "refund") {
      const ret = await prisma.$transaction(async (tx) => {
        const current = await tx.return.findUnique({ where: { id: body.returnId } });
        if (!current) fail(404, "NOT_FOUND", "Return not found");
        const loc = await tx.stockLocation.findUnique({ where: { id: current.locationId } });
        assertStoreAccess(auth, loc?.storeId, "inventory.adjust");
        // Only a RECEIVED return can be refunded, and only once.
        if (current.status !== "RECEIVED")
          fail(409, "INVALID_STATUS_TRANSITION", `Cannot refund a return in status ${current.status}`);
        const method = typeof body.method === "string" ? body.method : "CASH";
        const claimed = await tx.return.updateMany({
          where: { id: current.id, status: "RECEIVED" }, data: { status: "REFUNDED" },
        });
        if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "Return was already refunded");
        const updated = await tx.return.update({
          where: { id: current.id },
          data: { payments: { create: { method, amount: current.refundTotal, receivedBy: auth.userId } } },
        });
        await audit(auth.userId, "return.refund", "Return", current.id, { amount: Number(current.refundTotal), method }, tx);
        return updated;
      });
      return ok({ number: ret.number, status: ret.status, refundTotal: Number(ret.refundTotal) });
    }
    if (body.action !== "receive") fail(400, "VALIDATION", "Unknown action");

    const ret = await prisma.$transaction(async (tx) => {
      const current = await tx.return.findUnique({ where: { id: body.returnId }, include: { items: true } });
      if (!current) fail(404, "NOT_FOUND", "Return not found");
      const location = await tx.stockLocation.findUnique({ where: { id: current.locationId } });
      await requirePermission("inventory.adjust", location?.storeId ?? null);
      assertStoreAccess(auth, location?.storeId, "inventory.adjust");
      if (current.status !== "REQUESTED") fail(409, "INVALID_STATUS_TRANSITION", "Return was already processed");
      const claimed = await tx.return.updateMany({
        where: { id: current.id, status: "REQUESTED" },
        data: { status: "RECEIVED", receivedBy: auth.userId },
      });
      if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "Return was already processed");
      for (const item of current.items) {
        await applyMovement(tx, {
          variantId: item.variantId, locationId: current.locationId,
          type: item.disposition === "DAMAGED" ? MovementType.DAMAGED : MovementType.RETURN,
          quantityDelta: item.disposition === "DAMAGED" ? 0 : item.quantity,
          damagedDelta: item.disposition === "DAMAGED" ? item.quantity : 0,
          refType: "return", refId: current.id, userId: auth.userId,
        });
      }
      const updated = await tx.return.findUniqueOrThrow({ where: { id: current.id } });
      await audit(auth.userId, "return.receive", "Return", current.id, { number: current.number }, tx);
      return updated;
    });
    return ok({ number: ret.number, status: ret.status });
  } catch (err) {
    return apiError(err);
  }
}
