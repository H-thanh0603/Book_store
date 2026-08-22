import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, assertStoreAccess, audit } from "@/lib/auth";
import { apiError, ok, fail, nextBusinessNumber } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
import { TransferStatus } from "@/generated/prisma/client";

type TransferItemInput = { variantId: string; quantity: number };

function parseItems(raw: unknown): TransferItemInput[] {
  if (!Array.isArray(raw) || raw.length === 0) fail(400, "VALIDATION", "items required");
  return raw.map((i: Record<string, unknown>) => {
    const item = i as { variantId?: unknown; quantity?: unknown };
    if (typeof item.variantId !== "string" || !item.variantId || !Number.isInteger(item.quantity) || (item.quantity as number) <= 0)
      fail(400, "VALIDATION", "Each item needs a variantId and positive integer quantity");
    return { variantId: item.variantId as string, quantity: item.quantity as number };
  });
}

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
      const items = parseItems(body.items);
      if (!body.fromLocationId || !body.toLocationId)
        fail(400, "VALIDATION", "fromLocationId, toLocationId, items required");
      // Both endpoints must be inside the caller's store scope.
      for (const locationId of [body.fromLocationId, body.toLocationId]) {
        const loc = await prisma.stockLocation.findUnique({ where: { id: locationId } });
        if (!loc) fail(404, "NOT_FOUND", `Location ${locationId} not found`);
        assertStoreAccess(auth, loc.storeId, "inventory.transfer");
      }
      const number = await nextBusinessNumber("TRF");
      const trf = await prisma.$transaction(async (tx) => {
        const created = await tx.stockTransfer.create({
          data: {
            number, fromLocationId: body.fromLocationId, toLocationId: body.toLocationId,
            status: "REQUESTED", requestedBy: auth.userId,
            items: { create: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) },
          },
          include: { items: true },
        });
        await audit(auth.userId, "transfer.create", "StockTransfer", created.id, { number }, tx);
        return created;
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
        // Store scope: check both endpoints of the loaded transfer.
        for (const locationId of [trf.fromLocationId, trf.toLocationId]) {
          const loc = await tx.stockLocation.findUnique({ where: { id: locationId } });
          assertStoreAccess(auth, loc?.storeId, "inventory.transfer");
        }
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
        if (to === "RECEIVED") {
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
        await audit(auth.userId, `transfer.${to.toLowerCase()}`, "StockTransfer", trf.id, undefined, tx);
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
