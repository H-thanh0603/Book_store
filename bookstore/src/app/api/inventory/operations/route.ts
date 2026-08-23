// Agent 2: Inventory operations — movement history, adjustment approval workflow,
// low-stock report, aging report.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertStoreAccess, requirePermission, resolveStoreScope } from "@/lib/auth";
import { apiError, ok, fail, nextBusinessNumber } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
import { MovementType } from "@/generated/prisma/client";

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
      // Available (onHand - reserved) below reorder point = avgDailySales*leadTime + safety(20%)
      const balances = await prisma.inventoryBalance.findMany({
        where: { location: locationWhere, variant: { active: true } },
        include: { variant: { select: { sku: true, product: { select: { name: true } } } }, location: { select: { name: true } } },
      });
      const since = new Date(Date.now() - 30 * 86400_000);
      const sales = await prisma.inventoryMovement.groupBy({
        by: ["variantId", "locationId"],
        where: { type: "SALE", createdAt: { gte: since } },
        _sum: { quantity: true },
      });
      const rateMap = new Map(sales.map((s) => [`${s.variantId}:${s.locationId}`, Math.abs(s._sum.quantity ?? 0) / 30]));
      const lowStock = balances
        .map((b) => {
          const daily = rateMap.get(`${b.variantId}:${b.locationId}`) ?? 0;
          const available = b.onHand - b.reserved;
          return { ...b, _daily: daily, available, reorderPoint: Math.ceil(daily * 7 * 1.2) };
        })
        .filter((b) => b.available <= b.reorderPoint && (b.reorderPoint > 0 || b.available <= 5))
        .sort((a, b) => a.available - a.reorderPoint - (b.available - b.reorderPoint))
        .slice(0, 100);
      return ok({ lowStock: lowStock.map((row) => { const { _daily, ...rest } = row; void _daily; return rest; }) });
    }

    if (view === "aging") {
      // Aging = days since last outbound movement per variant@location; no movement → age from balance creation.
      const balances = await prisma.inventoryBalance.findMany({
        where: { onHand: { gt: 0 }, location: locationWhere, variantId },
        include: { variant: { select: { sku: true, product: { select: { name: true } } } }, location: { select: { name: true } } },
      });
      const lastMoves = await prisma.inventoryMovement.groupBy({
        by: ["variantId", "locationId"],
        where: { quantity: { lt: 0 } },
        _max: { createdAt: true },
      });
      const lastMap = new Map(lastMoves.map((m) => [`${m.variantId}:${m.locationId}`, m._max.createdAt]));
      const aging = balances
        .map((b) => ({
          sku: b.variant.sku,
          product: b.variant.product.name,
          location: b.location.name,
          onHand: b.onHand,
          lastOutboundAt: lastMap.get(`${b.variantId}:${b.locationId}`) ?? null,
          daysSinceMovement: lastMap.get(`${b.variantId}:${b.locationId}`)
            ? Math.floor((Date.now() - lastMap.get(`${b.variantId}:${b.locationId}`)!.getTime()) / 86400_000)
            : null,
        }))
        .sort((a, b) => (b.daysSinceMovement ?? 9999) - (a.daysSinceMovement ?? 9999))
        .slice(0, 100);
      return ok({ aging });
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
        });
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
    });
    await prisma.auditLog.create({ data: { actorId: auth.userId, action: "adjustment.approve", entity: "InventoryAdjustment", entityId: adj.id, after: { number: adj.number } } });
    return ok({ number: updated.number, status: updated.status });
  } catch (err) {
    return apiError(err);
  }
}
