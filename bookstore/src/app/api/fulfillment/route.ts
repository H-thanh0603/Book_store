import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
import { MovementType } from "@/generated/prisma/client";

// POST /api/fulfillment — ship, collect, deliver, or cancel a reserved online order.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = await requirePermission("inventory.adjust");
    if (!body.orderId) fail(400, "VALIDATION", "orderId required");

    if (body.action === "deliver") {
      const order = await prisma.order.update({
        where: { id: body.orderId },
        data: {
          status: "DELIVERED",
          shipment: { update: { status: "DELIVERED", deliveredAt: new Date() } },
          statusHistory: { create: { fromStatus: "SHIPPED", toStatus: "DELIVERED", userId: auth.userId } },
        },
      });
      return ok({ number: order.number, status: order.status });
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: body.orderId }, include: { items: true } });
      if (!order) fail(404, "NOT_FOUND", "Order not found");

      if (body.action === "cancel") {
        if (["SHIPPED", "DELIVERED", "CANCELLED"].includes(order.status))
          fail(409, "INVALID_STATUS_TRANSITION", `Cannot cancel ${order.status} order`);
        const reservations = await tx.inventoryMovement.findMany({
          where: { refType: "order", refId: order.id, type: "RESERVATION" },
        });
        for (const r of reservations) {
          const item = order.items.find((i) => i.variantId === r.variantId);
          if (!item) continue;
          await applyMovement(tx, {
            variantId: r.variantId, locationId: r.locationId, type: MovementType.RESERVATION_RELEASE,
            quantityDelta: 0, reservedDelta: -item.quantity,
            refType: "order", refId: order.id, userId: auth.userId,
          });
        }
        return tx.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED", statusHistory: { create: { fromStatus: order.status, toStatus: "CANCELLED", userId: auth.userId } } },
        });
      }

      const isPickup = body.action === "collect";
      if (!isPickup && body.action !== "ship") fail(400, "VALIDATION", "Unknown action");
      if ((isPickup && order.type !== "pickup") || (!isPickup && order.type === "pickup"))
        fail(409, "INVALID_STATUS_TRANSITION", "Fulfillment action does not match order type");
      if (!["CONFIRMED", "ALLOCATED", "PICKING", "PACKED", "READY"].includes(order.status))
        fail(409, "INVALID_STATUS_TRANSITION", `Cannot fulfill ${order.status} order`);

      const reservations = await tx.inventoryMovement.findMany({
        where: { refType: "order", refId: order.id, type: "RESERVATION" },
      });
      if (reservations.length !== order.items.length) fail(409, "VALIDATION", "Order reservation is incomplete");
      const location = await tx.stockLocation.findUnique({ where: { id: reservations[0].locationId } });
      if (!location) fail(404, "NOT_FOUND", "Fulfillment location not found");
      await requirePermission("inventory.adjust", location.storeId ?? undefined);
      if (!isPickup && (![body.recipientName, body.recipientPhone, body.address].every((value) => typeof value === "string" && value.trim())))
        fail(400, "VALIDATION", "recipientName, recipientPhone and address required for shipping");
      for (const item of order.items) {
        const reservation = reservations.find((r) => r.variantId === item.variantId);
        if (!reservation) fail(409, "VALIDATION", "Order reservation is incomplete");
        await applyMovement(tx, {
          variantId: item.variantId, locationId: reservation.locationId, type: MovementType.SALE,
          quantityDelta: -item.quantity, reservedDelta: -item.quantity,
          refType: "order", refId: order.id, userId: auth.userId,
        });
      }

      const nextStatus = isPickup ? "DELIVERED" : "SHIPPED";
      return tx.order.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          shipment: isPickup ? undefined : { upsert: {
            create: {
              carrier: body.carrier ?? null, trackingNumber: body.trackingNumber ?? null,
              recipientName: body.recipientName, recipientPhone: body.recipientPhone, address: body.address,
              status: "SHIPPED", shippedAt: new Date(),
            },
            update: { carrier: body.carrier ?? null, trackingNumber: body.trackingNumber ?? null, status: "SHIPPED", shippedAt: new Date() },
          } },
          statusHistory: { create: { fromStatus: order.status, toStatus: nextStatus, userId: auth.userId } },
        },
      });
    });
    return ok({ number: result.number, status: result.status });
  } catch (err) {
    return apiError(err);
  }
}
