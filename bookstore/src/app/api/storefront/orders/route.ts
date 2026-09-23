// Storefront order history. Returns the logged-in customer's orders
// in reverse chronological order with their items. Public route —
// gated by `bs_customer` cookie via getCustomerAuth.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireCustomerAuth } from "@/lib/customer-auth";
import { apiError, getSystemConfig, ok } from "@/lib/api";

export async function GET(_req: NextRequest) {
  try {
    const auth = await requireCustomerAuth();
    const reservationTtlMinutes = await getSystemConfig<number>("orders.reservationTtlMinutes", 60);
    const orders = await prisma.order.findMany({
      where: { customerId: auth.customerId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        items: { include: { variant: { include: { product: { select: { name: true } } } } } },
        shipment: { select: { status: true, trackingNumber: true } },
        store: { select: { name: true } },
      },
    });
    return ok(orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      fulfillment: o.type,
      storeName: o.store?.name ?? null,
      reservationExpiresAt: o.type === "pickup" && o.status === "CONFIRMED"
        ? new Date(o.createdAt.getTime() + reservationTtlMinutes * 60_000)
        : null,
      total: o.total.toString(),
      createdAt: o.createdAt,
      shipment: o.shipment,
      items: o.items.map((it) => ({
        id: it.id,
        name: it.variant.product.name,
        quantity: it.quantity,
        price: it.unitPrice.toString(),
      })),
    })));
  } catch (err) {
    return apiError(err);
  }
}
