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

  // ponytail: single UPDATE ... RETURNING is the atomic path; no ORM read-modify-write race.
  const rows = await tx.$queryRaw<{ id: string; on_hand: number; reserved: number; in_transit: number }[]>`
    INSERT INTO inventory_balances (id, variant_id, location_id, on_hand, reserved, in_transit, damaged)
    VALUES (gen_random_uuid()::text, ${variantId}, ${locationId}, 0, 0, 0, 0)
    ON CONFLICT (variant_id, location_id) DO NOTHING
  `;
  const updated = await tx.$queryRaw<{ on_hand: number; reserved: number; in_transit: number }[]>`
    UPDATE inventory_balances
    SET on_hand = on_hand + ${quantityDelta},
        reserved = reserved + ${reservedDelta},
        in_transit = in_transit + ${inTransitDelta},
        damaged = damaged + ${damagedDelta}
    WHERE variant_id = ${variantId} AND location_id = ${locationId}
    RETURNING on_hand, reserved, in_transit
  `;
  const bal = updated[0];
  if (!bal) fail(500, "INTERNAL", "Balance row missing");
  if (!allowNegative && bal.on_hand < 0) {
    fail(409, "INSUFFICIENT_STOCK", "Insufficient available stock", {
      variantId, locationId, requested: -quantityDelta, available: bal.on_hand - quantityDelta,
    });
  }

  await tx.inventoryMovement.create({
    data: {
      variantId, locationId, type, quantity: quantityDelta,
      balanceAfter: bal.on_hand,
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
