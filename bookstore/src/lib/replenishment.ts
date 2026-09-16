import { prisma, TX_OPTIONS } from "./db";
import { Prisma, SuggestionStatus } from "../generated/prisma/client";
import { getSystemConfig, fail } from "./api";
import { assertStoreAccess } from "./auth";
import { createPurchaseOrder, createTransfer } from "./purchasing";
import { calculateReplenishment } from "./replenishment-formula";

const REPLENISHMENT_BATCH = 20;

/**
 * Agent 4 v2: per-variant supplier lead time (latest SupplierProductPrice's
 * supplier), trend via previous sales window, and store balancing — when a
 * sibling location of the same store holds surplus, record it in the rationale
 * so staff can transfer instead of ordering.
 */
export async function generateReplenishmentSuggestions(orgId?: string | null) {
  const [historyDays, safetyStock, defaultLeadTimeDays] = await Promise.all([
    getSystemConfig("replenishment.historyDays", 30),
    getSystemConfig("replenishment.safetyStock", 10),
    getSystemConfig("replenishment.defaultLeadTimeDays", 7),
  ]);
  const since = new Date(Date.now() - historyDays * 86_400_000);
  const priorSince = new Date(since.valueOf() - historyDays * 86_400_000);
  // P0-3: previously scanned every tenant's balances/movements and wrote
  // cross-org suggestions. Scope all inputs to the caller's org.
  const balanceWhere = {
    location: {
      active: true,
      ...(orgId ? { OR: [{ store: { orgId } }, { storeId: null }] } : {}),
    },
    variant: { active: true, ...(orgId ? { orgId } : {}) },
  };
  const [balances, sales, priorSales] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where: balanceWhere,
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

  // Lead time + cost: cheapest recent supplier price per variant names the
  // sourcing supplier (P4-5: was latest-recorded regardless of price).
  // DISTINCT ON pushes "cheapest recent per variant" into PostgreSQL instead
  // of shipping the whole price-history table to Node. Recency bound
  // (default 180d) keeps stale quotes from winning on price alone.
  const variantIds = [...new Set(balances.map((b) => b.variantId))];
  const priceLookbackDays = await getSystemConfig("replenishment.priceLookbackDays", 180);
  const priceSince = new Date(Date.now() - priceLookbackDays * 86_400_000);
  const latestPrices = await prisma.$queryRaw<
    { variantId: string; supplierId: string; leadTimeDays: number; unitCost: bigint }[]
  >`
    SELECT DISTINCT ON (spp."variantId")
           spp."variantId", spp."supplierId", s."leadTimeDays", spp."unitCost"
    FROM "SupplierProductPrice" spp
    JOIN "Supplier" s ON s.id = spp."supplierId"
    WHERE spp."variantId" = ANY(${variantIds}::text[])
      AND spp."recordedAt" >= ${priceSince}
      ${orgId ? Prisma.sql`AND s."orgId" = ${orgId}` : Prisma.empty}
    ORDER BY spp."variantId", spp."unitCost" ASC, spp."recordedAt" DESC
  `;
  const sourcingByVariant = new Map<string, { supplierId: string; leadTimeDays: number; unitCost: bigint }>();
  for (const row of latestPrices)
    sourcingByVariant.set(row.variantId, { supplierId: row.supplierId, leadTimeDays: row.leadTimeDays, unitCost: row.unitCost });

  // Upserts run in bounded batches instead of unbounded Promise.all — a big
  // catalog no longer opens hundreds of simultaneous queries against the pool.
  const suggestions = balances.map((balance) => {
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
      ...(sourcing ? { unitCost: Number(sourcing.unitCost), supplierId: sourcing.supplierId, sourcing: "cheapest-recent" } : {}),
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
  });
  for (let i = 0; i < suggestions.length; i += REPLENISHMENT_BATCH)
    await Promise.all(suggestions.slice(i, i + REPLENISHMENT_BATCH));

  // Store balancing: annotate OPEN suggestions whose variant sits in surplus at a
  // sibling location of the same store — a transfer beats a purchase order.
  // P0-3: both reads scoped to the org so balancing never pairs a suggestion
  // with a foreign location's surplus.
  const openSuggestions = await prisma.replenishmentSuggestion.findMany({
    where: {
      recommendedQty: { gt: 0 },
      status: "OPEN",
      ...(orgId
        ? {
            variant: { orgId },
            location: { OR: [{ store: { orgId } }, { storeId: null }] },
          }
        : {}),
    },
    include: { location: { select: { id: true, storeId: true } } },
  });
  const availability = await prisma.inventoryBalance.findMany({
    where: {
      variantId: { in: [...new Set(openSuggestions.map((s) => s.variantId))] },
      ...(orgId ? { variant: { orgId } } : {}),
    },
    select: { variantId: true, locationId: true, onHand: true, reserved: true },
  });
  const availByKey = new Map(availability.map((b) => [`${b.variantId}:${b.locationId}`, b.onHand - b.reserved]));
  const needByKey = new Map(openSuggestions.map((s) => [`${s.variantId}:${s.locationId}`, s.recommendedQty]));
  const storeOfLocation = new Map(balances.map((b) => [b.location.id, b.location.storeId]));

  const balancingUpdates = openSuggestions.map((suggestion) => {
    if (!suggestion.location.storeId) return null;
    const siblings = availability.filter((b) =>
      b.locationId !== suggestion.locationId &&
      storeOfLocation.get(b.locationId) === suggestion.location.storeId &&
      (availByKey.get(`${b.variantId}:${b.locationId}`) ?? 0) > (needByKey.get(`${b.variantId}:${b.locationId}`) ?? 0)
    );
    if (siblings.length === 0) return null;
    // ponytail: picks the first surplus sibling, not the nearest/most-surplus one;
    // rank by surplus once real stores report this matters.
    const source = siblings[0];
    const transferableQty = Math.min(
      suggestion.recommendedQty,
      (availByKey.get(`${source.variantId}:${source.locationId}`) ?? 0) - (needByKey.get(`${source.variantId}:${source.locationId}`) ?? 0),
    );
    return prisma.replenishmentSuggestion.update({
      where: { id: suggestion.id },
      data: { rationale: {
        ...(suggestion.rationale as Record<string, unknown>),
        balancedFrom: { locationId: source.locationId, qty: transferableQty },
      } },
    });
  });
  const pendingBalancing: Promise<unknown>[] = [];
  for (const update of balancingUpdates) if (update !== null) pendingBalancing.push(update);
  for (let i = 0; i < pendingBalancing.length; i += REPLENISHMENT_BATCH)
    await Promise.all(pendingBalancing.slice(i, i + REPLENISHMENT_BATCH));

  return prisma.replenishmentSuggestion.findMany({
    where: {
      recommendedQty: { gt: 0 },
      ...(orgId
        ? {
            variant: { orgId },
            location: { OR: [{ store: { orgId } }, { storeId: null }] },
          }
        : {}),
    },
    include: { variant: { include: { product: true } }, location: true },
    orderBy: { recommendedQty: "desc" },
  });
}

type StoreAuth = Parameters<typeof assertStoreAccess>[0] & { userId: string };

/**
 * Accepting a suggestion is approval-backed: it materializes the
 * recommendation as a draft transfer (store balancing) or pending_approval PO
 * (purchase). Shared by POST /api/replenishment and the staged-change
 * approval surface so both apply the exact same atomic flow.
 *
 * The status claim is atomic: only ONE accept/dismiss ever creates work for a
 * suggestion — double submits get a 409 instead of duplicate POs/transfers.
 */
export async function applySuggestionDecision(
  suggestionId: string,
  status: "ACCEPTED" | "DISMISSED",
  auth: StoreAuth,
): Promise<{ suggestionId: string; status: string; created: { kind: string; number?: string; id: string } | null }> {
  const suggestion = await prisma.replenishmentSuggestion.findUnique({
    where: { id: suggestionId },
    include: {
      variant: true,
      location: { include: { store: { select: { orgId: true } } } },
    },
  });
  if (!suggestion) fail(404, "NOT_FOUND", "Suggestion not found");
  // P0-3: the suggestion itself must belong to the caller's org — variant
  // org plus location store org. Otherwise org A accepts org B's suggestion
  // and materializes a foreign PO/transfer.
  if (auth.orgId) {
    const locOrg = suggestion.location.store?.orgId ?? null;
    if (suggestion.variant.orgId !== auth.orgId || (locOrg !== null && locOrg !== auth.orgId))
      fail(404, "NOT_FOUND", "Suggestion not found");
  }
  // Store scope: the caller must cover the suggestion's own location.
  assertStoreAccess(auth, suggestion.location.storeId, "purchase.create");

  const created = await prisma.$transaction(async (tx) => {
    const claimed = await tx.replenishmentSuggestion.updateMany({
      where: { id: suggestion.id, status: SuggestionStatus.OPEN },
      data: { status },
    });
    if (claimed.count !== 1)
      fail(409, "INVALID_STATUS_TRANSITION", `Suggestion is ${suggestion.status}, not OPEN`);

    let result: { kind: string; number?: string; id: string } | null = null;
    if (status === "ACCEPTED" && suggestion.recommendedQty > 0) {
      const balancedFrom = (suggestion.rationale as { balancedFrom?: { locationId: string; qty: number } }).balancedFrom;
      if (balancedFrom) {
        const sourceLoc = await tx.stockLocation.findUnique({
          where: { id: balancedFrom.locationId },
          include: { store: { select: { orgId: true } } },
        });
        if (!sourceLoc) fail(400, "VALIDATION", "Balancing source location no longer exists");
        if (auth.orgId && sourceLoc.store && sourceLoc.store.orgId !== auth.orgId)
          fail(404, "NOT_FOUND", "Balancing source location not found");
        assertStoreAccess(auth, sourceLoc.storeId, "purchase.create");
        const transfer = await createTransfer({
          fromLocationId: balancedFrom.locationId,
          toLocationId: suggestion.locationId,
          requestedBy: auth.userId,
          items: [{ variantId: suggestion.variantId, quantity: Math.min(balancedFrom.qty, suggestion.recommendedQty) }],
          client: tx,
        });
        result = { kind: "transfer", number: transfer.number, id: transfer.id };
      } else {
        // P4-5: source from the cheapest recent supplier quote recorded in
        // the rationale at generate time; fall back to a live cheapest
        // lookup so old suggestions still route correctly.
        const rationaleSourcing = (suggestion.rationale as { supplierId?: string } | null)?.supplierId;
        // P0-3: warehouses are global, but the sourcing supplier must be the
        // caller's own — otherwise the PO is raised against a foreign supplier.
        const warehouse = await tx.warehouse.findFirst({ where: { isCentral: true } })
          ?? await tx.warehouse.findFirst();
        const orgScope = auth.orgId ? { supplier: { orgId: auth.orgId } } : {};
        let price = rationaleSourcing
          ? await tx.supplierProductPrice.findFirst({
              where: { variantId: suggestion.variantId, supplierId: rationaleSourcing, ...orgScope },
              orderBy: { recordedAt: "desc" },
            })
          : null;
        price ??= await tx.supplierProductPrice.findFirst({
          where: { variantId: suggestion.variantId, ...orgScope },
          orderBy: [{ unitCost: "asc" }, { recordedAt: "desc" }],
        });
        if (!warehouse || !price) fail(400, "VALIDATION", "No warehouse or supplier price to source this PO");
        const po = await createPurchaseOrder({
          supplierId: price.supplierId,
          warehouseId: warehouse.id,
          userId: auth.userId,
          items: [{ variantId: suggestion.variantId, quantity: suggestion.recommendedQty, unitCost: price.unitCost }],
          client: tx,
        });
        result = { kind: "po", number: po.number, id: po.id };
      }
    }
    return result;
  }, TX_OPTIONS);

  return { suggestionId: suggestion.id, status, created };
}
