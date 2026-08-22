// Purchasing + Goods Receiving + Stock Transfer domains.
import { prisma } from "./db";
import { fail, nextBusinessNumber } from "./api";
import { applyMovement } from "./inventory";
import { MovementType, PoStatus, TransferStatus, Prisma } from "../generated/prisma/client";

// ── Purchase Orders ──────────────────────────────────────────

export async function createPurchaseOrder(input: {
  supplierId: string;
  warehouseId: string;
  expectedDate?: Date;
  userId: string;
  items: { variantId: string; quantity: number; unitCost: bigint }[];
}) {
  if (input.items.length === 0) fail(400, "VALIDATION", "PO needs items");
  const number = await nextBusinessNumber("PO");
  return prisma.purchaseOrder.create({
    data: {
      number,
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      status: "pending_approval",
      expectedDate: input.expectedDate,
      orderedBy: input.userId,
      items: { create: input.items },
    },
    include: { items: true },
  });
}

const PO_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "cancelled"],
  approved: ["sent", "cancelled"],
  sent: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "closed"],
  received: ["closed"],
  cancelled: [],
  closed: [],
};

export function assertPoTransition(from: PoStatus, to: PoStatus) {
  if (!PO_TRANSITIONS[from].includes(to))
    fail(400, "INVALID_STATUS_TRANSITION", `Cannot transition PO ${from} → ${to}`);
}

export async function transitionPo(poId: string, to: PoStatus, userId: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) fail(404, "NOT_FOUND", "PO not found");
  assertPoTransition(po.status, to);
  return prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: { actorId: userId, action: "po.transition", entity: "purchase_order", entityId: po.id, before: { status: po.status }, after: { status: to } },
    });
    return tx.purchaseOrder.update({ where: { id: po.id }, data: { status: to, approvedBy: to === "approved" ? userId : po.approvedBy } });
  });
}

// ── Goods Receipt ────────────────────────────────────────────

/**
 * Receive goods against a PO. Does NOT assume full delivery.
 * Atomic: receipt + inventory increase + movements + PO status in one transaction.
 */
export async function receiveGoods(input: {
  poId: string;
  receivedBy: string;
  items: { variantId: string; quantity: number; damagedQty?: number }[];
}) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: input.poId },
      include: { items: true },
    });
    if (!po) fail(404, "NOT_FOUND", "PO not found");
    if (!["sent", "partially_received"].includes(po.status))
      fail(400, "INVALID_STATUS_TRANSITION", `PO status ${po.status} cannot receive goods`);

    for (const item of input.items) {
      const poItem = po.items.find((i) => i.variantId === item.variantId);
      if (!poItem) fail(404, "NOT_FOUND", `Variant ${item.variantId} not on PO`);
      if (item.quantity <= 0) fail(400, "VALIDATION", "Quantity must be positive");
      // Over-receiving beyond ordered is allowed only up to a tolerance; block > ordered
      if ((poItem.receivedQty ?? 0) + item.quantity > poItem.quantity)
        fail(400, "VALIDATION", `Receive exceeds ordered qty for variant ${item.variantId}`);
    }

    const number = await nextBusinessNumber("GRN");
    const receipt = await tx.goodsReceipt.create({
      data: {
        number,
        poId: po.id,
        receivedBy: input.receivedBy,
        items: { create: input.items.map((i) => ({ ...i, damagedQty: i.damagedQty ?? 0 })) },
      },
    });

    // Inventory increase at warehouse location
    const loc = await tx.stockLocation.findFirst({ where: { warehouseId: po.warehouseId, type: "WAREHOUSE" } });
    if (!loc) fail(400, "VALIDATION", "Warehouse has no stock location");

    for (const item of input.items) {
      await applyMovement(tx, {
        variantId: item.variantId,
        locationId: loc!.id,
        type: MovementType.PURCHASE_RECEIPT,
        quantityDelta: item.quantity - (item.damagedQty ?? 0),
        damagedDelta: item.damagedQty ?? 0,
        refType: "goods_receipt",
        refId: receipt.id,
        userId: input.receivedBy,
      });
      await tx.purchaseOrderItem.updateMany({
        where: { poId: po.id, variantId: item.variantId },
        data: { receivedQty: { increment: item.quantity } },
      });
    }

    // Recompute PO status
    const freshItems = await tx.purchaseOrderItem.findMany({ where: { poId: po.id } });
    const allReceived = freshItems.every((i) => i.receivedQty >= i.quantity);
    const anyReceived = freshItems.some((i) => i.receivedQty > 0);
    const newStatus: PoStatus = allReceived ? "received" : anyReceived ? "partially_received" : po.status;
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: newStatus } });

    await tx.auditLog.create({
      data: { actorId: input.receivedBy, action: "goods_receipt.create", entity: "goods_receipt", entityId: receipt.id, after: { number, poNumber: po.number } },
    });

    return receipt;
  });
}

// ── Stock Transfer ───────────────────────────────────────────

const TRANSFER_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  DRAFT: ["REQUESTED", "CANCELLED"],
  REQUESTED: ["APPROVED", "CANCELLED"],
  APPROVED: ["PICKING", "CANCELLED"],
  PICKING: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["RECEIVED"],
  RECEIVED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertTransferTransition(from: TransferStatus, to: TransferStatus) {
  if (!TRANSFER_TRANSITIONS[from].includes(to))
    fail(400, "INVALID_STATUS_TRANSITION", `Cannot transition transfer ${from} → ${to}`);
}

export async function createTransfer(input: {
  fromLocationId: string;
  toLocationId: string;
  requestedBy: string;
  items: { variantId: string; quantity: number }[];
}) {
  if (input.fromLocationId === input.toLocationId)
    fail(400, "VALIDATION", "Source and destination must differ");
  if (input.items.length === 0) fail(400, "VALIDATION", "Transfer needs items");
  const number = await nextBusinessNumber("TRF");
  return prisma.stockTransfer.create({
    data: {
      number,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      requestedBy: input.requestedBy,
      status: "REQUESTED",
      items: { create: input.items },
    },
  });
}

/** Dispatch: deduct at source, add to in_transit. */
export async function dispatchTransfer(transferId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.stockTransfer.findUnique({ where: { id: transferId }, include: { items: true } });
    if (!t) fail(404, "NOT_FOUND", "Transfer not found");
    assertTransferTransition(t.status, "IN_TRANSIT");
    for (const item of t.items) {
      await applyMovement(tx, {
        variantId: item.variantId,
        locationId: t.fromLocationId,
        type: MovementType.TRANSFER_OUT,
        quantityDelta: -item.quantity,
        refType: "stock_transfer",
        refId: t.id,
        userId,
      });
      await applyMovement(tx, {
        variantId: item.variantId,
        locationId: t.toLocationId,
        type: MovementType.TRANSFER_OUT,
        quantityDelta: 0,
        inTransitDelta: item.quantity,
        refType: "stock_transfer",
        refId: t.id,
        userId,
      });
    }
    await tx.stockTransfer.update({ where: { id: t.id }, data: { status: "IN_TRANSIT" } });
    await tx.auditLog.create({ data: { actorId: userId, action: "transfer.dispatch", entity: "stock_transfer", entityId: t.id, after: { number: t.number } } });
    return { ok: true };
  });
}

/** Receive: confirm arrival — in_transit → on_hand at destination. Never earlier. */
export async function receiveTransfer(transferId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.stockTransfer.findUnique({ where: { id: transferId }, include: { items: true } });
    if (!t) fail(404, "NOT_FOUND", "Transfer not found");
    assertTransferTransition(t.status, "RECEIVED");
    for (const item of t.items) {
      await applyMovement(tx, {
        variantId: item.variantId,
        locationId: t.toLocationId,
        type: MovementType.TRANSFER_IN,
        quantityDelta: item.quantity,
        inTransitDelta: -item.quantity,
        refType: "stock_transfer",
        refId: t.id,
        userId,
      });
      await tx.stockTransferItem.update({ where: { id: item.id }, data: { receivedQty: item.quantity } });
    }
    await tx.stockTransfer.update({ where: { id: t.id }, data: { status: "COMPLETED" } });
    await tx.auditLog.create({ data: { actorId: userId, action: "transfer.receive", entity: "stock_transfer", entityId: t.id, after: { number: t.number } } });
    return { ok: true };
  });
}
