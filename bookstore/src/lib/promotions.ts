// Promotion engine — rule-based, Phase 1 scope.
import { prisma } from "./db";
import { Prisma, PromoChannel } from "../generated/prisma/client";

export type CartLine = {
  variantId: string;
  productId: string;
  categoryId: string;
  quantity: number;
  unitPrice: bigint;
};

export type AppliedPromo = {
  promoId: string;
  name: string;
  discountTotal: bigint;
  lineDiscounts: Map<string, bigint>; // variantId -> discount
};

/**
 * PROMO-001: atomically count one redemption for (promo, customer) inside the
 * caller's transaction. Upsert-with-guard mirrors the usedCount claim — the
 * updateMany only fires when the row is below the limit, so two concurrent
 * sales can never both pass. Null limit = still counted (for reporting) but
 * never capped.
 */
export async function claimRedemption(
  client: Prisma.TransactionClient,
  promoId: string,
  customerId: string,
  perCustomerLimit: number | null,
): Promise<void> {
  await client.promotionRedemption.upsert({
    where: { promotionId_customerId: { promotionId: promoId, customerId } },
    create: { promotionId: promoId, customerId, count: 1 },
    update: {}, // ensure the row exists; the guarded increment is below
  });
  const claimed = await client.promotionRedemption.updateMany({
    where: {
      promotionId: promoId,
      customerId,
      ...(perCustomerLimit === null ? {} : { count: { lt: perCustomerLimit } }),
    },
    data: { count: { increment: 1 } },
  });
  if (claimed.count !== 1)
    throw Object.assign(new Error("Per-customer promotion limit reached"), { status: 409, code: "VALIDATION" });
}

/**
 * Evaluate active promotions against a cart.
 * Non-stackable: highest-priority winner only. Stackable ones apply after.
 */
export async function evaluatePromotions(args: {
  lines: CartLine[];
  storeId?: string | null;
  channel: keyof typeof PromoChannel;
  customerId?: string | null;
  couponCode?: string | null;
}, client: Prisma.TransactionClient | typeof prisma = prisma): Promise<AppliedPromo[]> {
  const now = new Date();

  // Audit 2026-08-30 SEC-005: promotions are org-scoped now. Resolve the org
  // from the cart's store (or customer) so org A's coupon never discounts
  // org B's cart. Null org = legacy superadmin/cart without org context.
  let orgId: string | null = null;
  if (args.storeId) {
    orgId = (await client.store.findUnique({
      where: { id: args.storeId },
      select: { region: { select: { orgId: true } } },
    }))?.region.orgId ?? null;
  }
  if (!orgId && args.customerId) {
    orgId = (await client.customer.findUnique({
      where: { id: args.customerId },
      select: { orgId: true },
    }))?.orgId ?? null;
  }

  const promos = await client.promotion.findMany({
    where: {
      ...(orgId ? { orgId } : {}),
      active: true,
      startAt: { lte: now },
      OR: [{ endAt: null }, { endAt: { gte: now } }],
      AND: [
        { OR: [{ channel: "ALL" }, { channel: args.channel }] },
      ],
    },
    include: { stores: true },
  });

  // PROMO-001 (audit 2026-08-30): per-customer limits. One batched lookup of
  // the caller's redemption counts for every candidate promo with a limit.
  const perLimited = promos.filter((p) => p.perCustomerLimit !== null && args.customerId);
  const redeemed = new Map<string, number>();
  if (perLimited.length > 0 && args.customerId) {
    const rows = await client.promotionRedemption.findMany({
      where: { customerId: args.customerId, promotionId: { in: perLimited.map((p) => p.id) } },
      select: { promotionId: true, count: true },
    });
    for (const r of rows) redeemed.set(r.promotionId, r.count);
  }

  const scoped = promos.filter((p) => {
    if (p.stores.length > 0 && (!args.storeId || !p.stores.some((s) => s.storeId === args.storeId)))
      return false;
    if (p.memberOnly && !args.customerId) return false;
    if (p.code && p.code.toUpperCase() !== args.couponCode?.trim().toUpperCase()) return false;
    if (p.usageLimit !== null && p.usedCount >= p.usageLimit) return false;
    if (p.perCustomerLimit !== null && args.customerId
      && (redeemed.get(p.id) ?? 0) >= p.perCustomerLimit) return false;
    return true;
  });

  const applied: AppliedPromo[] = [];
  const nonStackable = scoped.filter((p) => !p.stackable).sort((a, b) => b.priority - a.priority);
  const stackable = scoped.filter((p) => p.stackable).sort((a, b) => b.priority - a.priority);

  for (const promo of [...nonStackable.slice(0, 1), ...stackable]) {
    const eligible = args.lines.filter(
      (l) => !promo.categoryId || l.categoryId === promo.categoryId
    );
    const totalQty = eligible.reduce((s, l) => s + l.quantity, 0);
    if (totalQty < Math.max(promo.minQty, promo.type === "buy_x_get_y" ? (promo.buyQty ?? 1) : 1))
      continue;

    const lineDiscounts = new Map<string, bigint>();
    let discountTotal = 0n;

    if (promo.type === "percentage") {
      for (const l of eligible) {
        const d = (l.unitPrice * BigInt(l.quantity) * promo.value) / 100n;
        lineDiscounts.set(l.variantId, (lineDiscounts.get(l.variantId) ?? 0n) + d);
        discountTotal += d;
      }
    } else if (promo.type === "fixed") {
      // spread fixed discount proportionally across eligible lines
      const totalValue = eligible.reduce((s, l) => s + l.unitPrice * BigInt(l.quantity), 0n);
      if (totalValue <= 0n) continue;
      for (const l of eligible) {
        const d = (l.unitPrice * BigInt(l.quantity) * promo.value) / totalValue;
        lineDiscounts.set(l.variantId, d);
        discountTotal += d;
      }
    } else {
      // buy_x_get_y: cheapest free units among eligible
      const buyQty = promo.buyQty ?? 1;
      const getQty = promo.getQty ?? 1;
      const groups = Math.floor(totalQty / (buyQty + getQty));
      const freeUnits = groups * getQty;
      const sorted = [...eligible].sort((a, b) =>
        a.unitPrice < b.unitPrice ? -1 : a.unitPrice > b.unitPrice ? 1 : 0
      );
      let remaining = freeUnits;
      for (const l of sorted) {
        if (remaining <= 0) break;
        const free = Math.min(l.quantity, remaining);
        const d = l.unitPrice * BigInt(free);
        lineDiscounts.set(l.variantId, (lineDiscounts.get(l.variantId) ?? 0n) + d);
        discountTotal += d;
        remaining -= free;
      }
    }

    if (discountTotal > 0n)
      applied.push({ promoId: promo.id, name: promo.name, discountTotal, lineDiscounts });
  }

  // cap: discounts never exceed line value per variant
  const caps = new Map<string, bigint>();
  for (const l of args.lines) caps.set(l.variantId, l.unitPrice * BigInt(l.quantity));
  const merged = new Map<string, bigint>();
  for (const ap of applied)
    for (const [vid, d] of ap.lineDiscounts) {
      const next = (merged.get(vid) ?? 0n) + d;
      const capped = next > caps.get(vid)! ? caps.get(vid)! : next;
      merged.set(vid, capped);
    }

  return applied.map((ap) => ({
    ...ap,
    discountTotal: ap.discountTotal, // per-promo reported; enforcement is the merged cap below
    lineDiscounts: ap.lineDiscounts,
  }));
}

/** Merged, capped per-line discounts — use this at checkout. */
export function mergeLineDiscounts(applied: AppliedPromo[], lines: CartLine[]): {
  byVariant: Map<string, bigint>;
  total: bigint;
} {
  const byVariant = new Map<string, bigint>();
  const caps = new Map(lines.map((l) => [l.variantId, l.unitPrice * BigInt(l.quantity)]));
  for (const ap of applied)
    for (const [vid, d] of ap.lineDiscounts) {
      const next = (byVariant.get(vid) ?? 0n) + d;
      const cap = caps.get(vid) ?? 0n;
      byVariant.set(vid, next > cap ? cap : next);
    }
  let total = 0n;
  for (const v of byVariant.values()) total += v;
  return { byVariant, total };
}
