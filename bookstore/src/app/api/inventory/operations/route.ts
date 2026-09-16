// Agent 2: Inventory operations — movement history, adjustment approval workflow,
// low-stock report, aging report.
import { NextRequest } from "next/server";
import { prisma, TX_OPTIONS } from "@/lib/db";
import { assertStoreAccess, requirePermission, resolveStoreScope } from "@/lib/auth";
import { apiError, ok, fail, nextBusinessNumber } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
import { MovementType, Prisma } from "@/generated/prisma/client";

// GET /api/inventory/operations?view=movements|low-stock|aging&locationId=&variantId=&days=
export async function GET(req: NextRequest) {
  try {
    await requirePermission("inventory.view");
    const sp = req.nextUrl.searchParams;
    const view = sp.get("view") ?? "movements";
    const locationId = sp.get("locationId") ?? undefined;
    const variantId = sp.get("variantId") ?? undefined;
    // Store-scoped roles only see balances/movements in their own stores.
    const scope = await resolveStoreScope(await requirePermission("inventory.view"), sp.get("storeId"), "inventory.view");
    const locationWhere = { ...(locationId ? { id: locationId } : {}), ...(scope ? { storeId: { in: scope } } : {}) };

    if (view === "movements") {
      const movements = await prisma.inventoryMovement.findMany({
        where: { variantId, location: locationWhere },
        include: { variant: { select: { sku: true, product: { select: { name: true } } } }, location: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return ok({ movements });
    }

    if (view === "low-stock") {
      // P2-1: available/reorder-point used to compute in JS over every
      // balance in scope. CTE the 30d sales rate and filter/order in SQL.
      const since = new Date(Date.now() - 30 * 86400_000);
      const storeFilter = scope ? Prisma.sql`AND l."storeId" IN (${Prisma.join(scope)})` : Prisma.empty;
      const locFilter = locationId ? Prisma.sql`AND b."locationId" = ${locationId}` : Prisma.empty;
      const rows = await prisma.$queryRaw<{
        variantId: string; locationId: string; sku: string; product: string;
        location: string; onHand: number; reserved: number;
        available: number; reorderPoint: number;
      }[]>`
        WITH sales AS (
          SELECT "variantId", "locationId", ABS(SUM(quantity)) / 30.0 AS daily
          FROM "InventoryMovement"
          WHERE type = 'SALE' AND "createdAt" >= ${since}
          GROUP BY "variantId", "locationId"
        )
        SELECT b."variantId", b."locationId", v.sku,
               pr.name AS product, l.name AS location,
               b."onHand" AS "onHand", b.reserved AS reserved,
               (b."onHand" - b.reserved)::int AS available,
               CEIL(COALESCE(s.daily, 0) * 7 * 1.2)::int AS "reorderPoint"
        FROM "InventoryBalance" b
        JOIN "ProductVariant" v ON v.id = b."variantId"
        JOIN "Product" pr ON pr.id = v."productId"
        JOIN "StockLocation" l ON l.id = b."locationId"
        LEFT JOIN sales s ON s."variantId" = b."variantId" AND s."locationId" = b."locationId"
        WHERE v.active ${storeFilter} ${locFilter}
          AND (b."onHand" - b.reserved) <= CEIL(COALESCE(s.daily, 0) * 7 * 1.2)
          AND (COALESCE(s.daily, 0) > 0 OR (b."onHand" - b.reserved) <= 5)
        ORDER BY ((b."onHand" - b.reserved) - CEIL(COALESCE(s.daily, 0) * 7 * 1.2)) ASC
        LIMIT 100`;
      return ok({ lowStock: rows });
    }

    if (view === "aging") {
      // P2-1: same treatment — last-outbound lookup + sort/slice in SQL.
      const lookbackDays = Math.min(Math.max(Number(sp.get("days")) || 180, 30), 365);
      const windowStart = new Date(Date.now() - lookbackDays * 86_400_000);
      const storeFilter = scope ? Prisma.sql`AND l."storeId" IN (${Prisma.join(scope)})` : Prisma.empty;
      const locFilter = locationId ? Prisma.sql`AND b."locationId" = ${locationId}` : Prisma.empty;
      const varFilter = variantId ? Prisma.sql`AND b."variantId" = ${variantId}` : Prisma.empty;
      const rows = await prisma.$queryRaw<{
        sku: string; product: string; location: string; onHand: number;
        lastOutboundAt: Date | null; daysSinceMovement: number | null;
      }[]>`
        WITH last_out AS (
          SELECT "variantId", "locationId", MAX("createdAt") AS last_out
          FROM "InventoryMovement"
          WHERE quantity < 0 AND "createdAt" >= ${windowStart}
          GROUP BY "variantId", "locationId"
        )
        SELECT v.sku, pr.name AS product, l.name AS location,
               b."onHand" AS "onHand", o.last_out AS "lastOutboundAt",
               (EXTRACT(EPOCH FROM (now() - o.last_out)) / 86400)::int AS "daysSinceMovement"
        FROM "InventoryBalance" b
        JOIN "ProductVariant" v ON v.id = b."variantId"
        JOIN "Product" pr ON pr.id = v."productId"
        JOIN "StockLocation" l ON l.id = b."locationId"
        LEFT JOIN last_out o ON o."variantId" = b."variantId" AND o."locationId" = b."locationId"
        WHERE b."onHand" > 0 ${storeFilter} ${locFilter} ${varFilter}
        ORDER BY o.last_out NULLS FIRST
        LIMIT 100`;
      return ok({ aging: rows.map((r) => ({ ...r, daysSinceMovement: r.lastOutboundAt ? r.daysSinceMovement : null })) });
    }

    fail(400, "VALIDATION", "Unknown view");
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/inventory/operations — adjustment approval workflow
// { action: "create" | "submit" | "approve" | "reject" | "direct", ... }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "create" || body.action === "submit" || body.action === "direct") {
      const auth = await requirePermission("inventory.adjust");
      if (!body.locationId || !Array.isArray(body.items) || body.items.length === 0)
        fail(400, "VALIDATION", "locationId and items required");
      const ids: string[] = body.items.map((i: { variantId: string }) => i.variantId);
      if (new Set(ids).size !== ids.length) fail(400, "VALIDATION", "A variant may appear only once");
      for (const item of body.items) {
        if (!item.variantId || !Number.isInteger(item.countedQty) || item.countedQty < 0)
          fail(400, "VALIDATION", "each item needs variantId and non-negative integer countedQty");
      }
      const location = await prisma.stockLocation.findUnique({ where: { id: body.locationId } });
      if (!location) fail(404, "NOT_FOUND", "Inventory location not found");
      assertStoreAccess(auth, location.storeId, "inventory.adjust");
      const balances = await prisma.inventoryBalance.findMany({ where: { locationId: body.locationId, variantId: { in: ids } } });

      // direct adjustment applies immediately with its own approval permission
      if (body.action === "direct") {
        await requirePermission("admin.config", null);
        const number = await nextBusinessNumber("ADJ");
        const adj = await prisma.$transaction(async (tx) => {
          const a = await tx.inventoryAdjustment.create({
            data: {
              number, locationId: body.locationId, reason: body.reason ?? "direct_adjustment",
              status: "APPROVED", createdBy: auth.userId, reviewedBy: auth.userId, reviewedAt: new Date(),
              items: { create: body.items.map((i: { variantId: string; countedQty: number }) => ({
                variantId: i.variantId, countedQty: i.countedQty,
                expectedQty: balances.find((bal) => bal.variantId === i.variantId)?.onHand ?? 0,
              })) },
            },
            include: { items: true },
          });
          for (const item of a.items) {
            const delta = item.countedQty - item.expectedQty;
            if (delta) await applyMovement(tx, {
              variantId: item.variantId, locationId: body.locationId, type: MovementType.STOCK_ADJUSTMENT,
              quantityDelta: delta, refType: "adjustment_approval", refId: a.id, userId: auth.userId,
            });
          }
          return a;
        }, TX_OPTIONS);
        await prisma.auditLog.create({ data: { actorId: auth.userId, action: "adjustment.direct", entity: "InventoryAdjustment", entityId: adj.id, after: { number } } });
        return ok({ number: adj.number, status: adj.status }, 201);
      }

      const number = await nextBusinessNumber("ADJ");
      const adj = await prisma.inventoryAdjustment.create({
        data: {
          number, locationId: body.locationId, reason: body.reason ?? "stock_count_correction",
          createdBy: auth.userId,
          items: { create: body.items.map((i: { variantId: string; countedQty: number }) => ({
            variantId: i.variantId, countedQty: i.countedQty,
            expectedQty: balances.find((bal) => bal.variantId === i.variantId)?.onHand ?? 0,
          })) },
        },
        include: { items: true },
      });
      if (body.action === "submit") await prisma.inventoryAdjustment.update({ where: { id: adj.id }, data: { status: "PENDING_APPROVAL" } });
      return ok({ number: adj.number, status: body.action === "submit" ? "PENDING_APPROVAL" : adj.status }, 201);
    }

    fail(400, "VALIDATION", "Unknown action — use PATCH for approve/reject");
  } catch (err) {
    return apiError(err);
  }
}

// PATCH /api/inventory/operations { adjustmentId, action: "approve"|"reject" }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = await requirePermission("purchase.approve"); // reuse an approver-level permission until Agent 1 finalizes the RBAC matrix
    if (!body.adjustmentId || !["approve", "reject"].includes(body.action)) fail(400, "VALIDATION", "adjustmentId and action approve|reject required");
    const adj = await prisma.inventoryAdjustment.findUnique({ where: { id: body.adjustmentId }, include: { items: true } });
    if (!adj) fail(404, "NOT_FOUND", "Adjustment not found");
    const location = await prisma.stockLocation.findUnique({ where: { id: adj.locationId } });
    if (!location) fail(404, "NOT_FOUND", "Adjustment location not found");
    assertStoreAccess(auth, location.storeId, "purchase.approve");
    if (adj.status !== "PENDING_APPROVAL") fail(409, "INVALID_STATUS_TRANSITION", `Adjustment is ${adj.status}`);
    if (adj.createdBy === auth.userId) fail(403, "VALIDATION", "Creator cannot approve their own adjustment");

    if (body.action === "reject") {
      const rejected = await prisma.inventoryAdjustment.updateMany({
        where: { id: adj.id, status: "PENDING_APPROVAL" },
        data: { status: "REJECTED", reviewedBy: auth.userId, reviewedAt: new Date() },
      });
      if (rejected.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "Adjustment was already reviewed");
      await prisma.auditLog.create({ data: { actorId: auth.userId, action: "adjustment.reject", entity: "InventoryAdjustment", entityId: adj.id } });
      return ok({ number: adj.number, status: "REJECTED" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.inventoryAdjustment.updateMany({
        where: { id: adj.id, status: "PENDING_APPROVAL" },
        data: { status: "APPROVED", reviewedBy: auth.userId, reviewedAt: new Date() },
      });
      if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "Adjustment was already reviewed");
      for (const item of adj.items) {
        const balance = await tx.inventoryBalance.findUnique({
          where: { variantId_locationId: { variantId: item.variantId, locationId: adj.locationId } },
        });
        const delta = item.countedQty - (balance?.onHand ?? 0);
        if (delta) await applyMovement(tx, {
          variantId: item.variantId, locationId: adj.locationId, type: MovementType.STOCK_ADJUSTMENT,
          quantityDelta: delta, refType: "adjustment_approval", refId: adj.id, userId: auth.userId,
        });
      }
      return tx.inventoryAdjustment.findUniqueOrThrow({ where: { id: adj.id } });
    }, TX_OPTIONS);
    await prisma.auditLog.create({ data: { actorId: auth.userId, action: "adjustment.approve", entity: "InventoryAdjustment", entityId: adj.id, after: { number: adj.number } } });
    return ok({ number: updated.number, status: updated.status });
  } catch (err) {
    return apiError(err);
  }
}
