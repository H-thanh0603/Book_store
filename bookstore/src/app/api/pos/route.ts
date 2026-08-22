import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, toMoney } from "@/lib/api";
import { completeSale, openShift, closeShift } from "@/lib/pos";

// POST /api/pos  { action: "open_shift"|"close_shift"|"sale", ... }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "open_shift") {
      await requirePermission("pos.sell", body.storeId);
      if (!body.terminalId || typeof body.openingCash !== "number")
        fail(400, "VALIDATION", "terminalId and openingCash required");
      const { getAuth } = await import("@/lib/auth");
      const auth = (await getAuth())!;
      const shift = await openShift(body.terminalId, auth.userId, toMoney(body.openingCash, "openingCash"));
      return ok({ shiftId: shift.id });
    }

    if (body.action === "close_shift") {
      await requirePermission("pos.sell");
      if (!body.shiftId || typeof body.closingCash !== "number")
        fail(400, "VALIDATION", "shiftId and closingCash required");
      const { getAuth } = await import("@/lib/auth");
      const auth = (await getAuth())!;
      const shift = await closeShift(body.shiftId, toMoney(body.closingCash, "closingCash"), auth.userId);
      return ok({
        expectedCash: Number(shift.expectedCash),
        closingCash: Number(shift.closingCash),
        variance: Number(shift.variance),
      });
    }

    if (body.action === "sale") {
      if (!Array.isArray(body.items) || body.items.length === 0)
        fail(400, "VALIDATION", "items required");
      for (const i of body.items)
        if (!i.variantId || !Number.isInteger(i.quantity) || i.quantity <= 0)
          fail(400, "VALIDATION", "each item needs variantId and positive integer quantity");
      if (!Array.isArray(body.payments) || body.payments.length === 0)
        fail(400, "VALIDATION", "payments required");
      for (const p of body.payments)
        if (!p.method || !Number.isFinite(p.amount) || p.amount < 0)
          fail(400, "VALIDATION", "each payment needs method and non-negative amount");
      await requirePermission("pos.sell", body.storeId);
      const { getAuth } = await import("@/lib/auth");
      const auth = (await getAuth())!;
      const txn = await completeSale({
        shiftId: body.shiftId,
        storeId: body.storeId,
        userId: auth.userId,
        items: body.items,
        customerId: body.customerId ?? null,
        redeemPoints: body.redeemPoints,
        payments: body.payments.map((p: any) => ({
          method: p.method, amount: toMoney(p.amount, "payment.amount"), idempotencyKey: p.idempotencyKey,
          giftCardCode: p.giftCardCode,
        })),
      });
      // audit
      await prisma.auditLog.create({
        data: { actorId: auth.userId, action: "pos.sale", entity: "PosTransaction", entityId: txn.id },
      });
      return ok({
        number: txn.number, subtotal: Number(txn.subtotal),
        discountTotal: Number(txn.discountTotal), total: Number(txn.total),
        loyaltyEarned: txn.loyaltyEarned,
      }, 201);
    }

    fail(400, "VALIDATION", "Unknown action");
  } catch (err) {
    return apiError(err);
  }
}
