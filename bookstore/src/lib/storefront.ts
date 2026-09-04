import { Prisma } from "../generated/prisma/client";
import { fail, nextBusinessNumber } from "./api";
import { prisma, prismaRead } from "./db";
import { createReservedOrder } from "./orders";
import { evaluatePromotions, mergeLineDiscounts, type CartLine } from "./promotions";
import { embedText } from "./embeddings";
import { buildVnpayUrl, vnpayConfigured } from "./vnpay";
import { sendMail } from "./mail";
import { orderConfirmationEmail, type OrderEmailData } from "./email-templates";
import { cacheGet, cacheSet } from "./redis";

// Cache layer: Redis (shared across instances) with in-process fallback.
const CATALOG_TTL_SEC = 30;
type CatalogResult = {
  products: { id: string; name: string; description: string | null; createdAt: Date; variants: unknown[] }[];
  categories: { id: string; name: string }[];
  stores: { id: string; name: string; code: string }[];
  storeId: string;
};
const inProcessCatalog = new Map<string, { value: CatalogResult; expiresAt: number }>();

export async function listStorefrontProducts(input: {
  q?: string | null;
  categoryId?: string | null;
  storeId?: string | null;
}) {
  const cacheKey = JSON.stringify([input.q ?? "", input.categoryId ?? "", input.storeId ?? ""]);
  const redisKey = `catalog:${cacheKey}`;

  // 1. Try Redis
  const redisVal = await cacheGet<CatalogResult>(redisKey);
  if (redisVal) return redisVal;

  // 2. Try in-process cache
  const cached = inProcessCatalog.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  // 3. Fetch from DB
  const result = await listStorefrontProductsUncached(input);

  // 4. Populate both caches
  inProcessCatalog.set(cacheKey, { value: result, expiresAt: Date.now() + CATALOG_TTL_SEC * 1000 });
  await cacheSet(redisKey, result, CATALOG_TTL_SEC);

  return result;
}

// Public catalog: pure reads, seconds-scale staleness acceptable → replica client.
async function listStorefrontProductsUncached(input: {
  q?: string | null;
  categoryId?: string | null;
  storeId?: string | null;
}) {
  const q = input.q?.trim().slice(0, 80) || undefined;
  // Per-word AND search: every word must appear in one of the searched fields,
  // so word order no longer matters ("potter hary" works).
  const words = q ? q.split(/\s+/).slice(0, 6) : [];
  const store = input.storeId
    ? await prismaRead.store.findFirst({ where: { id: input.storeId, active: true }, select: { id: true } })
    : await prismaRead.store.findFirst({ where: { active: true }, orderBy: { code: "asc" }, select: { id: true } });
  if (!store) fail(404, "NOT_FOUND", "No active store available");
  const now = new Date();
  const catalogSelect = {
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
            orderBy: { validFrom: "desc" as const },
          },
          balances: {
            where: { location: { storeId: store.id, active: true } },
            select: { onHand: true, reserved: true },
          },
        },
      },
    },
  };
  const [exactRows, categories, stores] = await Promise.all([
    prismaRead.product.findMany({
      where: {
        status: "active",
        categoryId: input.categoryId || undefined,
        ...(words.length ? {
          AND: words.map((w) => ({
            OR: [
              { name: { contains: w, mode: "insensitive" } },
              { description: { contains: w, mode: "insensitive" } },
              { brand: { name: { contains: w, mode: "insensitive" } } },
              { author: { name: { contains: w, mode: "insensitive" } } },
              { publisher: { name: { contains: w, mode: "insensitive" } } },
            ],
          })),
        } : {}),
      },
      ...catalogSelect,
      orderBy: { name: "asc" }, take: 100,
    }),
    prismaRead.category.findMany({
      where: { products: { some: { status: "active" } } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    }),
    prismaRead.store.findMany({
      where: { active: true }, select: { id: true, name: true, code: true }, orderBy: { code: "asc" },
    }),
  ]);

  let rows = exactRows;
  // Fuzzy fallback: no exact hit → best word-vs-word trigram similarity on
  // name ("ballo" still finds "Balo học sinh 20L"). Full-scan SIMILARITY is
  // not index-served but only runs when the indexed pass returned nothing;
  // every query word must clear 0.3 against SOME word of the product name.
  if (words.length && rows.length === 0) {
    const hits = await prismaRead.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "Product" p
      WHERE p.status = 'active' ${input.categoryId ? Prisma.sql`AND p."categoryId" = ${input.categoryId}` : Prisma.empty}
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(${words}::text[]) q(w)
          WHERE NOT EXISTS (
            SELECT 1
            FROM unnest(string_to_array(unaccent(lower(p.name)), ' ')) nw(w)
            WHERE length(nw.w) >= 3 AND SIMILARITY(nw.w, unaccent(lower(q.w))) > 0.3
          )
        )
      ORDER BY p.name ASC LIMIT 100`;
    if (hits.length)
      rows = await prismaRead.product.findMany({
        where: { id: { in: hits.map((h) => h.id) } },
        ...catalogSelect,
        orderBy: { name: "asc" },
      });
  }

  // Semantic tier (pgvector + Gemini embeddings): only on double-miss, so a
  // Gemini outage costs nothing on queries exact/trigram already answered.
  // Matches by meaning, not spelling ("sách về xây thói quen" → Atomic Habits).
  // Silent no-op without GEMINI_API_KEY; any error logs and keeps old behavior.
  if (!rows.length && words.length && process.env.GEMINI_API_KEY) {
    try {
      const vec = await embedText(words.join(" "));
      if (vec) {
        const hits = await prismaRead.$queryRaw<{ id: string }[]>`
          SELECT e."productId" AS id
          FROM "ProductEmbedding" e
          JOIN "Product" p ON p.id = e."productId"
          WHERE p.status = 'active'
            ${input.categoryId ? Prisma.sql`AND p."categoryId" = ${input.categoryId}` : Prisma.empty}
          ORDER BY e.embedding <=> ${`[${vec.join(",")}]`}::vector
          LIMIT 100`;
        if (hits.length)
          rows = await prismaRead.product.findMany({
            where: { id: { in: hits.map((h) => h.id) } },
            ...catalogSelect,
            orderBy: { name: "asc" },
          });
      }
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", event: "semantic_search_degraded", message: String(error) }));
    }
  }

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
  paymentMethod?: "COD" | "VNPAY";
  customer: { name: string; phone: string; email?: string; address?: string };
  couponCode?: string;
  items: { variantId: string; quantity: number }[];
};

export type StorefrontQuoteInput = {
  storeId?: string | null;
  couponCode?: string | null;
  items: { variantId: string; quantity: number }[];
};

export type StorefrontQuote = {
  subtotal: number;
  discountTotal: number;
  total: number;
  promotions: { name: string; discountTotal: number }[];
  couponApplied: boolean;
  couponInvalidReason?: string;
};

/**
 * Preview checkout totals without reserving stock or creating an order.
 * Runs the SAME promotion engine as checkoutStorefrontOrder so the number the
 * customer sees before submitting is the number the order will cost.
 * An unknown/ineligible couponCode is reported (couponApplied: false + reason)
 * rather than failing, so the UI can explain instead of blocking.
 */
export async function quoteStorefrontOrder(input: StorefrontQuoteInput): Promise<StorefrontQuote> {
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 50)
    fail(400, "VALIDATION", "Cart must contain 1-50 items");
  const coupon = input.couponCode?.trim().toUpperCase() || null;

  // If a coupon was typed, verify a matching promotion exists before quoting.
  let couponInvalidReason: string | undefined;
  if (coupon) {
    const promo = await prismaRead.promotion.findFirst({
      where: { code: coupon, active: true, startAt: { lte: new Date() }, OR: [{ endAt: null }, { endAt: { gte: new Date() } }] },
      select: { id: true, usageLimit: true, usedCount: true, memberOnly: true },
    });
    if (!promo) couponInvalidReason = "Mã không tồn tại hoặc đã hết hạn";
    else if (promo.memberOnly) couponInvalidReason = "Mã chỉ áp dụng cho thành viên Melio";
    else if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit)
      couponInvalidReason = "Mã đã hết lượt sử dụng";
  }

  const variants = await prismaRead.productVariant.findMany({
    where: { id: { in: input.items.map((item) => item.variantId) }, active: true },
    include: {
      product: { select: { categoryId: true } },
      prices: {
        where: {
          priceList: { kind: { in: ["online", "retail"] } },
          validFrom: { lte: new Date() },
          OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
        },
        include: { priceList: true }, orderBy: { validFrom: "desc" },
      },
    },
  });
  const lines: CartLine[] = input.items.flatMap((item) => {
    const variant = variants.find((candidate) => candidate.id === item.variantId);
    const unitPrice = variant?.prices.find((price) => price.priceList.kind === "online")?.amount
      ?? variant?.prices.find((price) => price.priceList.kind === "retail")?.amount;
    return variant && unitPrice
      ? [{ variantId: variant.id, productId: variant.productId, categoryId: variant.product.categoryId, quantity: item.quantity, unitPrice }]
      : [];
  });
  if (lines.length !== input.items.length) fail(404, "NOT_FOUND", "Unknown or inactive variant in cart");

  // Guest quote: promotions are evaluated without a customer so member-only
  // codes surface as "not applied" instead of silently matching.
  const applied = await evaluatePromotions({
    lines, storeId: input.storeId ?? null, channel: "WEB", customerId: null, couponCode: coupon,
  });
  const discounts = mergeLineDiscounts(applied, lines);
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * BigInt(line.quantity), 0n);

  const couponApplied =
    Boolean(coupon) && !couponInvalidReason && applied.some((promo) => promo.discountTotal > 0n);
  if (coupon && !couponApplied && !couponInvalidReason) {
    // The coupon exists but did not win the promotion evaluation — most often
    // because a higher-priority automatic promotion took the non-stackable
    // slot, or the cart does not meet the coupon's own conditions.
    couponInvalidReason =
      "Mã hợp lệ nhưng chưa được áp dụng cho giỏ hàng này (ưu đãi tự động đang được tính)";
  }
  return {
    subtotal: Number(subtotal),
    discountTotal: Number(discounts.total),
    total: Number(subtotal - discounts.total),
    promotions: applied
      .filter((promo) => promo.discountTotal > 0n)
      .map((promo) => ({ name: promo.name, discountTotal: Number(promo.discountTotal) })),
    couponApplied,
    couponInvalidReason: coupon && !couponApplied
      ? (couponInvalidReason ?? "Mã chưa đạt điều kiện áp dụng cho giỏ hàng này")
      : undefined,
  };
}

/** Returns the created order plus a VNPay redirect URL when paying online. */
export async function checkoutStorefrontOrder(
  input: StorefrontCheckoutInput,
  opts: { ip?: string; baseUrl?: string } = {},
) {
  const method = input.paymentMethod ?? "COD";
  if (!["COD", "VNPAY"].includes(method)) fail(400, "VALIDATION", "Invalid payment method");
  if (method === "VNPAY") {
    // Fail before reserving stock rather than after.
    if (!vnpayConfigured()) fail(400, "VALIDATION", "VNPay is not configured");
  }
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
    return withPayment(existing, method, opts);
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

  // Fetch variant details for email template
  const variantIds = input.items.map((item) => item.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, product: { select: { name: true } } },
  });

  try {
    const order = await createReservedOrder({
      channel: "WEB",
      type: input.fulfillment === "pickup" ? "pickup" : "ship_from_store",
      storeId: store.id,
      customerId: customer.id,
      couponCode: input.couponCode?.trim() || null,
      externalId,
      shipping: input.fulfillment === "delivery" ? { recipientName: name, recipientPhone: phone!, address: address! } : null,
      items: input.items,
    }, "storefront");

    // Fire-and-forget order confirmation email — never block checkout on mail.
    if (email) {
      const itemsWithDetails = order.items.map((item) => {
        const variant = variants.find((v) => v.id === item.variantId);
        return {
          name: variant?.product.name ?? item.variantId,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
        };
      });
      const emailData: OrderEmailData = {
        orderNumber: order.number,
        customerName: name,
        items: itemsWithDetails,
        subtotal: Number(order.subtotal),
        discountTotal: Number(order.discountTotal),
        total: Number(order.total),
        fulfillment: input.fulfillment,
        address: address ?? undefined,
        phone: phone ?? undefined,
      };
      const msg = orderConfirmationEmail(emailData);
      sendMail({ to: email, ...msg }).catch(() => {});
    }

    return withPayment(order, method, opts);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.order.findFirst({ where: { externalId } });
      if (duplicate) return withPayment(duplicate, method, opts);
    }
    throw error;
  }
}

/**
 * Attach the VNPay redirect URL when paying online. COD returns the bare
 * order. The payment intent row is created here so the callback has an
 * amount/ref to verify against even before VNPay redirects.
 */
async function withPayment(
  order: { id: string; number: string; total: bigint; status?: unknown },
  method: "COD" | "VNPAY",
  opts: { ip?: string; baseUrl?: string },
): Promise<{ id: string; number: string; total: bigint; status?: unknown; paymentUrl?: string }> {
  if (method !== "VNPAY") return order;
  // A retry on an already-settled or expired/cancelled order must not mint a
  // fresh payment URL — that is the paid-after-cancel path (audit MONEY-001).
  if (order.status && order.status !== "CONFIRMED")
    fail(409, "INVALID_STATUS_TRANSITION", `Order is ${order.status} and can no longer be paid online`);
  const paymentUrl = await buildVnpayUrl(
    { id: order.id, number: order.number, total: order.total },
    opts.ip ?? "", opts.baseUrl ?? "",
  );
  return { ...order, paymentUrl };
}
