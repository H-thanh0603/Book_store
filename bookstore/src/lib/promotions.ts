// Promotion engine — rule-based, Phase 1 scope.
import { prisma } from "./db";
import { PromoChannel, Prisma } from "../generated/prisma/client";

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
 * Evaluate active promotions against a cart.
 * Non-stackable: highest-priority winner only. Stackable ones apply after.
 */
export async function evaluatePromotions(args: {
  lines: CartLine[];
  storeId?: string | null;
  channel: keyof typeof PromoChannel;
  customerId?: string | null;
}): Promise<AppliedPromo[]> {
  const now = new Date();
  const promos = await prisma.promotion.findMany({
    where: {
      active: true,
      startAt: { lte: now },
      OR: [{ endAt: null }, { endAt: { gte: now } }],
      AND: [
        { OR: [{ channel: "ALL" }, { channel: args.channel }] },
      ],
    },
    include: { stores: true },
  });

  const scoped = promos.filter((p) => {
    if (p.stores.length > 0 && (!args.storeId || !p.stores.some((s) => s.storeId === args.storeId)))
      return false;
    if (p.memberOnly && !args.customerId) return false;
    if (p.usageLimit !== null && p.usedCount >= p.usageLimit) return false;
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
  let mergedTotal = 0n;
  for (const ap of applied)
    for (const [vid, d] of ap.lineDiscounts) {
      const next = (merged.get(vid) ?? 0n) + d;
      const capped = next > caps.get(vid)! ? caps.get(vid)! : next;
      mergedTotal += capped - (merged.get(vid) ?? 0n) > 0n ? capped - (merged.get(vid) ?? 0n) : 0n;
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
