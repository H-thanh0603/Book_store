import { NextRequest } from "next/server";
import { prisma, prismaRead, withTxRetry, TX_OPTIONS } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

// PUT /api/transfers/[id] — Update transfer status
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("inventory:manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { action, items: receiveItems } = body;

  const existing = await prismaRead.stockTransfer.findUnique({ where: { id } });
  if (!existing) return apiError({ status: 404, code: "NOT_FOUND", message: "Transfer not found" });

  if (action === "approve") {
    if (existing.status !== "REQUESTED") {
      return apiError({ status: 400, code: "VALIDATION", message: "Only REQUESTED transfers can be approved" });
    }
    await prisma.stockTransfer.update({
      where: { id },
      data: { status: "APPROVED", approvedBy: "system" },
    });
    return ok({ message: "Transfer approved" });
  }

  if (action === "ship") {
    if (existing.status !== "APPROVED") {
      return apiError({ status: 400, code: "VALIDATION", message: "Only APPROVED transfers can be shipped" });
    }

    return await withTxRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const transfer = await tx.stockTransfer.findUnique({
            where: { id },
            include: { items: true },
          });
          if (!transfer) return apiError({ status: 404, code: "NOT_FOUND", message: "Not found" });

          for (const item of transfer.items) {
            // Deduct from source
            await tx.inventoryBalance.update({
              where: { variantId_locationId: { variantId: item.variantId, locationId: transfer.fromLocationId } },
              data: { onHand: { decrement: item.quantity }, reserved: { decrement: item.quantity } },
            });
            // Add to in-transit
            await tx.inventoryBalance.update({
              where: { variantId_locationId: { variantId: item.variantId, locationId: transfer.fromLocationId } },
              data: { inTransit: { increment: item.quantity } },
            });
            // Create movement
            const balance = await tx.inventoryBalance.findUnique({
              where: { variantId_locationId: { variantId: item.variantId, locationId: transfer.fromLocationId } },
              select: { onHand: true },
            });
            await tx.inventoryMovement.create({
              data: {
                variantId: item.variantId,
                locationId: transfer.fromLocationId,
                type: "TRANSFER_OUT",
                quantity: -item.quantity,
                balanceAfter: balance?.onHand ?? 0,
                refType: "transfer",
                refId: transfer.id,
                userId: null,
              },
            });
          }

          await tx.stockTransfer.update({ where: { id }, data: { status: "IN_TRANSIT" } });
          return ok({ message: "Transfer shipped" });
        },
        TX_OPTIONS
      )
    );
  }

  if (action === "receive") {
    if (existing.status !== "IN_TRANSIT") {
      return apiError({ status: 400, code: "VALIDATION", message: "Only IN_TRANSIT transfers can be received" });
    }
    if (!Array.isArray(receiveItems)) {
      return apiError({ status: 400, code: "VALIDATION", message: "items array with receivedQty is required" });
    }

    return await withTxRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const transfer = await tx.stockTransfer.findUnique({
            where: { id },
            include: { items: true },
          });
          if (!transfer) return apiError({ status: 404, code: "NOT_FOUND", message: "Not found" });

          for (const item of receiveItems) {
            const trfItem = transfer.items.find((i) => i.id === item.id);
            if (!trfItem) continue;

            const receivedQty = item.receivedQty ?? trfItem.quantity;

            // Add to destination
            await tx.inventoryBalance.upsert({
              where: { variantId_locationId: { variantId: trfItem.variantId, locationId: transfer.toLocationId } },
              create: { variantId: trfItem.variantId, locationId: transfer.toLocationId, onHand: receivedQty },
              update: { onHand: { increment: receivedQty } },
            });

            // Remove from in-transit at source
            await tx.inventoryBalance.update({
              where: { variantId_locationId: { variantId: trfItem.variantId, locationId: transfer.fromLocationId } },
              data: { inTransit: { decrement: receivedQty } },
            });

            // Update received qty
            await tx.stockTransferItem.update({
              where: { id: item.id },
              data: { receivedQty },
            });

            // Create movements
            const destBalance = await tx.inventoryBalance.findUnique({
              where: { variantId_locationId: { variantId: trfItem.variantId, locationId: transfer.toLocationId } },
              select: { onHand: true },
            });
            await tx.inventoryMovement.create({
              data: {
                variantId: trfItem.variantId,
                locationId: transfer.toLocationId,
                type: "TRANSFER_IN",
                quantity: receivedQty,
                balanceAfter: destBalance?.onHand ?? 0,
                refType: "transfer",
                refId: transfer.id,
                userId: null,
              },
            });
          }

          await tx.stockTransfer.update({ where: { id }, data: { status: "RECEIVED" } });
          return ok({ message: "Transfer received" });
        },
        TX_OPTIONS
      )
    );
  }

  if (action === "complete") {
    if (existing.status !== "RECEIVED") {
      return apiError({ status: 400, code: "VALIDATION", message: "Only RECEIVED transfers can be completed" });
    }
    await prisma.stockTransfer.update({ where: { id }, data: { status: "COMPLETED" } });
    return ok({ message: "Transfer completed" });
  }

  if (action === "cancel") {
    if (["COMPLETED", "CANCELLED"].includes(existing.status)) {
      return apiError({ status: 400, code: "VALIDATION", message: "Cannot cancel" });
    }

    return await withTxRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const transfer = await tx.stockTransfer.findUnique({
            where: { id },
            include: { items: true },
          });
          if (!transfer) return apiError({ status: 404, code: "NOT_FOUND", message: "Not found" });

          // Release reserved stock
          for (const item of transfer.items) {
            await tx.inventoryBalance.update({
              where: { variantId_locationId: { variantId: item.variantId, locationId: transfer.fromLocationId } },
              data: { reserved: { decrement: item.quantity } },
            });
          }

          await tx.stockTransfer.update({ where: { id }, data: { status: "CANCELLED" } });
          return ok({ message: "Transfer cancelled" });
        },
        TX_OPTIONS
      )
    );
  }

  return apiError({ status: 400, code: "VALIDATION", message: "Invalid action" });
}

// GET /api/transfers/[id] — Get single transfer
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("inventory:read");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const transfer = await prismaRead.stockTransfer.findUnique({
    where: { id },
    include: {
      fromLocation: { select: { id: true, name: true } },
      toLocation: { select: { id: true, name: true } },
      items: {
        include: {
          variant: {
            include: {
              product: { select: { name: true } },
              barcodes: { select: { barcode: true }, take: 1 },
            },
          },
        },
      },
    },
  });

  if (!transfer) return apiError({ status: 404, code: "NOT_FOUND", message: "Not found" });
  return ok({ transfer });
}
