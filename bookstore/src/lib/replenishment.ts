import { prisma } from "./db";
import { Prisma } from "../generated/prisma/client";
import { getSystemConfig } from "./api";
import { calculateReplenishment } from "./replenishment-formula";

/**
 * Agent 4 v2: per-variant supplier lead time (latest SupplierProductPrice's
 * supplier), trend via previous sales window, and store balancing — when a
 * sibling location of the same store holds surplus, record it in the rationale
 * so staff can transfer instead of ordering.
 */
export async function generateReplenishmentSuggestions() {
  const [historyDays, safetyStock, defaultLeadTimeDays] = await Promise.all([
    getSystemConfig("replenishment.historyDays", 30),
    getSystemConfig("replenishment.safetyStock", 10),
    getSystemConfig("replenishment.defaultLeadTimeDays", 7),
  ]);
  const since = new Date(Date.now() - historyDays * 86_400_000);
  const priorSince = new Date(since.valueOf() - historyDays * 86_400_000);
  const [balances, sales, priorSales] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where: { location: { active: true }, variant: { active: true } },
      include: { variant: { include: { product: true } }, location: { select: { id: true, storeId: true } } },
    }),
    prisma.inventoryMovement.groupBy({
      by: ["variantId", "locationId"], where: { type: "SALE", createdAt: { gte: since } }, _sum: { quantity: true },
    }),
    prisma.inventoryMovement.groupBy({
      by: ["variantId", "locationId"], where: { type: "SALE", createdAt: { gte: priorSince, lt: since } }, _sum: { quantity: true },
    }),
  ]);
  const soldByBalance = new Map(sales.map((row) => [`${row.variantId}:${row.locationId}`, Math.max(0, -(row._sum.quantity ?? 0))]));
  const priorByBalance = new Map(priorSales.map((row) => [`${row.variantId}:${row.locationId}`, Math.max(0, -(row._sum.quantity ?? 0))]));

  // Lead time + cost: latest supplier price per variant names the sourcing supplier.
  const variantIds = [...new Set(balances.map((b) => b.variantId))];
  const prices = await prisma.supplierProductPrice.findMany({
    where: { variantId: { in: variantIds } },
    orderBy: { recordedAt: "desc" },
    include: { supplier: { select: { leadTimeDays: true } } },
  });
  const sourcingByVariant = new Map<string, { leadTimeDays: number; unitCost: bigint }>();
  for (const price of prices)
    if (!sourcingByVariant.has(price.variantId))
      sourcingByVariant.set(price.variantId, { leadTimeDays: price.supplier.leadTimeDays, unitCost: price.unitCost });

  await Promise.all(balances.map(async (balance) => {
    const key = `${balance.variantId}:${balance.locationId}`;
    const soldUnits = soldByBalance.get(key) ?? 0;
    const priorSoldUnits = priorByBalance.get(key) ?? 0;
    const availableQty = balance.onHand - balance.reserved;
    const sourcing = sourcingByVariant.get(balance.variantId);
    const forecast = calculateReplenishment({
      soldUnits, priorSoldUnits, historyDays, availableQty,
      incomingQty: balance.inTransit, safetyStock,
      leadTimeDays: sourcing?.leadTimeDays ?? defaultLeadTimeDays,
    });
    const rationale = {
      historyDays, soldUnits, priorSoldUnits, daysOfCover: forecast.daysOfCover,
      leadTimeSource: sourcing ? "supplier" : "default",
      ...(sourcing ? { unitCost: Number(sourcing.unitCost) } : {}),
      formula: "ceil(blend(current,prior avgDaily) * leadTimeDays + safetyStock - available - incoming)",
    } satisfies Prisma.InputJsonValue;

    return prisma.replenishmentSuggestion.upsert({
      where: { variantId_locationId: { variantId: balance.variantId, locationId: balance.locationId } },
      create: {
        variantId: balance.variantId, locationId: balance.locationId,
        averageDailySales: forecast.averageDailySales, availableQty, incomingQty: balance.inTransit,
        safetyStock, leadTimeDays: sourcing?.leadTimeDays ?? defaultLeadTimeDays,
        recommendedQty: forecast.recommendedQty, rationale,
      },
      update: {
        averageDailySales: forecast.averageDailySales, availableQty, incomingQty: balance.inTransit,
        safetyStock, leadTimeDays: sourcing?.leadTimeDays ?? defaultLeadTimeDays,
        recommendedQty: forecast.recommendedQty,
        status: "OPEN", rationale, generatedAt: new Date(),
      },
    });
  }));

  // Store balancing: annotate OPEN suggestions whose variant sits in surplus at a
  // sibling location of the same store — a transfer beats a purchase order.
  const openSuggestions = await prisma.replenishmentSuggestion.findMany({
    where: { recommendedQty: { gt: 0 }, status: "OPEN" },
    include: { location: { select: { id: true, storeId: true } } },
  });
  const availability = await prisma.inventoryBalance.findMany({
    where: { variantId: { in: [...new Set(openSuggestions.map((s) => s.variantId))] } },
    select: { variantId: true, locationId: true, onHand: true, reserved: true },
  });
  const availByKey = new Map(availability.map((b) => [`${b.variantId}:${b.locationId}`, b.onHand - b.reserved]));
  const needByKey = new Map(openSuggestions.map((s) => [`${s.variantId}:${s.locationId}`, s.recommendedQty]));
  const storeOfLocation = new Map(balances.map((b) => [b.location.id, b.location.storeId]));

  await Promise.all(openSuggestions.map(async (suggestion) => {
    if (!suggestion.location.storeId) return;
    const siblings = availability.filter((b) =>
      b.locationId !== suggestion.locationId &&
      storeOfLocation.get(b.locationId) === suggestion.location.storeId &&
      (availByKey.get(`${b.variantId}:${b.locationId}`) ?? 0) > (needByKey.get(`${b.variantId}:${b.locationId}`) ?? 0)
    );
    if (siblings.length === 0) return;
    // ponytail: picks the first surplus sibling, not the nearest/most-surplus one;
    // rank by surplus once real stores report this matters.
    const source = siblings[0];
    const transferableQty = Math.min(
      suggestion.recommendedQty,
      (availByKey.get(`${source.variantId}:${source.locationId}`) ?? 0) - (needByKey.get(`${source.variantId}:${source.locationId}`) ?? 0),
    );
    await prisma.replenishmentSuggestion.update({
      where: { id: suggestion.id },
      data: { rationale: {
        ...(suggestion.rationale as Record<string, unknown>),
        balancedFrom: { locationId: source.locationId, qty: transferableQty },
      } },
    });
  }));

  return prisma.replenishmentSuggestion.findMany({
    where: { recommendedQty: { gt: 0 } },
    include: { variant: { include: { product: true } }, location: true },
    orderBy: { recommendedQty: "desc" },
  });
}
