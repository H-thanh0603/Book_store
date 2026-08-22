// POS domain — completeSale is atomic: tx + payments + inventory + movements + loyalty.
import { prisma } from "./db";
import { fail } from "./api";
import { applyMovement } from "./inventory";
import { evaluatePromotions, mergeLineDiscounts, CartLine } from "./promotions";
import { nextBusinessNumber, getSystemConfig } from "./api";
import { MovementType, PaymentMethod, Prisma } from "../generated/prisma/client";

const LOYALTY_RATE_FALLBACK = 10_000n; // 10.000 VND = 1 point (spec §101: override via SystemConfig "loyalty.vndPerPoint")

export type CompleteSaleInput = {
  shiftId: string;
  storeId: string;
  userId: string;
  items: { variantId: string; quantity: number; unitPrice?: bigint }[];
  customerId?: string | null;
  redeemPoints?: number;
  couponCode?: string | null; // Phase 2
  payments: { method: PaymentMethod; amount: bigint; idempotencyKey?: string; giftCardCode?: string }[];
};

export async function completeSale(input: CompleteSaleInput) {
  const totalPaid = input.payments.reduce((s, p) => s + p.amount, 0n);
  const rate = BigInt(await getSystemConfig<number>("loyalty.vndPerPoint", Number(LOYALTY_RATE_FALLBACK)));

  return prisma.$transaction(async (tx) => {
    // Idempotency: same key → return existing tx
    const key = input.payments.find((p) => p.idempotencyKey)?.idempotencyKey;
    if (key) {
      const existing = await prisma.payment.findUnique({
        where: { idempotencyKey: key },
        include: { tx: true },
      });
      if (existing) return existing.tx;
    }

    const shift = await tx.posShift.findUnique({ where: { id: input.shiftId } });
    if (!shift || shift.status !== "OPEN") fail(400, "VALIDATION", "Shift not open");

    // Build lines with retail prices
    const variantIds = input.items.map((i) => i.variantId);
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds }, active: true },
      include: {
        product: { include: { category: true } },
        prices: {
          where: { priceList: { kind: "retail" }, OR: [{ validTo: null }, { validTo: { gt: new Date() } }] },
          orderBy: { validFrom: "desc" },
          take: 1,
        },
      },
    });
    if (variants.length !== new Set(variantIds).size)
      fail(404, "NOT_FOUND", "Unknown or inactive variant in cart");

    const lines: (CartLine & { unitPriceResolved: bigint })[] = input.items.map((i) => {
      const v = variants.find((x) => x.id === i.variantId)!;
      const unitPrice = BigInt(i.unitPrice ?? v.prices[0]?.amount ?? 0n);
      return {
        variantId: v.id,
        productId: v.productId,
        categoryId: v.product.categoryId,
        quantity: i.quantity,
        unitPrice,
        unitPriceResolved: unitPrice,
      };
    });

    const subtotal = lines.reduce((s, l) => s + l.unitPriceResolved * BigInt(l.quantity), 0n);

    // Promotions
    const applied = await evaluatePromotions({
      lines,
      storeId: input.storeId,
      channel: "POS",
      customerId: input.customerId,
      couponCode: input.couponCode,
    });
    const { byVariant, total: discountTotal } = mergeLineDiscounts(applied, lines);

    // Loyalty redemption
    let loyaltyRedeemed = 0;
    let redeemDiscount = 0n;
    if (input.redeemPoints && input.redeemPoints > 0) {
      if (!input.customerId) fail(400, "VALIDATION", "Redeem requires customer");
      const acct = await tx.loyaltyAccount.findUnique({ where: { customerId: input.customerId } });
      if (!acct || acct.points < input.redeemPoints)
        fail(400, "VALIDATION", "Insufficient loyalty points");
      loyaltyRedeemed = input.redeemPoints;
      redeemDiscount = BigInt(loyaltyRedeemed) * rate;
    }

    const total = subtotal - discountTotal - redeemDiscount;
    if (total < 0n) fail(400, "VALIDATION", "Discount exceeds total");
    if (totalPaid !== total)
      fail(400, "VALIDATION", `Payment mismatch: expected ${total}, got ${totalPaid}`);

    const giftCards = new Map<number, { id: string; balance: bigint }>();
    for (const [index, payment] of input.payments.entries()) {
      if (payment.method !== "GIFT_CARD") continue;
      const code = payment.giftCardCode?.trim().toUpperCase();
      if (!code) fail(400, "VALIDATION", "Gift card payment requires giftCardCode");
      const card = await tx.giftCard.findUnique({ where: { code } });
      if (!card || !card.active || (card.expiresAt && card.expiresAt <= new Date()))
        fail(400, "VALIDATION", "Gift card is inactive or expired");
      if (card.balance < payment.amount) fail(400, "VALIDATION", "Insufficient gift card balance");
      const updated = await tx.giftCard.update({ where: { id: card.id }, data: { balance: { decrement: payment.amount } } });
      giftCards.set(index, { id: card.id, balance: updated.balance });
    }

    // Deduct inventory atomically per line
    const saleLocation = await tx.stockLocation.findFirst({
      where: { storeId: input.storeId, type: "STORE_STOCKROOM" },
    });
    if (!saleLocation) fail(400, "VALIDATION", `No stockroom for store ${input.storeId}`);

    for (const l of lines) {
      await applyMovement(tx, {
        variantId: l.variantId,
        locationId: saleLocation.id,
        type: MovementType.SALE,
        quantityDelta: -l.quantity,
        refType: "pos_transaction",
        refId: null as unknown as string, // patched below
        userId: input.userId,
      });
    }

    const earned = total / rate;

    const number = await nextBusinessNumber("TXN");
    const txn = await tx.posTransaction.create({
      data: {
        number,
        shiftId: input.shiftId,
        storeId: input.storeId,
        customerId: input.customerId ?? null,
        status: "COMPLETED",
        subtotal,
        discountTotal: discountTotal + redeemDiscount,
        total,
        loyaltyEarned: Number(earned),
        loyaltyRedeemed,
        items: {
          create: lines.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
            unitPrice: l.unitPriceResolved,
            discount: byVariant.get(l.variantId) ?? 0n,
            promoId: applied[0]?.promoId ?? null,
          })),
        },
        payments: {
          create: input.payments.map((p, index) => ({
            method: p.method,
            amount: p.amount,
            idempotencyKey: p.idempotencyKey,
            giftCardId: giftCards.get(index)?.id ?? null,
          })),
        },
      },
    });

    for (const [index, card] of giftCards) {
      await tx.giftCardTransaction.create({
        data: { giftCardId: card.id, amount: -input.payments[index].amount, balanceAfter: card.balance, refType: "pos_transaction", refId: txn.id },
      });
    }

    // Patch movements' refId to the created txn
    await tx.inventoryMovement.updateMany({
      where: { refType: "pos_transaction", refId: null, createdAt: { gte: new Date(Date.now() - 5000) }, variantId: { in: variantIds } },
      data: { refId: txn.id },
    });

    // Loyalty ledger updates
    if (input.customerId && (earned > 0n || loyaltyRedeemed > 0)) {
      const acct = await tx.loyaltyAccount.upsert({
        where: { customerId: input.customerId },
        create: { customerId: input.customerId },
        update: {},
      });
      const net = Number(earned) - loyaltyRedeemed;
      const updated = await tx.loyaltyAccount.update({
        where: { id: acct.id },
        data: { points: { increment: net } },
      });
      if (net !== 0)
        await tx.loyaltyTransaction.create({
          data: {
            accountId: acct.id,
            points: net,
            balanceAfter: updated.points,
            type: net > 0 ? "EARN" : "REDEEM",
            refType: "pos_transaction",
            refId: txn.id,
          },
        });
    }

    // Promotion usage counters
    for (const ap of applied)
      await tx.promotion.update({ where: { id: ap.promoId }, data: { usedCount: { increment: 1 } } });

    return txn;
  });
}

export async function openShift(terminalId: string, cashierId: string, openingCash: bigint) {
  const existing = await prisma.posShift.findFirst({
    where: { terminalId, status: "OPEN" },
  });
  if (existing) fail(409, "VALIDATION", "Terminal already has an open shift");
  return prisma.posShift.create({
    data: { terminalId, cashierId, openingCash },
  });
}

export async function closeShift(shiftId: string, closingCash: bigint, userId: string) {
  return prisma.$transaction(async (tx) => {
    const shift = await tx.posShift.findUnique({
      where: { id: shiftId },
      include: { transactions: { where: { status: "COMPLETED" }, include: { payments: true } } },
    });
    if (!shift || shift.status !== "OPEN") fail(400, "VALIDATION", "Shift not open");
    let cashTotal = 0n;
    for (const t of shift.transactions)
      for (const p of t.payments) if (p.method === "CASH") cashTotal += p.amount;
    const expected = shift.openingCash + cashTotal;
    return tx.posShift.update({
      where: { id: shiftId },
      data: {
        status: "CLOSED",
        closingCash,
        expectedCash: expected,
        variance: closingCash - expected,
        closedAt: new Date(),
      },
    });
  });
}
