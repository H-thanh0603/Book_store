import { NextRequest } from "next/server";
import { prisma, TX_OPTIONS } from "@/lib/db";
import { requirePermission, assertStoreAccess, audit } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
import { MovementType } from "@/generated/prisma/client";

// POST /api/fulfillment — ship, collect, deliver, or cancel a reserved online order.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = await requirePermission("inventory.adjust");
    if (!body.orderId) fail(400, "VALIDATION", "orderId required");

    // R1: book a carrier shipment via provider API (GHTK / ViettelPost).
    // Booking happens OUTSIDE the DB transaction (external HTTP call), then
    // the tracking number is attached — a provider outage never blocks the
    // manual ship flow below.
    if (body.action === "book_carrier") {
      const { CARRIERS, bookCarrierShipment, attachCarrierBooking } = await import("@/lib/carriers");
      const carrier = String(body.carrier ?? "").toUpperCase();
      if (!(CARRIERS as readonly string[]).includes(carrier) || carrier === "MANUAL")
        fail(400, "VALIDATION", "carrier must be GHTK or VTP");
      const order = await prisma.order.findUnique({
        where: { id: body.orderId },
        include: {
          shipment: true,
          items: true,
          webPayments: { select: { status: true } },
          store: { select: { name: true, region: { select: { orgId: true } } } },
        },
      });
      if (!order) fail(404, "NOT_FOUND", "Order not found");
      assertStoreAccess(auth, order.storeId, "inventory.adjust");
      if (order.type === "pickup") fail(409, "INVALID_STATUS_TRANSITION", "Pickup orders need no carrier");
      if (!order.shipment) fail(400, "VALIDATION", "Ship the order first (creates the recipient address)");
      // COD = nothing captured online yet.
      const paidOnline = order.webPayments.some((w) => w.status === "PAID");
      const cod = paidOnline ? 0 : Number(order.total);
      const booking = await bookCarrierShipment(carrier as "GHTK" | "VTP", {
        orderId: order.id,
        orderNumber: order.number,
        recipientName: order.shipment.recipientName,
        recipientPhone: order.shipment.recipientPhone,
        address: order.shipment.address,
        codAmount: cod,
        weightGrams: Number(body.weightGrams ?? 500),
        storeAddress: order.store?.name ?? "Melio Bookstore",
      });
      await attachCarrierBooking(order.id, carrier as "GHTK" | "VTP", booking);
      await audit(auth.userId, "order.book_carrier", "Order", order.id, {
        number: order.number, carrier, trackingNumber: booking.trackingNumber,
      });
      return ok({ number: order.number, carrier, trackingNumber: booking.trackingNumber, fee: booking.fee });
    }

    if (body.action === "deliver") {
      const order = await prisma.$transaction(async (tx) => {
        const current = await tx.order.findUnique({ where: { id: body.orderId }, include: { shipment: true } });
        if (!current) fail(404, "NOT_FOUND", "Order not found");
        assertStoreAccess(auth, current.storeId, "inventory.adjust");
        // Delivery is only valid from SHIPPED (or pickup READY flow).
        if (!["SHIPPED", "READY"].includes(current.status))
          fail(409, "INVALID_STATUS_TRANSITION", `Cannot deliver ${current.status} order`);
        const claimed = await tx.order.updateMany({
          where: { id: current.id, status: current.status }, data: { status: "DELIVERED" },
        });
        if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "Order was already updated");
        const updated = await tx.order.update({
          where: { id: current.id },
          data: {
            shipment: current.shipment ? { update: { status: "DELIVERED", deliveredAt: new Date() } } : undefined,
            statusHistory: { create: { fromStatus: current.status, toStatus: "DELIVERED", userId: auth.userId } },
          },
        });
        await audit(auth.userId, "order.deliver", "Order", current.id, { number: current.number }, tx);
        return updated;
      }, TX_OPTIONS);
      return ok({ number: order.number, status: order.status });
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: body.orderId }, include: { items: true } });
      if (!order) fail(404, "NOT_FOUND", "Order not found");
      assertStoreAccess(auth, order.storeId, "inventory.adjust");

      if (body.action === "cancel") {
        // PAID money must go through the Returns/refund flow — cancelling
        // would release stock the customer already paid for.
        if (["PAID", "SHIPPED", "DELIVERED", "CANCELLED"].includes(order.status))
          fail(409, "INVALID_STATUS_TRANSITION", `Cannot cancel ${order.status} order`);
        const claimed = await tx.order.updateMany({
          where: { id: order.id, status: order.status }, data: { status: "CANCELLED" },
        });
        if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "Order was already updated");
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
          data: { statusHistory: { create: { fromStatus: order.status, toStatus: "CANCELLED", userId: auth.userId } } },
        }).then(async (cancelled) => {
          await audit(auth.userId, "order.cancel", "Order", order.id, { number: order.number }, tx);
          return cancelled;
        });
      }

      const isPickup = body.action === "collect";
      if (!isPickup && body.action !== "ship") fail(400, "VALIDATION", "Unknown action");
      if ((isPickup && order.type !== "pickup") || (!isPickup && order.type === "pickup"))
        fail(409, "INVALID_STATUS_TRANSITION", "Fulfillment action does not match order type");
      if (!["PAID", "CONFIRMED", "ALLOCATED", "PICKING", "PACKED", "READY"].includes(order.status))
        fail(409, "INVALID_STATUS_TRANSITION", `Cannot fulfill ${order.status} order`);
      const nextStatus = isPickup ? "DELIVERED" : "SHIPPED";
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: order.status }, data: { status: nextStatus },
      });
      if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "Order was already updated");

      const reservations = await tx.inventoryMovement.findMany({
        where: { refType: "order", refId: order.id, type: "RESERVATION" },
      });
      if (reservations.length !== order.items.length) fail(409, "VALIDATION", "Order reservation is incomplete");
      const location = await tx.stockLocation.findUnique({ where: { id: reservations[0].locationId } });
      if (!location) fail(404, "NOT_FOUND", "Fulfillment location not found");
      await requirePermission("inventory.adjust", location.storeId);
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

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
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
      await audit(auth.userId, isPickup ? "order.collect" : "order.ship", "Order", order.id, { number: order.number }, tx);
      return updated;
    }, TX_OPTIONS);
    return ok({ number: result.number, status: result.status });
  } catch (err) {
    return apiError(err);
  }
}
