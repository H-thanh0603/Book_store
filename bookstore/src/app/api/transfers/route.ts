import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, nextBusinessNumber } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
import { TransferStatus } from "@/generated/prisma/client";

const ALLOWED: Record<string, string[]> = {
  DRAFT: ["REQUESTED", "CANCELLED"],
  REQUESTED: ["APPROVED", "CANCELLED"],
  APPROVED: ["PICKING", "CANCELLED"],
  PICKING: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["RECEIVED"],
  RECEIVED: ["COMPLETED"],
};

function assertTransition(from: string, to: string) {
  if (!(ALLOWED[from] ?? []).includes(to))
    fail(409, "INVALID_STATUS_TRANSITION", `Cannot transition ${from} -> ${to}`);
}

// POST /api/transfers { action:"create"|"transition", ... }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "create") {
      const auth = await requirePermission("inventory.transfer");
      if (!Array.isArray(body.items) || body.items.length === 0 || !body.fromLocationId || !body.toLocationId)
        fail(400, "VALIDATION", "fromLocationId, toLocationId, items required");
      const number = await nextBusinessNumber("TRF");
      const trf = await prisma.stockTransfer.create({
        data: {
          number, fromLocationId: body.fromLocationId, toLocationId: body.toLocationId,
          status: "REQUESTED", requestedBy: auth.userId,
          items: { create: body.items.map((i: any) => ({ variantId: i.variantId, quantity: i.quantity })) },
        },
        include: { items: true },
      });
      return ok({ id: trf.id, number: trf.number, status: trf.status }, 201);
    }

    if (body.action === "transition") {
      const to: string = body.to;
      const needsApprove = ["APPROVED"].includes(to);
      const auth = await requirePermission(needsApprove ? "inventory.transfer" : "inventory.transfer");

      const result = await prisma.$transaction(async (tx) => {
        const trf = await tx.stockTransfer.findUnique({
          where: { id: body.transferId },
          include: { items: true },
        });
        if (!trf) fail(404, "NOT_FOUND", "Transfer not found");
        assertTransition(trf.status, to);

        if (to === "IN_TRANSIT") {
          // reserve now: deduct on_hand at source
          for (const item of trf.items) {
            await applyMovement(tx, {
              variantId: item.variantId, locationId: trf.fromLocationId,
              type: "TRANSFER_OUT", quantityDelta: -item.quantity,
              refType: "stock_transfer", refId: trf.id, userId: auth.userId,
            });
          }
        }
        if (to === "RECEIVED" || to === "COMPLETED") {
          for (const item of trf.items) {
            await applyMovement(tx, {
              variantId: item.variantId, locationId: trf.toLocationId,
              type: "TRANSFER_IN", quantityDelta: item.quantity,
              refType: "stock_transfer", refId: trf.id, userId: auth.userId,
            });
          }
        }

        const updated = await tx.stockTransfer.update({
          where: { id: trf.id },
          data: { status: to as TransferStatus, approvedBy: to === "APPROVED" ? auth.userId : trf.approvedBy },
        });
        await tx.auditLog.create({
          data: { actorId: auth.userId, action: `transfer.${to.toLowerCase()}`, entity: "StockTransfer", entityId: trf.id },
        });
        return updated;
      });
      return ok({ number: result.number, status: result.status });
    }

    fail(400, "VALIDATION", "Unknown action");
  } catch (err) {
    return apiError(err);
  }
}

export async function GET() {
  try {
    await requirePermission("inventory.view");
    const transfers = await prisma.stockTransfer.findMany({
      include: { fromLocation: true, toLocation: true, items: { include: { variant: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok({ transfers });
  } catch (err) {
    return apiError(err);
  }
}
