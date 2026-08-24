// Releases stock reservations for online orders that were never confirmed.
// An abandoned WEB/APP checkout keeps `reserved` locked forever unless something
// expires it — a flash sale of abandonments would render real shelf stock
// invisible. Mirrors the manual cancel flow in fulfillment/route.ts:
// claim the status first, then release every RESERVATION movement.
import { MovementType } from "../generated/prisma/client";
import { prisma } from "./db";
import { fail, getSystemConfig } from "./api";
import { applyMovement } from "./inventory";
import { audit } from "./auth";

const BATCH = 50;
const SERVICE_EMAIL = "system@bookstore.internal";

/** Real User row for audit FKs; seed creates it as an inactive service account.
 *  Falls back to the first active user (email order) on databases seeded before
 *  the service account existed. */
async function systemActorId(): Promise<string> {
  const service = await prisma.user.findUnique({ where: { email: SERVICE_EMAIL }, select: { id: true } });
  if (service) return service.id;
  const fallback = await prisma.user.findFirst({
    where: { active: true }, select: { id: true }, orderBy: { email: "asc" },
  });
  if (!fallback) fail(500, "INTERNAL", "No user available to attribute automated actions");
  return fallback.id;
}

export async function expireStaleReservations() {
  const ttlMinutes = await getSystemConfig("orders.reservationTtlMinutes", 60);
  const cutoff = new Date(Date.now() - ttlMinutes * 60_000);
  const actorId = await systemActorId();

  // Only orders still waiting for confirmation qualify; anything further along
  // (ALLOCATED/PICKING/…) has staff actively working it.
  const candidates = await prisma.order.findMany({
    where: { channel: { in: ["WEB", "APP"] }, status: "CONFIRMED", createdAt: { lt: cutoff } },
    include: { items: true },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });

  let expired = 0;
  for (const order of candidates) {
    await prisma.$transaction(async (tx) => {
      // Claim before touching stock — a concurrent fulfill/cancel makes this a no-op.
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: "CONFIRMED" },
        data: { status: "CANCELLED" },
      });
      if (claimed.count !== 1) return;

      const reservations = await tx.inventoryMovement.findMany({
        where: { refType: "order", refId: order.id, type: "RESERVATION" },
      });
      for (const reservation of reservations) {
        const item = order.items.find((i) => i.variantId === reservation.variantId);
        if (!item) continue;
        await applyMovement(tx, {
          variantId: reservation.variantId,
          locationId: reservation.locationId,
          type: MovementType.RESERVATION_RELEASE,
          quantityDelta: 0,
          reservedDelta: -item.quantity,
          refType: "order",
          refId: order.id,
          userId: actorId,
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: { statusHistory: { create: { fromStatus: "CONFIRMED", toStatus: "CANCELLED", userId: actorId } } },
      });
      await audit(actorId, "order.auto_expire", "Order", order.id, {
        number: order.number, ttlMinutes,
      }, tx);
      expired += 1;
    });
  }
  return { scanned: candidates.length, expired };
}
