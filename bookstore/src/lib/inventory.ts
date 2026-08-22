// Inventory domain — all quantity changes route through here. Ledger-first.
import { prisma } from "./db";
import { fail } from "./api";
import { MovementType, Prisma } from "../generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Apply a signed quantity delta to one variant@location.
 * Atomic: SELECT FOR UPDATE via raw SQL to prevent lost updates / negative stock.
 * Every call writes an InventoryMovement (audit trail).
 */
export async function applyMovement(
  tx: Tx,
  args: {
    variantId: string;
    locationId: string;
    type: MovementType;
    quantityDelta: number; // signed
    reservedDelta?: number;
    inTransitDelta?: number;
    damagedDelta?: number;
    refType?: string;
    refId?: string;
    userId?: string;
    allowNegative?: boolean;
  }
) {
  const {
    variantId, locationId, type, quantityDelta,
    reservedDelta = 0, inTransitDelta = 0, damagedDelta = 0,
    refType, refId, userId, allowNegative = false,
  } = args;

  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "InventoryBalance" (id, "variantId", "locationId", "onHand", reserved, "inTransit", damaged)
    VALUES (gen_random_uuid()::text, ${variantId}, ${locationId}, 0, 0, 0, 0)
    ON CONFLICT ("variantId", "locationId") DO NOTHING
  `;
  const updated = await tx.$queryRaw<{ onHand: number; reserved: number; inTransit: number }[]>`
    UPDATE "InventoryBalance"
    SET "onHand" = "onHand" + ${quantityDelta},
        reserved = reserved + ${reservedDelta},
        "inTransit" = "inTransit" + ${inTransitDelta},
        damaged = damaged + ${damagedDelta}
    WHERE "variantId" = ${variantId} AND "locationId" = ${locationId}
    RETURNING "onHand", reserved, "inTransit"
  `;
  const bal = updated[0];
  if (!bal) fail(500, "INTERNAL", "Balance row missing");
  if (!allowNegative && bal.onHand - bal.reserved < 0) {
    fail(409, "INSUFFICIENT_STOCK", "Insufficient available stock", {
      variantId,
      locationId,
      requested: Math.max(-quantityDelta, reservedDelta),
      available: bal.onHand - quantityDelta - (bal.reserved - reservedDelta),
    });
  }

  await tx.inventoryMovement.create({
    data: {
      variantId, locationId, type, quantity: quantityDelta,
      balanceAfter: bal.onHand,
      refType, refId, userId,
    },
  });
  return bal;
}

export async function getAvailable(variantId: string, locationId: string): Promise<number> {
  const b = await prisma.inventoryBalance.findUnique({
    where: { variantId_locationId: { variantId, locationId } },
  });
  return b ? b.onHand - b.reserved : 0;
}
