import { NextRequest } from "next/server";
import { PaymentMethod } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, toMoney } from "@/lib/api";
import { completeSale, openShift, closeShift, refundSale } from "@/lib/pos";

// PUT /api/pos — full refund of a completed transaction (spec Module 18: POS return)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.txNumber || !body.shiftId) fail(400, "VALIDATION", "txNumber and shiftId required");
    const auth = await requirePermission("pos.refund", body.storeId);
    const refund = await refundSale(body.txNumber, body.shiftId, auth.userId, {
      storeId: body.storeId, reason: typeof body.reason === "string" ? body.reason : undefined,
    });
    await prisma.auditLog.create({
      data: {
        actorId: auth.userId, action: "pos.refund", entity: "PosTransaction", entityId: refund.id,
        after: { refundedTx: body.txNumber, reason: body.reason ?? null },
      },
    });
    return ok({ number: refund.number, total: Number(-refund.total), status: "RETURNED" }, 201);
  } catch (err) {
    return apiError(err);
  }
}

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
      // Client-supplied unit prices are honored only with pos.override_price; everyone
      // else gets server-resolved retail prices (no client-trusted payment amounts).
      let overrides = 0;
      if (body.items.some((i: { unitPrice?: unknown }) => i.unitPrice != null)) {
        const canOverride = auth.roles.some(
          (r) => r.permissions.includes("pos.override_price") &&
            (r.storeId === null || body.storeId === undefined || r.storeId === body.storeId)
        );
        if (!canOverride)
          for (const i of body.items) delete i.unitPrice;
        else
          overrides = body.items.filter((i: { unitPrice?: unknown }) => i.unitPrice != null).length;
      }
      const txn = await completeSale({
        shiftId: body.shiftId,
        storeId: body.storeId,
        userId: auth.userId,
        items: body.items,
        customerId: body.customerId ?? null,
        redeemPoints: body.redeemPoints,
        payments: (body.payments as Record<string, unknown>[]).map((p) => ({
          method: p.method as PaymentMethod, amount: toMoney(p.amount, "payment.amount"),
          idempotencyKey: typeof p.idempotencyKey === "string" ? p.idempotencyKey : undefined,
          giftCardCode: typeof p.giftCardCode === "string" ? p.giftCardCode : undefined,
        })),
      });
      // audit
      await prisma.auditLog.create({
        data: {
          actorId: auth.userId, action: "pos.sale", entity: "PosTransaction", entityId: txn.id,
          after: overrides > 0 ? { priceOverrides: overrides } : undefined,
        },
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
