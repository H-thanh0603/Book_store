import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, nextBusinessNumber, ok } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
import { MovementType } from "@/generated/prisma/client";

// GET /api/supplier-returns — list with items (credit-note review)
export async function GET() {
  try {
    await requirePermission("inventory.view");
    const returns = await prisma.supplierReturn.findMany({
      include: { supplier: true, items: { include: { variant: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok({ returns });
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/supplier-returns { action: "create"|"ship", supplierId, locationId, items }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = await requirePermission("purchase.receive");
    if (body.action === "create") {
      if (!body.supplierId || !body.locationId || !Array.isArray(body.items) || body.items.length === 0)
        fail(400, "VALIDATION", "supplierId, locationId and items required");
      const location = await prisma.stockLocation.findUnique({ where: { id: body.locationId } });
      if (!location) fail(404, "NOT_FOUND", "Supplier-return location not found");
      await requirePermission("purchase.receive", location.storeId ?? undefined);
      for (const item of body.items)
        if (!item.variantId || !Number.isInteger(item.quantity) || item.quantity <= 0)
          fail(400, "VALIDATION", "each item needs a variantId and positive quantity");
      const supplierReturn = await prisma.supplierReturn.create({
        data: {
          number: await nextBusinessNumber("SRT"), supplierId: body.supplierId, locationId: body.locationId,
          reason: typeof body.reason === "string" ? body.reason : null,
          items: { create: body.items.map((item: { variantId: string; quantity: number }) => ({ variantId: item.variantId, quantity: item.quantity })) },
        },
      });
      return ok({ id: supplierReturn.id, number: supplierReturn.number, status: supplierReturn.status }, 201);
    }
    if (body.action !== "ship" || !body.supplierReturnId) fail(400, "VALIDATION", "Unknown action");
    const supplierReturn = await prisma.$transaction(async (tx) => {
      const current = await tx.supplierReturn.findUnique({ where: { id: body.supplierReturnId }, include: { items: true } });
      if (!current) fail(404, "NOT_FOUND", "Supplier return not found");
      const location = await tx.stockLocation.findUnique({ where: { id: current.locationId } });
      await requirePermission("purchase.receive", location?.storeId ?? undefined);
      if (current.status !== "DRAFT") fail(409, "INVALID_STATUS_TRANSITION", "Supplier return was already shipped");
      for (const item of current.items) {
        await applyMovement(tx, {
          variantId: item.variantId, locationId: current.locationId, type: MovementType.SUPPLIER_RETURN,
          quantityDelta: -item.quantity, refType: "supplier_return", refId: current.id, userId: auth.userId,
        });
      }
      return tx.supplierReturn.update({ where: { id: current.id }, data: { status: "SHIPPED" } });
    });
    return ok({ number: supplierReturn.number, status: supplierReturn.status });
  } catch (err) {
    return apiError(err);
  }
}
