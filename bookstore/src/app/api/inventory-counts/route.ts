import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, nextBusinessNumber, ok } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
import { MovementType } from "@/generated/prisma/client";

// POST /api/inventory-counts { action: "create"|"post", locationId, items:[{variantId,countedQty}] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = await requirePermission("inventory.adjust");
    if (body.action === "create") {
      if (!body.locationId || !Array.isArray(body.items) || body.items.length === 0)
        fail(400, "VALIDATION", "locationId and items required");
      const location = await prisma.stockLocation.findUnique({ where: { id: body.locationId } });
      if (!location) fail(404, "NOT_FOUND", "Count location not found");
      await requirePermission("inventory.adjust", location.storeId ?? undefined);
      const ids = body.items.map((item: { variantId: string }) => item.variantId);
      if (new Set(ids).size !== ids.length) fail(400, "VALIDATION", "A variant may be counted only once");
      const balances = await prisma.inventoryBalance.findMany({ where: { locationId: body.locationId, variantId: { in: ids } } });
      const count = await prisma.inventoryCount.create({
        data: {
          number: await nextBusinessNumber("CNT"), locationId: body.locationId, countedBy: auth.userId,
          items: { create: body.items.map((item: { variantId: string; countedQty: number }) => {
            if (!item.variantId || !Number.isInteger(item.countedQty) || item.countedQty < 0)
              fail(400, "VALIDATION", "each item needs a variantId and non-negative countedQty");
            return { variantId: item.variantId, countedQty: item.countedQty, expectedQty: balances.find((b) => b.variantId === item.variantId)?.onHand ?? 0 };
          }) },
        },
      });
      return ok({ id: count.id, number: count.number, status: count.status }, 201);
    }
    if (body.action !== "post" || !body.inventoryCountId) fail(400, "VALIDATION", "Unknown action");
    const count = await prisma.$transaction(async (tx) => {
      const current = await tx.inventoryCount.findUnique({ where: { id: body.inventoryCountId }, include: { items: true } });
      if (!current) fail(404, "NOT_FOUND", "Inventory count not found");
      const location = await tx.stockLocation.findUnique({ where: { id: current.locationId } });
      await requirePermission("inventory.adjust", location?.storeId ?? undefined);
      if (current.status !== "DRAFT") fail(409, "INVALID_STATUS_TRANSITION", "Inventory count was already posted");
      for (const item of current.items) {
        const balance = await tx.inventoryBalance.findUnique({ where: { variantId_locationId: { variantId: item.variantId, locationId: current.locationId } } });
        const delta = item.countedQty - (balance?.onHand ?? 0);
        if (delta) await applyMovement(tx, {
          variantId: item.variantId, locationId: current.locationId, type: MovementType.STOCK_ADJUSTMENT,
          quantityDelta: delta, refType: "inventory_count", refId: current.id, userId: auth.userId,
        });
        await tx.inventoryBalance.updateMany({ where: { variantId: item.variantId, locationId: current.locationId }, data: { lastCountAt: new Date() } });
      }
      return tx.inventoryCount.update({ where: { id: current.id }, data: { status: "POSTED", postedBy: auth.userId, postedAt: new Date() } });
    });
    return ok({ number: count.number, status: count.status });
  } catch (err) {
    return apiError(err);
  }
}
