import { NextRequest } from "next/server";
import { prisma, prismaRead, withTxRetry, TX_OPTIONS } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
import { MovementType } from "@/generated/prisma/client";

// PUT /api/transfers/[id] — Update transfer status.
//
// Rewritten per audit 2026-08-30 DATA-001: every transition now claims its
// pre-state with a conditional updateMany inside the transaction (the old
// version checked status outside the tx and wrote unconditionally, so two
// concurrent ships double-decremented source stock). All quantity changes
// route through applyMovement (FOR UPDATE + ledger row), receivedQty is
// validated into [0, quantity], and cancelling an IN_TRANSIT transfer is
// refused instead of silently losing the in-transit stock.

/** Org boundary: both endpoint locations must belong to the caller's org. */
function assertOrgOnTransfer(
  transfer: {
    fromLocation: { store: { region: { orgId: string } | null } | null };
    toLocation: { store: { region: { orgId: string } | null } | null };
  },
  auth: { orgId: string | null }
) {
  if (!auth.orgId) return; // legacy admin
  const orgIds = [transfer.fromLocation.store?.region?.orgId, transfer.toLocation.store?.region?.orgId];
  if (orgIds.some((orgId) => orgId !== auth.orgId))
    fail(404, "NOT_FOUND", "Transfer not found");
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("inventory:manage");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { action, items: receiveItems } = body;

    const existing = await prismaRead.stockTransfer.findUnique({
      where: { id },
      include: {
        fromLocation: { include: { store: { include: { region: true } } } },
        toLocation: { include: { store: { include: { region: true } } } },
      },
    });
    if (!existing) return apiError({ status: 404, code: "NOT_FOUND", message: "Transfer not found" });
    assertOrgOnTransfer(existing, auth);

    if (action === "approve") {
      const claimed = await prisma.stockTransfer.updateMany({
        where: { id, status: "REQUESTED" },
        data: { status: "APPROVED", approvedBy: auth.userId },
      });
      if (claimed.count !== 1)
        return apiError({ status: 400, code: "VALIDATION", message: "Only REQUESTED transfers can be approved" });
      return ok({ message: "Transfer approved" });
    }

    if (action === "ship") {
      return await withTxRetry(() =>
        prisma.$transaction(
          async (tx) => {
            // Claim APPROVED → IN_TRANSIT first: a concurrent ship loses the
            // claim and aborts instead of double-decrementing source stock.
            const claimed = await tx.stockTransfer.updateMany({
              where: { id, status: "APPROVED" },
              data: { status: "IN_TRANSIT" },
            });
            if (claimed.count !== 1)
              fail(400, "VALIDATION", "Only APPROVED transfers can be shipped");

            const transfer = await tx.stockTransfer.findUnique({
              where: { id },
              include: { items: true },
            });
            if (!transfer) fail(404, "NOT_FOUND", "Not found");

            for (const item of transfer!.items) {
              // Source: onHand → inTransit. applyMovement locks the balance
              // row, refuses to oversell (409), and writes the TRANSFER_OUT
              // ledger row. (The old code also decremented `reserved` here,
              // but nothing ever reserved stock for transfers — reserved went
              // negative on every ship.)
              await applyMovement(tx, {
                variantId: item.variantId,
                locationId: transfer!.fromLocationId,
                type: MovementType.TRANSFER_OUT,
                quantityDelta: -item.quantity,
                inTransitDelta: item.quantity,
                refType: "transfer",
                refId: transfer!.id,
                userId: auth.userId,
              });
            }
            return ok({ message: "Transfer shipped" });
          },
          TX_OPTIONS
        )
      );
    }

    if (action === "receive") {
      if (!Array.isArray(receiveItems)) {
        return apiError({ status: 400, code: "VALIDATION", message: "items array with receivedQty is required" });
      }

      return await withTxRetry(() =>
        prisma.$transaction(
          async (tx) => {
            const claimed = await tx.stockTransfer.updateMany({
              where: { id, status: "IN_TRANSIT" },
              data: { status: "RECEIVED" },
            });
            if (claimed.count !== 1)
              fail(400, "VALIDATION", "Only IN_TRANSIT transfers can be received");

            const transfer = await tx.stockTransfer.findUnique({
              where: { id },
              include: { items: true },
            });
            if (!transfer) fail(404, "NOT_FOUND", "Not found");

            for (const trfItem of transfer!.items) {
              const entry = receiveItems.find((i: { id?: string }) => i.id === trfItem.id);
              const receivedQty = entry?.receivedQty ?? trfItem.quantity;
              // (audit DATA-001: receivedQty was previously unvalidated — a
              // negative value removed destination stock, a value above
              // `quantity` created stock from nothing.)
              if (!Number.isInteger(receivedQty) || receivedQty < 0 || receivedQty > trfItem.quantity)
                fail(400, "VALIDATION",
                  `receivedQty for item ${trfItem.id} must be an integer between 0 and ${trfItem.quantity}`);

              if (receivedQty > 0) {
                await applyMovement(tx, {
                  variantId: trfItem.variantId,
                  locationId: transfer!.toLocationId,
                  type: MovementType.TRANSFER_IN,
                  quantityDelta: receivedQty,
                  refType: "transfer",
                  refId: transfer!.id,
                  userId: auth.userId,
                });
              }
              // Source: release the full in-transit amount. A shortfall
              // (shipped - receivedQty > 0) is stock lost in transit — onHand
              // was already decremented at ship time, so only inTransit moves.
              await applyMovement(tx, {
                variantId: trfItem.variantId,
                locationId: transfer!.fromLocationId,
                type: receivedQty === trfItem.quantity ? MovementType.TRANSFER_OUT : MovementType.LOST,
                quantityDelta: 0,
                inTransitDelta: -trfItem.quantity,
                refType: "transfer",
                refId: transfer!.id,
                userId: auth.userId,
              });

              await tx.stockTransferItem.update({
                where: { id: trfItem.id },
                data: { receivedQty },
              });
            }

            return ok({ message: "Transfer received" });
          },
          TX_OPTIONS
        )
      );
    }

    if (action === "complete") {
      const claimed = await prisma.stockTransfer.updateMany({
        where: { id, status: "RECEIVED" },
        data: { status: "COMPLETED" },
      });
      if (claimed.count !== 1)
        return apiError({ status: 400, code: "VALIDATION", message: "Only RECEIVED transfers can be completed" });
      return ok({ message: "Transfer completed" });
    }

    if (action === "cancel") {
      // IN_TRANSIT stock has already left the source — cancelling here would
      // strand it. Past-transit cancellations must go through a return flow.
      if (["IN_TRANSIT", "RECEIVED", "COMPLETED", "CANCELLED"].includes(existing.status)) {
        return apiError({ status: 400, code: "VALIDATION", message: `Cannot cancel a ${existing.status} transfer` });
      }
      // Transfers never reserve stock (nothing to release): the cancel is a
      // pure status claim.
      const claimed = await prisma.stockTransfer.updateMany({
        where: { id, status: existing.status },
        data: { status: "CANCELLED" },
      });
      if (claimed.count !== 1)
        return apiError({ status: 409, code: "VALIDATION", message: "Transfer was already updated" });
      return ok({ message: "Transfer cancelled" });
    }

    return apiError({ status: 400, code: "VALIDATION", message: "Invalid action" });
  } catch (e) {
    return apiError(e);
  }
}

// GET /api/transfers/[id] — Get single transfer
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("inventory:read");
    const { id } = await params;
    const transfer = await prismaRead.stockTransfer.findUnique({
      where: { id },
      include: {
        fromLocation: { include: { store: { include: { region: true } } } },
        toLocation: { include: { store: { include: { region: true } } } },
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
    assertOrgOnTransfer(transfer, auth);
    return ok({ transfer });
  } catch (e) {
    return apiError(e);
  }
}
