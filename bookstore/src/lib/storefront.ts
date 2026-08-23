import { Prisma } from "../generated/prisma/client";
import { fail, nextBusinessNumber } from "./api";
import { prisma } from "./db";
import { createReservedOrder } from "./orders";

export async function listStorefrontProducts(input: {
  q?: string | null;
  categoryId?: string | null;
  storeId?: string | null;
}) {
  const q = input.q?.trim().slice(0, 80) || undefined;
  const store = input.storeId
    ? await prisma.store.findFirst({ where: { id: input.storeId, active: true }, select: { id: true } })
    : await prisma.store.findFirst({ where: { active: true }, orderBy: { code: "asc" }, select: { id: true } });
  if (!store) fail(404, "NOT_FOUND", "No active store available");
  const now = new Date();
  const [rows, categories, stores] = await Promise.all([
    prisma.product.findMany({
      where: {
        status: "active",
        categoryId: input.categoryId || undefined,
        ...(q ? { OR: [
          { name: { contains: q, mode: "insensitive" } },
          { brand: { name: { contains: q, mode: "insensitive" } } },
          { author: { name: { contains: q, mode: "insensitive" } } },
          { publisher: { name: { contains: q, mode: "insensitive" } } },
        ] } : {}),
      },
      select: {
        id: true, name: true, description: true, createdAt: true,
        category: { select: { id: true, name: true } },
        brand: { select: { name: true } },
        author: { select: { name: true } }, publisher: { select: { name: true } },
        variants: {
          where: { active: true },
          select: {
            id: true, name: true, sku: true,
            prices: {
              where: {
                priceList: { kind: { in: ["online", "retail"] } }, validFrom: { lte: now },
                OR: [{ validTo: null }, { validTo: { gt: now } }],
              },
              select: { amount: true, priceList: { select: { kind: true } } },
              orderBy: { validFrom: "desc" },
            },
            balances: {
              where: { location: { storeId: store.id, active: true } },
              select: { onHand: true, reserved: true },
            },
          },
        },
      },
      orderBy: { name: "asc" }, take: 100,
    }),
    prisma.category.findMany({
      where: { products: { some: { status: "active" } } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    }),
    prisma.store.findMany({
      where: { active: true }, select: { id: true, name: true, code: true }, orderBy: { code: "asc" },
    }),
  ]);

  const products = rows.flatMap((product) => {
    const variants = product.variants.flatMap((variant) => {
      const price = variant.prices.find((entry) => entry.priceList.kind === "online")
        ?? variant.prices.find((entry) => entry.priceList.kind === "retail");
      const available = variant.balances.reduce((sum, balance) => sum + balance.onHand - balance.reserved, 0);
      return price && available > 0
        ? [{ id: variant.id, name: variant.name, sku: variant.sku, price: Number(price.amount), available }]
        : [];
    });
    return variants.length ? [{ ...product, variants }] : [];
  });
  return { products, categories, stores, storeId: store.id };
}

export type StorefrontCheckoutInput = {
  idempotencyKey: string;
  storeId: string;
  fulfillment: "delivery" | "pickup";
  customer: { name: string; phone: string; email?: string; address?: string };
  couponCode?: string;
  items: { variantId: string; quantity: number }[];
};

export async function checkoutStorefrontOrder(input: StorefrontCheckoutInput) {
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(input.idempotencyKey ?? ""))
    fail(400, "VALIDATION", "Invalid idempotency key");
  if (!input.storeId || !["delivery", "pickup"].includes(input.fulfillment))
    fail(400, "VALIDATION", "Store and fulfillment method are required");
  const name = input.customer?.name?.trim();
  const phone = input.customer?.phone?.replace(/[\s().-]/g, "");
  const email = input.customer?.email?.trim().toLowerCase() || null;
  const address = input.customer?.address?.trim() || null;
  if (!name || name.length > 100 || !/^\+?\d{9,15}$/.test(phone ?? ""))
    fail(400, "VALIDATION", "Valid customer name and phone are required");
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
    fail(400, "VALIDATION", "Invalid email address");
  if (input.fulfillment === "delivery" && (!address || address.length > 500))
    fail(400, "VALIDATION", "Delivery address is required");
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 50)
    fail(400, "VALIDATION", "Cart must contain 1-50 items");

  const externalId = `storefront:${input.idempotencyKey}`;
  const existing = await prisma.order.findFirst({
    where: { externalId }, include: { customer: { select: { phone: true } } },
  });
  if (existing) {
    if (existing.customer.phone !== phone) fail(409, "DUPLICATE", "Checkout key belongs to another order");
    return existing;
  }
  const store = await prisma.store.findFirst({ where: { id: input.storeId, active: true } });
  if (!store) fail(404, "NOT_FOUND", "Store not found or inactive");

  const customerCode = await nextBusinessNumber("CUS");
  const customer = await prisma.customer.upsert({
    where: { phone },
    create: { code: customerCode, name, phone, email, address },
    // Guest checkout must not overwrite an existing member profile using only a known phone number.
    update: {},
  });
  try {
    return await createReservedOrder({
      channel: "WEB",
      type: input.fulfillment === "pickup" ? "pickup" : "ship_from_store",
      storeId: store.id,
      customerId: customer.id,
      couponCode: input.couponCode?.trim() || null,
      externalId,
      shipping: input.fulfillment === "delivery" ? { recipientName: name, recipientPhone: phone!, address: address! } : null,
      items: input.items,
    }, "storefront");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.order.findFirst({ where: { externalId } });
      if (duplicate) return duplicate;
    }
    throw error;
  }
}
