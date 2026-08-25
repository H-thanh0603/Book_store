import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, audit } from "@/lib/auth";
import { apiError, ok, fail, nextBusinessNumber, toMoney, optDate } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
import { MovementType } from "@/generated/prisma/client";

type PoItemInput = { variantId: string; quantity: number; unitCost?: unknown; damagedQty?: number };

function parseItems(raw: unknown): PoItemInput[] {
  if (!Array.isArray(raw) || raw.length === 0) fail(400, "VALIDATION", "items required");
  return raw.map((i: Record<string, unknown>) => {
    const item = i as { variantId?: unknown; quantity?: unknown; unitCost?: unknown; damagedQty?: unknown };
    if (typeof item.variantId !== "string" || !item.variantId)
      fail(400, "VALIDATION", "Each item needs a variantId");
    if (!Number.isInteger(item.quantity) || (item.quantity as number) <= 0)
      fail(400, "VALIDATION", "quantity must be a positive integer");
    // keep unitCost/damagedQty — the create branch validates unitCost via toMoney
    return { variantId: item.variantId, quantity: item.quantity as number,
      unitCost: item.unitCost ?? null, damagedQty: typeof item.damagedQty === "number" ? item.damagedQty : undefined };
  });
}

// POST /api/purchase-orders { supplierId, warehouseId, items:[{variantId,quantity,unitCost}], action:"create"|"approve"|"receive" }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "create") {
      const auth = await requirePermission("purchase.create");
      // FK targets validated up front: junk ids surface as 404, not P2003 → 500.
      const supplier = await prisma.supplier.findUnique({ where: { id: body.supplierId } });
      if (!supplier) fail(404, "NOT_FOUND", "Supplier not found");
      const warehouse = await prisma.warehouse.findUnique({ where: { id: body.warehouseId } });
      if (!warehouse) fail(404, "NOT_FOUND", "Warehouse not found");
      const items = parseItems(body.items).map((item: PoItemInput) => ({
        ...item,
        unitCost: toMoney(item.unitCost, "unitCost"),
      }));
      const number = await nextBusinessNumber("PO");
      const po = await prisma.$transaction(async (tx) => {
        const created = await tx.purchaseOrder.create({
          data: {
            number,
            supplierId: body.supplierId,
            warehouseId: body.warehouseId,
            // Agent 2: purchase request — asRequest creates a draft that must be
            // submitted for approval before it can be approved.
            status: body.asRequest ? "draft" : "pending_approval",
            orderedBy: auth.userId,
            // Garbage date strings become a 400 here instead of Invalid Date → Prisma 500.
            expectedDate: optDate(body.expectedDate, "expectedDate"),
            items: {
              create: items.map((item: { variantId: string; quantity: number; unitCost: bigint }) => ({
                variantId: item.variantId,
                quantity: item.quantity,
                unitCost: item.unitCost,
              })),
            },
          },
          include: { items: true },
        });
        await audit(auth.userId, "purchase_order.create", "PurchaseOrder", created.id, { number }, tx);
        return created;
      });
      return ok({ id: po.id, number: po.number, status: po.status }, 201);
    }

    // Agent 2: submit a draft purchase request for approval
    if (body.action === "submit") {
      const auth = await requirePermission("purchase.create");
      const po = await prisma.$transaction(async (tx) => {
        const current = await tx.purchaseOrder.findUnique({ where: { id: body.poId } });
        if (!current) fail(404, "NOT_FOUND", "PO not found");
        if (current.status !== "draft")
          fail(409, "INVALID_STATUS_TRANSITION", `Cannot submit PO in status ${current.status}`);
        const claimed = await tx.purchaseOrder.updateMany({
          where: { id: current.id, status: "draft" },
          data: { status: "pending_approval" },
        });
        if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "PO was already submitted");
        const updated = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: current.id } });
        await audit(auth.userId, "purchase_order.submit", "PurchaseOrder", current.id, { number: current.number }, tx);
        return updated;
      });
      return ok({ number: po.number, status: po.status });
    }

    if (body.action === "approve") {
      const auth = await requirePermission("purchase.approve");
      const po = await prisma.$transaction(async (tx) => {
        const current = await tx.purchaseOrder.findUnique({ where: { id: body.poId } });
        if (!current) fail(404, "NOT_FOUND", "PO not found");
        // Self-approval blocked: creator cannot approve their own PO.
        if (current.orderedBy === auth.userId)
          fail(403, "FORBIDDEN", "Cannot approve your own purchase order");
        if (current.status !== "pending_approval")
          fail(409, "INVALID_STATUS_TRANSITION", `Cannot approve PO in status ${current.status}`);
        const claimed = await tx.purchaseOrder.updateMany({
          where: { id: current.id, status: "pending_approval" },
          data: { status: "approved", approvedBy: auth.userId },
        });
        if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "PO was already reviewed");
        const updated = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: current.id } });
        await audit(auth.userId, "purchase_order.approve", "PurchaseOrder", current.id, { number: current.number }, tx);
        return updated;
      });
      return ok({ number: po.number, status: po.status });
    }

    if (body.action === "receive") {
      const auth = await requirePermission("purchase.receive");
      if (!Array.isArray(body.items)) fail(400, "VALIDATION", "items required");

      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${body.poId} FOR UPDATE`;
        const po = await tx.purchaseOrder.findUnique({
          where: { id: body.poId },
          include: { items: true },
        });
        if (!po) fail(404, "NOT_FOUND", "PO not found");
        if (![ "approved", "sent", "partially_received" ].includes(po.status))
          fail(409, "INVALID_STATUS_TRANSITION", `Cannot receive PO in status ${po.status}`);

        const number = await nextBusinessNumber("GRN");
        const receipt = await tx.goodsReceipt.create({
          data: {
            number, poId: po.id, receivedBy: auth.userId,
            items: {
              create: body.items.map((i: Record<string, unknown>) => {
                const item = i as { variantId?: unknown; quantity?: unknown; damagedQty?: unknown };
                if (typeof item.variantId !== "string" || !item.variantId)
                  fail(400, "VALIDATION", "Each receipt item needs a variantId");
                if (!Number.isInteger(item.quantity) || (item.quantity as number) <= 0)
                  fail(400, "VALIDATION", "quantity must be a positive integer");
                if (typeof item.damagedQty === "number" && (!Number.isInteger(item.damagedQty) || item.damagedQty < 0 || item.damagedQty > (item.quantity as number)))
                  fail(400, "VALIDATION", "damagedQty must be an integer between 0 and quantity");
                return {
                  variantId: item.variantId as string, quantity: item.quantity as number,
                  damagedQty: typeof item.damagedQty === "number" ? item.damagedQty : 0,
                };
              }),
            },
          },
        });

        // Find warehouse main location
        const loc = await tx.stockLocation.findFirst({
          where: { warehouseId: po.warehouseId },
        });
        if (!loc) fail(400, "VALIDATION", "Warehouse has no stock location");

        for (const item of body.items as { variantId: string; quantity: number; damagedQty?: number }[]) {
          const poItem = po.items.find((p) => p.variantId === item.variantId);
          if (!poItem) fail(400, "VALIDATION", `Variant ${item.variantId} not in PO`);
          const damagedQty = typeof item.damagedQty === "number" ? item.damagedQty : 0;
          const goodQty = item.quantity - damagedQty;
          if (poItem.receivedQty + item.quantity > poItem.quantity)
            fail(400, "VALIDATION", `Over-receipt for ${item.variantId}`);
          const received = await tx.purchaseOrderItem.updateMany({
            where: { id: poItem.id, receivedQty: { lte: poItem.quantity - item.quantity } },
            data: { receivedQty: { increment: item.quantity } },
          });
          if (received.count !== 1) fail(409, "VALIDATION", `Over-receipt for ${item.variantId}`);
          // damaged goes into balance as damaged, good qty into on_hand — both ledgered
          await applyMovement(tx, {
            variantId: item.variantId, locationId: loc.id,
            type: goodQty > 0 ? MovementType.PURCHASE_RECEIPT : MovementType.DAMAGED,
            quantityDelta: goodQty,
            damagedDelta: damagedQty,
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

        await audit(auth.userId, "purchase.receive", "GoodsReceipt", receipt.id, { number, poId: po.id }, tx);
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
