import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, audit } from "@/lib/auth";
import { apiError, reqStr } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
import { MovementType } from "@/generated/prisma/client";

// POST /api/inventory/damage { variantId, locationId, qty, reason } — N2c.
// Records damaged/expired stock out of the balance via a DAMAGED movement
// (never a direct write), with a mandatory reason for the audit trail.
// Requires inventory:manage; location must belong to the caller's org.
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("inventory.manage");
    const body = await req.json().catch(() => ({}));
    const variantId = reqStr(body.variantId, "variantId", 64);
    const locationId = reqStr(body.locationId, "locationId", 64);
    const qty = body.qty;
    if (!Number.isInteger(qty) || qty <= 0 || qty > 10000)
      throw Object.assign(new Error("qty must be an integer between 1 and 10000"), { status: 400, code: "VALIDATION" });
    const reason = reqStr(body.reason, "reason", 500);

    const location = await prisma.stockLocation.findUnique({
      where: { id: locationId },
      include: { store: { include: { region: { select: { orgId: true } } } } },
    });
    if (!location) throw Object.assign(new Error("Location not found"), { status: 404, code: "NOT_FOUND" });
    if (auth.orgId && location.store?.region?.orgId !== auth.orgId)
      throw Object.assign(new Error("Location not found"), { status: 404, code: "NOT_FOUND" });
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, ...(auth.orgId ? { orgId: auth.orgId } : {}) },
      include: { product: { select: { name: true } } },
    });
    if (!variant) throw Object.assign(new Error("Variant not found"), { status: 404, code: "NOT_FOUND" });

    await prisma.$transaction(async (tx) => {
      await applyMovement(tx, {
        variantId,
        locationId,
        type: MovementType.DAMAGED,
        quantityDelta: -qty,
        damagedDelta: qty,
        refType: "damage",
        refId: `${variantId}:${locationId}:${Date.now()}`,
        userId: auth.userId,
      });
      await audit(auth.userId, "inventory.damage", "ProductVariant", variantId, {
        locationId,
        location: location.name,
        sku: variant.sku,
        product: variant.product.name,
        qty,
        reason,
      }, tx);
    });
    return NextResponse.json({ ok: true, qty, sku: variant.sku });
  } catch (e) {
    return apiError(e);
  }
}
