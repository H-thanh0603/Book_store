import { NextRequest } from "next/server";
import { prisma, TX_OPTIONS } from "@/lib/db";
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
        // Over-return race: two concurrent creates both read priorReturns
        // before either commits. Lock the order row so the loser waits,
        // then re-reads committed returns and fails the guard correctly.
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
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
      }, TX_OPTIONS);
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
        // P1: claw back loyalty earned by the original order (refType order).
        // Same guarded pattern as POS refundSale: fail if points already spent.
        let loyaltyClawed = 0;
        const orderForLoyalty = current.orderId
          ? await tx.order.findUnique({ where: { id: current.orderId }, select: { customerId: true } })
          : null;
        if (orderForLoyalty?.customerId && current.orderId) {
          const earnedRows = await tx.loyaltyTransaction.findMany({
            where: { refType: "order", refId: current.orderId, type: "EARN" },
            select: { points: true, accountId: true },
          });
          const totalEarned = earnedRows.reduce((s, r) => s + r.points, 0);
          if (totalEarned > 0) {
            const acct = await tx.loyaltyAccount.findUnique({ where: { customerId: orderForLoyalty.customerId } });
            if (acct) {
              const adjusted = await tx.loyaltyAccount.updateMany({
                where: { id: acct.id, points: { gte: totalEarned } },
                data: { points: { decrement: totalEarned } },
              });
              if (adjusted.count !== 1)
                fail(400, "VALIDATION", "Customer no longer has enough points to revoke");
              const after = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: acct.id } });
              await tx.loyaltyTransaction.create({
                data: {
                  accountId: acct.id, points: -totalEarned, balanceAfter: after.points,
                  type: "REDEEM", refType: "return", refId: current.id,
                },
              });
              loyaltyClawed = totalEarned;
            }
          }
        }
        // Tax compliance (EINV-001 follow-up): a refunded sale with an ISSUED
        // e-invoice must surface it — flag the row so staff cancel/adjust at
        // T-VAN instead of silently keeping a fiscal invoice for returned goods.
        // No auto-cancel: cancellation is a legal act needing human review.
        let einvoiceFlag: string | null = null;
        if (current.orderId) {
          const inv = await tx.eInvoice.findFirst({
            where: { orderId: current.orderId, status: "ISSUED" },
            select: { id: true, invoiceNumber: true },
          });
          if (inv) {
            einvoiceFlag = inv.invoiceNumber ?? inv.id;
            await tx.eInvoice.update({
              where: { id: inv.id },
              data: { errorMessage: `REFUND_PENDING: return ${current.number} refunded — cancel/adjust at T-VAN` },
            });
          }
        }
        await audit(auth.userId, "return.refund", "Return", current.id, { amount: Number(current.refundTotal), method, einvoiceFlag, loyaltyClawed }, tx);
        return { ...updated, einvoiceFlag, loyaltyClawed };
      }, TX_OPTIONS);
      return ok({ number: ret.number, status: ret.status, refundTotal: Number(ret.refundTotal), einvoiceFlag: ret.einvoiceFlag, loyaltyClawed: ret.loyaltyClawed });
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
    }, TX_OPTIONS);
    return ok({ number: ret.number, status: ret.status });
  } catch (err) {
    return apiError(err);
  }
}
