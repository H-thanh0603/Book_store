import { NextRequest } from "next/server";
import { PaymentMethod } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { assertStoreAccess, requirePermission } from "@/lib/auth";
import { apiError, ok, fail, toMoney } from "@/lib/api";
import { completeSale, openShift, closeShift, refundSale } from "@/lib/pos";

// PUT /api/pos — full refund of a completed transaction (spec Module 18: POS return)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.txNumber || !body.shiftId) fail(400, "VALIDATION", "txNumber and shiftId required");
    const auth = await requirePermission("pos.refund");
    const target = await prisma.posTransaction.findUnique({
      where: { number: body.txNumber }, select: { storeId: true },
    });
    if (!target) fail(404, "NOT_FOUND", "Transaction not found");
    assertStoreAccess(auth, target.storeId, "pos.refund");
    const refund = await refundSale(body.txNumber, body.shiftId, auth.userId, {
      storeId: target.storeId, reason: typeof body.reason === "string" ? body.reason : undefined,
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
      if (!body.terminalId || typeof body.openingCash !== "number")
        fail(400, "VALIDATION", "terminalId and openingCash required");
      const terminal = await prisma.posTerminal.findFirst({
        where: { id: body.terminalId, active: true }, select: { storeId: true },
      });
      if (!terminal) fail(404, "NOT_FOUND", "Terminal not found or inactive");
      if (body.storeId && body.storeId !== terminal.storeId)
        fail(400, "VALIDATION", "Terminal does not belong to store");
      const auth = await requirePermission("pos.sell", terminal.storeId);
      const shift = await openShift(body.terminalId, auth.userId, toMoney(body.openingCash, "openingCash"));
      return ok({ shiftId: shift.id });
    }

    if (body.action === "close_shift") {
      if (!body.shiftId || typeof body.closingCash !== "number")
        fail(400, "VALIDATION", "shiftId and closingCash required");
      const target = await prisma.posShift.findUnique({
        where: { id: body.shiftId }, select: { terminal: { select: { storeId: true } } },
      });
      if (!target) fail(404, "NOT_FOUND", "Shift not found");
      const auth = await requirePermission("pos.sell", target.terminal.storeId);
      const shift = await closeShift(body.shiftId, toMoney(body.closingCash, "closingCash"), auth.userId);
      return ok({
        expectedCash: Number(shift.expectedCash),
        closingCash: Number(shift.closingCash),
        variance: Number(shift.variance),
      });
    }

    if (body.action === "sale") {
      if (!body.shiftId || !body.storeId || typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim())
        fail(400, "VALIDATION", "shiftId, storeId and idempotencyKey required");
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
      const shift = await prisma.posShift.findUnique({
        where: { id: body.shiftId }, select: { terminal: { select: { storeId: true } } },
      });
      if (!shift) fail(404, "NOT_FOUND", "Shift not found");
      if (shift.terminal.storeId !== body.storeId)
        fail(400, "VALIDATION", "Shift does not belong to store");
      const auth = await requirePermission("pos.sell", shift.terminal.storeId);
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
        idempotencyKey: body.idempotencyKey.trim().slice(0, 128),
        payments: (body.payments as Record<string, unknown>[]).map((p) => ({
          method: p.method as PaymentMethod, amount: toMoney(p.amount, "payment.amount"),
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
