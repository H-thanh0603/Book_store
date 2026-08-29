// POS domain — completeSale is atomic: tx + payments + inventory + movements + loyalty.
import { prisma, withTxRetry, TX_OPTIONS } from "./db";
import { fail } from "./api";
import { applyMovement } from "./inventory";
import { evaluatePromotions, mergeLineDiscounts, CartLine } from "./promotions";
import { nextBusinessNumber, getSystemConfig } from "./api";
import { MovementType, PaymentMethod, Prisma } from "../generated/prisma/client";
import { enqueueEinvoice, enqueueEinvoiceForPosTransaction } from "./einvoice";
const LOYALTY_RATE_FALLBACK = 10_000n; // 10.000 VND = 1 point (spec §101: override via SystemConfig "loyalty.vndPerPoint")

export type CompleteSaleInput = {
  shiftId: string;
  storeId: string;
  userId: string;
  items: { variantId: string; quantity: number; unitPrice?: bigint }[];
  customerId?: string | null;
  redeemPoints?: number;
  couponCode?: string | null; // Phase 2
  idempotencyKey: string;
  payments: { method: PaymentMethod; amount: bigint; giftCardCode?: string }[];
};

export async function completeSale(input: CompleteSaleInput) {
  const totalPaid = input.payments.reduce((s, p) => s + p.amount, 0n);
  const rate = BigInt(await getSystemConfig<number>("loyalty.vndPerPoint", Number(LOYALTY_RATE_FALLBACK)));
  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey: input.idempotencyKey }, include: { tx: true },
  });
  if (existing) {
    if (existing.tx.storeId !== input.storeId)
      fail(409, "DUPLICATE", "Idempotency key belongs to another sale");
    return existing.tx;
  }

  try {
    const result = await withTxRetry(() =>
      prisma.$transaction(async (tx) => {
    const shift = await tx.posShift.findUnique({
      where: { id: input.shiftId }, include: { terminal: true },
    });
    if (!shift || shift.status !== "OPEN") fail(400, "VALIDATION", "Shift not open");
    if (shift.terminal.storeId !== input.storeId)
      fail(400, "VALIDATION", "Shift does not belong to store");

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
    }, tx);
    const { byVariant, total: discountTotal } = mergeLineDiscounts(applied, lines);

    // Loyalty redemption
    let loyaltyRedeemed = 0;
    let redeemDiscount = 0n;
    if (input.redeemPoints && input.redeemPoints > 0) {
      if (!input.customerId) fail(400, "VALIDATION", "Redeem requires customer");
      await tx.loyaltyAccount.upsert({
        where: { customerId: input.customerId }, create: { customerId: input.customerId }, update: {},
      });
      const reserved = await tx.loyaltyAccount.updateMany({
        where: { customerId: input.customerId, points: { gte: input.redeemPoints } },
        data: { points: { decrement: input.redeemPoints } },
      });
      if (reserved.count !== 1)
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
      const debited = await tx.giftCard.updateMany({
        where: { id: card.id, active: true, balance: { gte: payment.amount } },
        data: { balance: { decrement: payment.amount } },
      });
      if (debited.count !== 1) fail(400, "VALIDATION", "Insufficient gift card balance");
      const updated = await tx.giftCard.findUniqueOrThrow({ where: { id: card.id } });
      giftCards.set(index, { id: card.id, balance: updated.balance });
    }

    const saleLocation = await tx.stockLocation.findFirst({
      where: { storeId: input.storeId, type: "STORE_STOCKROOM" },
    });
    if (!saleLocation) fail(400, "VALIDATION", `No stockroom for store ${input.storeId}`);

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
            idempotencyKey: index === 0 ? input.idempotencyKey : undefined,
            giftCardId: giftCards.get(index)?.id ?? null,
          })),
        },
      },
    });

    for (const l of lines) {
      await applyMovement(tx, {
        variantId: l.variantId, locationId: saleLocation.id, type: MovementType.SALE,
        quantityDelta: -l.quantity, refType: "pos_transaction", refId: txn.id,
        userId: input.userId,
      });
    }

    for (const [index, card] of giftCards) {
      await tx.giftCardTransaction.create({
        data: { giftCardId: card.id, amount: -input.payments[index].amount, balanceAfter: card.balance, refType: "pos_transaction", refId: txn.id },
      });
    }

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
        data: { points: { increment: Number(earned) } },
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
    for (const ap of applied) {
      const promotion = await tx.promotion.findUniqueOrThrow({
        where: { id: ap.promoId }, select: { usageLimit: true },
      });
      const claimed = await tx.promotion.updateMany({
        where: {
          id: ap.promoId,
          ...(promotion.usageLimit === null ? {} : { usedCount: { lt: promotion.usageLimit } }),
        },
        data: { usedCount: { increment: 1 } },
      });
      if (claimed.count !== 1) fail(409, "VALIDATION", "Promotion usage limit reached");
    }

    return txn;
    }, TX_OPTIONS));
    // Fire-and-forget e-invoice enqueue. A T-VAN outage must never block a paid sale;
    // the row is created DRAFT and the worker picks it up on the next tick.
    enqueueEinvoiceForPosTransaction(result.id).catch((err) =>
      console.error(JSON.stringify({ level: "error", event: "einvoice_enqueue_failed", txnId: result.id, message: err?.message }))
    );
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey }, include: { tx: true },
      });
      if (duplicate) {
        if (duplicate.tx.storeId !== input.storeId)
          fail(409, "DUPLICATE", "Idempotency key belongs to another sale");
        enqueueEinvoiceForPosTransaction(duplicate.tx.id).catch(() => {});
        return duplicate.tx;
      }
    }
    throw error;
  }
}

/** Price a cart without side effects — POS UI preview so the client never guesses totals. */
export async function quoteSale(input: Pick<CompleteSaleInput, "items" | "storeId" | "customerId" | "couponCode" | "redeemPoints">) {
  const rate = BigInt(await getSystemConfig<number>("loyalty.vndPerPoint", Number(LOYALTY_RATE_FALLBACK)));
  const variantIds = input.items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({
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
      variantId: v.id, productId: v.productId, categoryId: v.product.categoryId,
      quantity: i.quantity, unitPrice, unitPriceResolved: unitPrice,
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.unitPriceResolved * BigInt(l.quantity), 0n);
  const applied = await evaluatePromotions({
    lines, storeId: input.storeId, channel: "POS", customerId: input.customerId, couponCode: input.couponCode,
  });
  const { total: discountTotal } = mergeLineDiscounts(applied, lines);

  let redeemable = 0;
  let redeemDiscount = 0n;
  const requested = input.redeemPoints ?? 0;
  if (requested > 0 && input.customerId) {
    const acct = await prisma.loyaltyAccount.findUnique({ where: { customerId: input.customerId } });
    if (acct && acct.points >= requested) {
      redeemable = requested;
      redeemDiscount = BigInt(redeemable) * rate;
    }
  }
  let total = subtotal - discountTotal - redeemDiscount;
  if (total < 0n) {
    // cap redemption so discounts never push total negative
    redeemDiscount = subtotal - discountTotal;
    redeemable = Number(redeemDiscount / rate);
    total = 0n;
  }

  return {
    lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: Number(l.unitPriceResolved) })),
    subtotal: Number(subtotal), discountTotal: Number(discountTotal),
    redeemDiscount: Number(redeemDiscount), redeemable, total: Number(total),
    promos: applied.map((ap) => ({ name: ap.name, discountTotal: Number(ap.discountTotal) })),
  };
}

/**
 * Refund a completed POS transaction in full: restore stock, gift-card balances and
 * loyalty, then write a mirrored negative transaction. Whole-txn only — partial
 * refunds need a per-item refund ledger column, skipped to avoid a schema migration.
 */
export async function refundSale(txNumber: string, shiftId: string, userId: string, opts: { storeId?: string; reason?: string } = {}) {
  return withTxRetry(() =>
    prisma.$transaction(async (tx) => {
    const orig = await tx.posTransaction.findUnique({
      where: { number: txNumber },
      include: { items: true, payments: true },
    });
    if (!orig) fail(404, "NOT_FOUND", "Transaction not found");
    if (opts.storeId && orig.storeId !== opts.storeId) fail(403, "FORBIDDEN", "Transaction belongs to another store");
    if (orig.status !== "COMPLETED") fail(409, "INVALID_STATUS_TRANSITION", `Cannot refund ${orig.status} transaction`);
    const shift = await tx.posShift.findUnique({ where: { id: shiftId }, include: { terminal: true } });
    if (!shift || shift.status !== "OPEN") fail(400, "VALIDATION", "Refund shift not open");
    if (shift.terminal.storeId !== orig.storeId) fail(403, "FORBIDDEN", "Refund shift belongs to another store");
    const claimed = await tx.posTransaction.updateMany({
      where: { id: orig.id, status: "COMPLETED" }, data: { status: "RETURNED" },
    });
    if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "Transaction was already refunded");

    const location = await tx.stockLocation.findFirst({
      where: { storeId: orig.storeId, type: "STORE_STOCKROOM" },
    });
    if (!location) fail(400, "VALIDATION", `No stockroom for store ${orig.storeId}`);
    for (const item of orig.items)
      await applyMovement(tx, {
        variantId: item.variantId, locationId: location.id, type: MovementType.RETURN,
        quantityDelta: item.quantity, refType: "pos_refund", refId: orig.id, userId,
      });

    for (const p of orig.payments) {
      if (p.method !== "GIFT_CARD" || !p.giftCardId || p.amount <= 0n) continue;
      const card = await tx.giftCard.update({ where: { id: p.giftCardId }, data: { balance: { increment: p.amount } } });
      await tx.giftCardTransaction.create({
        data: { giftCardId: card.id, amount: p.amount, balanceAfter: card.balance, refType: "pos_refund", refId: orig.id },
      });
    }

    // Reverse loyalty: claw back earned, restore redeemed. Fail if points were already spent.
    if (orig.customerId && (orig.loyaltyEarned > 0 || orig.loyaltyRedeemed > 0)) {
      const acct = await tx.loyaltyAccount.upsert({
        where: { customerId: orig.customerId },
        create: { customerId: orig.customerId },
        update: {},
      });
      const net = orig.loyaltyRedeemed - orig.loyaltyEarned;
      const adjusted = await tx.loyaltyAccount.updateMany({
        where: { id: acct.id, ...(net < 0 ? { points: { gte: -net } } : {}) },
        data: { points: { increment: net } },
      });
      if (adjusted.count !== 1) fail(400, "VALIDATION", "Customer no longer has enough points to revoke");
      const updated = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: acct.id } });
      if (net !== 0)
        await tx.loyaltyTransaction.create({
          data: {
            accountId: acct.id, points: net, balanceAfter: updated.points,
            type: net > 0 ? "EARN" : "REDEEM", refType: "pos_refund", refId: orig.id,
          },
        });
    }

    const number = await nextBusinessNumber("REF");
    const refund = await tx.posTransaction.create({
      data: {
        number, shiftId, storeId: orig.storeId, customerId: orig.customerId, status: "COMPLETED",
        subtotal: -orig.subtotal, discountTotal: -orig.discountTotal, total: -orig.total,
        loyaltyEarned: -orig.loyaltyEarned, loyaltyRedeemed: -orig.loyaltyRedeemed,
        items: { create: orig.items.map((i) => ({ variantId: i.variantId, quantity: -i.quantity, unitPrice: i.unitPrice, discount: -i.discount })) },
        payments: { create: orig.payments.map((p) => ({ method: p.method, amount: -p.amount })) },
      },
    });
    void opts.reason; // recorded in the audit log by the route
    return refund;
  }, TX_OPTIONS));
}

export async function openShift(terminalId: string, cashierId: string, openingCash: bigint) {
  const existing = await prisma.posShift.findFirst({
    where: { terminalId, status: "OPEN" },
  });
  if (existing) fail(409, "VALIDATION", "Terminal already has an open shift");
  try {
    return await prisma.posShift.create({ data: { terminalId, cashierId, openingCash } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      fail(409, "VALIDATION", "Terminal already has an open shift");
    throw error;
  }
}

export async function closeShift(shiftId: string, closingCash: bigint, userId?: string) {
  return withTxRetry(() =>
    prisma.$transaction(async (tx) => {
    const shift = await tx.posShift.findUnique({
      where: { id: shiftId },
      // A RETURNED (refunded) original still took real cash into the drawer at
      // sale time; its mirrored negative lives on a COMPLETED refund tx. Count
      // both or every refund silently understates the drawer by the sale amount.
      include: {
        transactions: {
          where: { status: { in: ["COMPLETED", "RETURNED"] } },
          include: { payments: true },
        },
      },
    });
    if (!shift || shift.status !== "OPEN") fail(400, "VALIDATION", "Shift not open");
    let cashTotal = 0n;
    for (const t of shift.transactions)
      for (const p of t.payments) if (p.method === "CASH") cashTotal += p.amount;
    const expected = shift.openingCash + cashTotal;
    const claimed = await tx.posShift.updateMany({
      where: { id: shiftId, status: "OPEN" },
      data: {
        status: "CLOSED",
        closingCash,
        expectedCash: expected,
        variance: closingCash - expected,
        closedAt: new Date(),
      },
    });
    if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "Shift was already closed");
    const closed = await tx.posShift.findUniqueOrThrow({ where: { id: shiftId } });
    await tx.auditLog.create({
      data: {
        actorId: userId ?? null, action: "shift.close", entity: "PosShift", entityId: shiftId,
        after: { variance: Number(closed.variance) },
      },
    });
    return closed;
  }, TX_OPTIONS));
}
