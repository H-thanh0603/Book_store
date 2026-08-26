// Inventory domain — all quantity changes route through here. Ledger-first.
import { prisma } from "./db";
import { fail } from "./api";
import { MovementType, Prisma } from "../generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Acquire a pessimistic row lock on the InventoryBalance BEFORE mutating.
 * Returns the current balance so callers can decide (e.g. availability check).
 * If the row doesn't exist yet, creates it with zeroed counts.
 *
 * Uses SELECT ... FOR UPDATE inside the interactive transaction so concurrent
 * transactions on the same variant@location block until this one commits or
 * rolls back — preventing oversell during flash sales / multi-register POS.
 */
async function lockBalance(
  tx: Tx,
  variantId: string,
  locationId: string,
): Promise<{ onHand: number; reserved: number; inTransit: number; damaged: number }> {
  // Ensure the row exists
  await tx.$executeRaw`
    INSERT INTO "InventoryBalance" (id, "variantId", "locationId", "onHand", reserved, "inTransit", damaged)
    VALUES (gen_random_uuid()::text, ${variantId}, ${locationId}, 0, 0, 0, 0)
    ON CONFLICT ("variantId", "locationId") DO NOTHING
  `;
  // Lock the row — concurrent transactions wait here
  const rows = await tx.$queryRaw<{ onHand: number; reserved: number; inTransit: number; damaged: number }[]>`
    SELECT "onHand", reserved, "inTransit", damaged
    FROM "InventoryBalance"
    WHERE "variantId" = ${variantId} AND "locationId" = ${locationId}
    FOR UPDATE
  `;
  if (!rows[0]) fail(500, "INTERNAL", "Balance row missing after upsert");
  return rows[0];
}

/**
 * Apply a signed quantity delta to one variant@location.
 * Acquires an explicit SELECT FOR UPDATE lock first, then applies the delta.
 * Every call writes an InventoryMovement (audit trail).
 *
 * Concurrency: two concurrent sales for the same variant@location are serialized
 * by the FOR UPDATE lock. The second transaction waits until the first commits.
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

  // 1. Lock the row pessimistically
  const before = await lockBalance(tx, variantId, locationId);

  // 2. Check availability BEFORE decrementing
  const availableBefore = before.onHand - before.reserved;
  const requestedQty = Math.abs(quantityDelta);
  if (!allowNegative && quantityDelta < 0 && requestedQty > availableBefore) {
    fail(409, "INSUFFICIENT_STOCK", "Insufficient available stock", {
      variantId,
      locationId,
      requested: requestedQty,
      available: availableBefore,
    });
  }

  // 3. Apply the delta (row is already locked, safe to mutate)
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
  if (!bal) fail(500, "INTERNAL", "Balance row missing after update");

  // 4. Post-update sanity check (catches edge cases with reserved)
  if (!allowNegative && bal.onHand - bal.reserved < 0) {
    fail(409, "INSUFFICIENT_STOCK", "Stock would go negative after reservation", {
      variantId,
      locationId,
      onHand: bal.onHand,
      reserved: bal.reserved,
    });
  }

  // 5. Write audit trail
  await tx.inventoryMovement.create({
    data: {
      variantId, locationId, type, quantity: quantityDelta,
      balanceAfter: bal.onHand,
      refType, refId, userId,
    },
  });
  return bal;
}

/**
 * Check available stock without locking (read-only, for UI/display purposes).
 * For availability checks inside a transaction, use lockBalance() instead.
 */
export async function getAvailable(variantId: string, locationId: string): Promise<number> {
  const b = await prisma.inventoryBalance.findUnique({
    where: { variantId_locationId: { variantId, locationId } },
  });
  return b ? b.onHand - b.reserved : 0;
}

/**
 * Check available stock for a variant across ALL locations of a store.
 * Returns sum of available (onHand - reserved) across store stockrooms + shelves.
 */
export async function getAvailableForStore(variantId: string, storeId: string): Promise<number> {
  const result = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM(ib."onHand" - ib.reserved), 0)::int AS total
    FROM "InventoryBalance" ib
    JOIN "StockLocation" sl ON sl.id = ib."locationId"
    WHERE ib."variantId" = ${variantId}
      AND sl."storeId" = ${storeId}
      AND sl.active = true
  `;
  return result[0]?.total ?? 0;
}
