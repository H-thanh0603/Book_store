import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, nextBusinessNumber, toMoney } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
import { MovementType, PoStatus } from "@/generated/prisma/client";

// POST /api/purchase-orders { supplierId, warehouseId, items:[{variantId,quantity,unitCost}], action:"create"|"approve"|"receive" }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "create") {
      const auth = await requirePermission("purchase.create");
      if (!Array.isArray(body.items) || body.items.length === 0)
        fail(400, "VALIDATION", "items required");
      const number = await nextBusinessNumber("PO");
      const po = await prisma.purchaseOrder.create({
        data: {
          number,
          supplierId: body.supplierId,
          warehouseId: body.warehouseId,
          status: "pending_approval",
          orderedBy: auth.userId,
          expectedDate: body.expectedDate ? new Date(body.expectedDate) : null,
          items: {
            create: body.items.map((i: any) => ({
              variantId: i.variantId,
              quantity: i.quantity,
              unitCost: toMoney(i.unitCost, "unitCost"),
            })),
          },
        },
        include: { items: true },
      });
      return ok({ id: po.id, number: po.number, status: po.status }, 201);
    }

    if (body.action === "approve") {
      const auth = await requirePermission("purchase.approve");
      const po = await prisma.purchaseOrder.update({
        where: { id: body.poId },
        data: { status: "approved", approvedBy: auth.userId },
      });
      return ok({ number: po.number, status: po.status });
    }

    if (body.action === "receive") {
      const auth = await requirePermission("purchase.receive");
      if (!Array.isArray(body.items)) fail(400, "VALIDATION", "items required");

      const result = await prisma.$transaction(async (tx) => {
        const po = await tx.purchaseOrder.findUnique({
          where: { id: body.poId },
          include: { items: true },
        });
        if (!po) fail(404, "NOT_FOUND", "PO not found");
        if (!["approved", "sent", "partially_received"].includes(po.status))
          fail(409, "INVALID_STATUS_TRANSITION", `Cannot receive PO in status ${po.status}`);

        const number = await nextBusinessNumber("GRN");
        const receipt = await tx.goodsReceipt.create({
          data: {
            number, poId: po.id, receivedBy: auth.userId,
            items: {
              create: body.items.map((i: any) => ({
                variantId: i.variantId, quantity: i.quantity, damagedQty: i.damagedQty ?? 0,
              })),
            },
          },
        });

        // Find warehouse main location
        const loc = await tx.stockLocation.findFirst({
          where: { warehouseId: po.warehouseId },
        });
        if (!loc) fail(400, "VALIDATION", "Warehouse has no stock location");

        for (const item of body.items) {
          const poItem = po.items.find((p) => p.variantId === item.variantId);
          if (!poItem) fail(400, "VALIDATION", `Variant ${item.variantId} not in PO`);
          const goodQty = item.quantity - (item.damagedQty ?? 0);
          if (poItem.receivedQty + item.quantity > poItem.quantity)
            fail(400, "VALIDATION", `Over-receipt for ${item.variantId}`);
          await tx.purchaseOrderItem.update({
            where: { id: poItem.id },
            data: { receivedQty: { increment: item.quantity } },
          });
          // damaged goes into balance as damaged, good qty into on_hand — both ledgered
          await applyMovement(tx, {
            variantId: item.variantId, locationId: loc.id,
            type: goodQty > 0 ? MovementType.PURCHASE_RECEIPT : MovementType.DAMAGED,
            quantityDelta: goodQty,
            damagedDelta: item.damagedQty ?? 0,
            refType: "goods_receipt", refId: receipt.id, userId: auth.userId,
          });
        }

        // Update PO status
        const updatedItems = await tx.purchaseOrderItem.findMany({ where: { poId: po.id } });
        const allReceived = updatedItems.every((i) => i.receivedQty >= i.quantity);
        const anyReceived = updatedItems.some((i) => i.receivedQty > 0);
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { status: allReceived ? "received" : anyReceived ? "partially_received" : po.status },
        });

        await tx.auditLog.create({
          data: { actorId: auth.userId, action: "purchase.receive", entity: "GoodsReceipt", entityId: receipt.id },
        });
        return receipt;
      });
      return ok({ number: result.number }, 201);
    }

    fail(400, "VALIDATION", "Unknown action");
  } catch (err) {
    return apiError(err);
  }
}

// GET /api/purchase-orders
export async function GET() {
  try {
    await requirePermission("purchase.create");
    const pos = await prisma.purchaseOrder.findMany({
      include: { supplier: true, items: { include: { variant: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok({ purchaseOrders: pos });
  } catch (err) {
    return apiError(err);
  }
}
