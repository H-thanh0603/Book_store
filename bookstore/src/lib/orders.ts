import { prisma } from "./db";
import { fail, nextBusinessNumber } from "./api";
import { applyMovement } from "./inventory";
import { evaluatePromotions, mergeLineDiscounts, type CartLine } from "./promotions";
import { OrderType, Prisma } from "../generated/prisma/client";

export type CreateOrderInput = {
  channel: "WEB" | "APP" | "MARKETPLACE" | "CALL_CENTER";
  type?: keyof typeof OrderType;
  storeId?: string | null;
  customerId: string;
  locationId?: string | null;
  externalId?: string | null;
  couponCode?: string | null;
  shipping?: { recipientName: string; recipientPhone: string; address: string } | null;
  items: { variantId: string; quantity: number }[];
};

export async function createReservedOrder(
  input: CreateOrderInput,
  actorId?: string,
  client?: Prisma.TransactionClient,
) {
  if (!["WEB", "APP", "MARKETPLACE", "CALL_CENTER"].includes(input.channel))
    fail(400, "VALIDATION", "Invalid order channel");
  if (input.type && !Object.values(OrderType).includes(input.type))
    fail(400, "VALIDATION", "Invalid order type");
  if (typeof input.customerId !== "string" || !input.customerId || !Array.isArray(input.items) || input.items.length === 0)
    fail(400, "VALIDATION", "customerId and items required");
  if (input.storeId != null && typeof input.storeId !== "string") fail(400, "VALIDATION", "Invalid storeId");
  if (input.locationId != null && typeof input.locationId !== "string") fail(400, "VALIDATION", "Invalid locationId");
  if (input.couponCode != null && typeof input.couponCode !== "string") fail(400, "VALIDATION", "Invalid couponCode");
  if (input.shipping && (!input.shipping.recipientName.trim() || !input.shipping.recipientPhone.trim() || !input.shipping.address.trim()))
    fail(400, "VALIDATION", "Shipping recipient, phone and address are required");
  if (new Set(input.items.map((item) => item.variantId)).size !== input.items.length)
    fail(400, "VALIDATION", "A variant may appear only once");
  for (const item of input.items)
    if (typeof item.variantId !== "string" || !item.variantId || !Number.isInteger(item.quantity) || item.quantity <= 0)
      fail(400, "VALIDATION", "Each item needs a variantId and positive integer quantity");

  const db = client ?? prisma;
  const variants = await db.productVariant.findMany({
    where: { id: { in: input.items.map((item) => item.variantId) }, active: true },
    include: {
      product: true,
      prices: {
        where: { priceList: { kind: { in: ["online", "retail"] } }, OR: [{ validTo: null }, { validTo: { gt: new Date() } }] },
        include: { priceList: true }, orderBy: { validFrom: "desc" },
      },
    },
  });
  if (variants.length !== input.items.length) fail(404, "NOT_FOUND", "Unknown or inactive variant in order");

  const lines: CartLine[] = input.items.map((item) => {
    const variant = variants.find((candidate) => candidate.id === item.variantId)!;
    const unitPrice = variant.prices.find((price) => price.priceList.kind === "online")?.amount
      ?? variant.prices.find((price) => price.priceList.kind === "retail")?.amount ?? 0n;
    return {
      variantId: variant.id, productId: variant.productId, categoryId: variant.product.categoryId,
      quantity: item.quantity, unitPrice,
    };
  });
  const applied = await evaluatePromotions({
    lines, storeId: input.storeId, channel: "WEB", customerId: input.customerId, couponCode: input.couponCode,
  }, db);
  const discounts = mergeLineDiscounts(applied, lines);
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * BigInt(line.quantity), 0n);

  const create = async (tx: Prisma.TransactionClient) => {
    // Customer must exist and be active-ish (real FK target, not a guessed id).
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) fail(404, "NOT_FOUND", "Unknown customer");

    const location = await tx.stockLocation.findFirst({
      where: input.locationId
        ? { id: input.locationId, active: true }
        : input.storeId
          ? { storeId: input.storeId, type: "STORE_STOCKROOM", active: true }
          : { type: "WAREHOUSE", active: true },
    });
    if (!location) fail(400, "VALIDATION", "No fulfillment location");
    // A pickup/store order must fulfill from that store; location must belong to it.
    if (input.locationId && input.storeId && location.storeId !== input.storeId)
      fail(400, "VALIDATION", "Location does not belong to the requested store");

    const order = await tx.order.create({
      data: {
        number: await nextBusinessNumber("ORD"), channel: input.channel, type: input.type ?? "delivery",
        storeId: input.storeId ?? null, customerId: input.customerId,
        externalId: input.externalId?.trim() || null, status: "CONFIRMED",
        subtotal, discountTotal: discounts.total, total: subtotal - discounts.total,
        items: { create: lines.map((line) => ({
          variantId: line.variantId, quantity: line.quantity, unitPrice: line.unitPrice,
          discount: discounts.byVariant.get(line.variantId) ?? 0n,
        })) },
        shipment: input.shipping ? { create: {
          recipientName: input.shipping.recipientName.trim(),
          recipientPhone: input.shipping.recipientPhone.trim(),
          address: input.shipping.address.trim(),
        } } : undefined,
        statusHistory: { create: { fromStatus: null, toStatus: "CONFIRMED", userId: actorId } },
      },
      include: { items: true },
    });
    for (const line of lines) await applyMovement(tx, {
      variantId: line.variantId, locationId: location.id, type: "RESERVATION",
      quantityDelta: 0, reservedDelta: line.quantity, refType: "order", refId: order.id, userId: actorId,
    });
    // Promotion usage counters — atomic claim identical to the POS path so a
    // usage-limited promo can never be over-applied by concurrent web/webhook orders.
    for (const promo of applied) {
      const row = await tx.promotion.findUniqueOrThrow({
        where: { id: promo.promoId }, select: { usageLimit: true },
      });
      const claimed = await tx.promotion.updateMany({
        where: {
          id: promo.promoId,
          ...(row.usageLimit === null ? {} : { usedCount: { lt: row.usageLimit } }),
        },
        data: { usedCount: { increment: 1 } },
      });
      if (claimed.count !== 1) fail(409, "VALIDATION", "Promotion usage limit reached");
    }
    return order;
  };
  return client ? create(client) : prisma.$transaction(create);
}
