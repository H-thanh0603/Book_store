import { Prisma } from "../generated/prisma/client";
import { fail, nextBusinessNumber } from "./api";
import { prisma, prismaRead } from "./db";
import { createReservedOrder } from "./orders";
import { evaluatePromotions, mergeLineDiscounts, type CartLine } from "./promotions";
import { embedText } from "./embeddings";
import { buildVnpayUrl, vnpayConfigured } from "./vnpay";
import { buildMomoUrl, momoConfigured } from "./momo";
import { buildZaloPayUrl, zaloPayConfigured } from "./zalopay";
import { sendMail } from "./mail";
import { orderConfirmationEmail, type OrderEmailData } from "./email-templates";
import { cacheGet, cacheSet } from "./redis";

// In-process fuzzy gate cache (SCALE-003): per-org { count, at }. Redis is
// optional here — a per-process 5-min TTL is fine because the gate is approximate.
const fuzzyCountCache = new Map<string, { count: number; at: number }>();
async function fuzzyAllowed(orgId: string): Promise<boolean> {
  const FUZZY_MAX_ROWS = Math.max(1000, Number(process.env.FUZZY_MAX_ROWS ?? 50_000) || 50_000);
  const now = Date.now();
  const cached = fuzzyCountCache.get(orgId);
  if (!cached || now - cached.at > 5 * 60_000) {
    const count = await prismaRead.product.count({ where: { status: "active", orgId } });
    fuzzyCountCache.set(orgId, { count, at: now });
    return count <= FUZZY_MAX_ROWS;
  }
  return cached.count <= FUZZY_MAX_ROWS;
}

// Cache layer: Redis (shared across instances) with in-process fallback.
const CATALOG_TTL_SEC = 30;
type CatalogResult = {
  products: { id: string; name: string; description: string | null; createdAt: Date; variants: unknown[] }[];
  categories: { id: string; name: string }[];
  stores: { id: string; name: string; code: string }[];
  storeId: string;
};
const inProcessCatalog = new Map<string, { value: CatalogResult; expiresAt: number }>();
// Single-flight: when a cache key expires, the FIRST miss starts the fetch and
// every other concurrent miss awaits the SAME promise. Without this, a TTL
// expiry under load turns into a thundering herd — hundreds of identical DB
// fan-outs (product+categories+stores+fuzzy transaction) pile onto the pool
// at once and pool-acquire timeouts become 500s (found by the 1000-VU k6 run:
// 554 connect-timeouts in 3 minutes, all on this route).
const catalogInflight = new Map<string, Promise<CatalogResult>>();

export type CatalogSort = "name" | "price_asc" | "price_desc" | "newest";
const CATALOG_SORTS: CatalogSort[] = ["name", "price_asc", "price_desc", "newest"];

/** Validate + normalize catalog filter params. Fail closed (400) on junk. */
export function normalizeCatalogInput(input: {
  q?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  storeId?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: CatalogSort | string | null;
}) {
  const pick = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 64) : undefined);
  const num = (v: number | null | undefined, field: string): number | undefined => {
    if (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))) return undefined;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1_000_000_000)
      fail(400, "VALIDATION", `${field} must be a number between 0 and 1000000000`);
    return Math.floor(v);
  };
  const minPrice = num(input.minPrice, "minPrice");
  const maxPrice = num(input.maxPrice, "maxPrice");
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice)
    fail(400, "VALIDATION", "minPrice must not exceed maxPrice");
  const sort = input.sort ?? "name";
  if (!CATALOG_SORTS.includes(sort as CatalogSort))
    fail(400, "VALIDATION", `sort must be one of ${CATALOG_SORTS.join(", ")}`);
  return {
    q: input.q, categoryId: pick(input.categoryId), brandId: pick(input.brandId),
    storeId: pick(input.storeId), minPrice, maxPrice, sort: sort as CatalogSort,
  };
}

export async function listStorefrontProducts(input: {
  q?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  storeId?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: CatalogSort | string | null;
}) {
  const normalized = normalizeCatalogInput(input);
  const cacheKey = JSON.stringify([normalized.q ?? "", normalized.categoryId ?? "", normalized.brandId ?? "", normalized.storeId ?? "", normalized.minPrice ?? "", normalized.maxPrice ?? "", normalized.sort]);
  const redisKey = `catalog:${cacheKey}`;

  // 1. Try Redis
  const redisVal = await cacheGet<CatalogResult>(redisKey);
  if (redisVal) return redisVal;

  // 2. Try in-process cache
  const cached = inProcessCatalog.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  // 3. Fetch from DB — single-flight: concurrent misses share one fetch
  const flight = catalogInflight.get(cacheKey) ?? listStorefrontProductsUncached(normalized).finally(() => {
    catalogInflight.delete(cacheKey);
  });
  catalogInflight.set(cacheKey, flight);
  const result = await flight;

  // 4. Populate both caches (first finisher wins; identical payloads)
  inProcessCatalog.set(cacheKey, { value: result, expiresAt: Date.now() + CATALOG_TTL_SEC * 1000 });
  await cacheSet(redisKey, result, CATALOG_TTL_SEC);

  return result;
}

// Public catalog: pure reads, seconds-scale staleness acceptable → replica client.
async function listStorefrontProductsUncached(input: {
  q?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  storeId?: string | null;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  sort: CatalogSort;
}) {
  const q = input.q?.trim().slice(0, 80) || undefined;
  // Per-word AND search: every word must appear in one of the searched fields,
  // so word order no longer matters ("potter hary" works).
  const words = q ? q.split(/\s+/).slice(0, 6) : [];
  const store = input.storeId
    ? await prismaRead.store.findFirst({ where: { id: input.storeId, active: true }, select: { id: true, orgId: true } })
    : await prismaRead.store.findFirst({ where: { active: true }, orderBy: { code: "asc" }, select: { id: true, orgId: true } });
  if (!store) fail(404, "NOT_FOUND", "No active store available");
  // SEC-004: the public catalog shows only the selected store's org —
  // one tenant's assortment never leaks into another tenant's storefront.
  const orgId = store.orgId;
  const now = new Date();
  const catalogSelect = {
    select: {
      id: true, name: true, description: true, createdAt: true, imageUrl: true,
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
  // In-stock gate FIRST: Prisma can't compare two columns (onHand >
  // reserved) inside a relation filter, so resolve the available variant ids
  // with one indexed raw query. Without this, `take: 100 ... orderBy: name`
  // below would page the catalog alphabetically and silently hide in-stock
  // products sorted past the cutoff.
  const stocked = await prismaRead.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT b."variantId" AS id
    FROM "InventoryBalance" b
    JOIN "StockLocation" l ON l.id = b."locationId"
    WHERE l."storeId" = ${store.id} AND l.active
      AND (b."onHand" - b.reserved) > 0`;
  const stockedIds = stocked.map((r) => r.id);
  const [categories, stores] = await Promise.all([
    prismaRead.category.findMany({
      where: { products: { some: { status: "active", orgId } } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    }),
    prismaRead.store.findMany({
      where: { active: true, orgId }, select: { id: true, name: true, code: true }, orderBy: { code: "asc" },
    }),
  ]);
  if (stockedIds.length === 0) return { products: [], categories, stores, storeId: store.id };
  const exactRows = await prismaRead.product.findMany({
      where: {
        status: "active",
        orgId,
        categoryId: input.categoryId || undefined,
        brandId: input.brandId || undefined,
        variants: { some: { id: { in: stockedIds }, active: true } },
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
    });

  let rows = exactRows;
  // Fuzzy fallback: no exact hit → best word-vs-word trigram similarity on
  // name ("ballo" still finds "Balo học sinh 20L"). Full-scan SIMILARITY is
  // not index-served; on a large catalog one adversarial query (many words,
  // long names) can monopolize a pool connection for minutes. The scan runs
  // inside an interactive transaction with a 300ms local statement timeout —
  // on timeout the fuzzy tier simply returns nothing and the request ends
  // with the exact-match result (empty), instead of pinning the pool.
  // Single-word queries only: a 3-word fuzzy AND needs every word to clear
  // 0.3 against some word of the name — that almost never matches on real
  // catalogs and multiplies the SIMILARITY calls per row.
  const FUZZY_STATEMENT_TIMEOUT_MS = Math.max(50, Number(process.env.FUZZY_SEARCH_TIMEOUT_MS ?? 300) || 300);
  // SCALE-003: above this many active products the trigram scan stops being
  // a 300ms gamble and becomes a guaranteed pool pin — skip the fuzzy tier
  // entirely and return the exact result. Count is cached 5 min in-process
  // (a count(*) per search would itself scan on huge catalogs).
  if (words.length === 1 && words[0].length >= 3 && rows.length === 0 && (await fuzzyAllowed(orgId))) {
    try {
      const hits = await prismaRead.$transaction(async (tx) => {
        // SET LOCAL cannot take a bind parameter (Prisma 42601) — inline a
        // validated integer instead. Math.max() above guarantees ≥ 50ms and
        // Number(...) || 300 rejects non-numeric env values.
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${FUZZY_STATEMENT_TIMEOUT_MS}`);
        return tx.$queryRaw<{ id: string }[]>`
          SELECT p.id FROM "Product" p
          WHERE p.status = 'active' AND p."orgId" = ${orgId} ${input.categoryId ? Prisma.sql`AND p."categoryId" = ${input.categoryId}` : Prisma.empty} ${input.brandId ? Prisma.sql`AND p."brandId" = ${input.brandId}` : Prisma.empty}
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
      });
      if (hits.length)
        rows = await prismaRead.product.findMany({
          where: { id: { in: hits.map((h) => h.id) }, orgId },
          ...catalogSelect,
          orderBy: { name: "asc" },
        });
    } catch {
      // statement_timeout (57014) or pool pressure — fuzzy is best-effort;
      // fall through with the exact-match rows (empty) rather than erroring.
    }
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
          WHERE p.status = 'active' AND p."orgId" = ${orgId}
            ${input.categoryId ? Prisma.sql`AND p."categoryId" = ${input.categoryId}` : Prisma.empty}
            ${input.brandId ? Prisma.sql`AND p."brandId" = ${input.brandId}` : Prisma.empty}
          ORDER BY e.embedding <=> ${`[${vec.join(",")}]`}::vector
          LIMIT 100`;
        if (hits.length)
          rows = await prismaRead.product.findMany({
            where: { id: { in: hits.map((h) => h.id) }, orgId },
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
    return variants.length ? [{ ...product, image: product.imageUrl, variants }] : [];
  });
  // Price-range filter + sort run in memory over the in-stock set: variant
  // prices live in the related Price table (no single sortable column), and
  // the stocked-id gate already bounds the working set.
  const minById = new Map(products.map((p) => [p.id, Math.min(...p.variants.map((v) => v.price))]));
  const inRange = products.filter((p) => {
    const floor = minById.get(p.id) ?? 0;
    if (input.minPrice !== undefined && floor < input.minPrice) return false;
    if (input.maxPrice !== undefined && floor > input.maxPrice) return false;
    return true;
  });
  const sorted = [...inRange].sort((a, b) => {
    switch (input.sort) {
      case "price_asc": return (minById.get(a.id) ?? 0) - (minById.get(b.id) ?? 0);
      case "price_desc": return (minById.get(b.id) ?? 0) - (minById.get(a.id) ?? 0);
      case "newest": return b.createdAt.getTime() - a.createdAt.getTime();
      default: return a.name.localeCompare(b.name, "vi");
    }
  });
  return { products: sorted, categories, stores, storeId: store.id };
}

export type StorefrontCheckoutInput = {
  idempotencyKey: string;
  storeId: string;
  fulfillment: "delivery" | "pickup";
  paymentMethod?: "COD" | "VNPAY" | "MOMO" | "ZALOPAY";
  customer: { name: string; phone: string; email?: string; address?: string };
  couponCode?: string;
  items: { variantId: string; quantity: number }[];
};

export type StorefrontQuoteInput = {
  storeId?: string | null;
  couponCode?: string | null;
  fulfillment?: "delivery" | "pickup";
  address?: string | null;
  items: { variantId: string; quantity: number }[];
};

export type StorefrontQuote = {
  subtotal: number;
  discountTotal: number;
  /** Embedded VAT in the listed (VAT-inclusive) prices — informational only. */
  taxAmount: number;
  total: number;
  shipping: { zone: string; fee: number; freeShip: boolean };
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

  // SEC-004: cart variant ids are client-controlled — resolve the store's org
  // first and price only that org's variants. A crafted quote for another
  // tenant's variant fails closed (unknown variant) instead of pricing
  // foreign goods.
  const quoteStore = input.storeId
    ? await prismaRead.store.findFirst({ where: { id: input.storeId, active: true }, select: { orgId: true } })
    : null;
  const variants = await prismaRead.productVariant.findMany({
    where: {
      id: { in: input.items.map((item) => item.variantId) },
      active: true,
      ...(quoteStore ? { orgId: quoteStore.orgId } : {}),
    },
    include: {
      product: { select: { categoryId: true, taxRate: true } },
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
  // N3b: same zone fee the checkout will charge (0 for pickup).
  const { quoteShipping } = await import("./shipping");
  const shipping = input.fulfillment === "pickup"
    ? { zone: "PICKUP", fee: 0n, freeShip: true }
    : await quoteShipping({ address: input.address, subtotal });

  const couponApplied =
    Boolean(coupon) && !couponInvalidReason && applied.some((promo) => promo.discountTotal > 0n);
  if (coupon && !couponApplied && !couponInvalidReason) {
    // The coupon exists but did not win the promotion evaluation — most often
    // because a higher-priority automatic promotion took the non-stackable
    // slot, or the cart does not meet the coupon's own conditions.
    couponInvalidReason =
      "Mã hợp lệ nhưng chưa được áp dụng cho giỏ hàng này (ưu đãi tự động đang được tính)";
  }
  // VAT-inclusive breakdown (informational — total unchanged, see lib/tax.ts).
  const { sumIncludedTax } = await import("./tax");
  const rateByVariant = new Map(variants.map((v) => [v.id, Number(v.product.taxRate ?? 0.08)]));
  const taxAmount = sumIncludedTax(
    lines.map((line) => ({ grossMinor: line.unitPrice * BigInt(line.quantity), rate: rateByVariant.get(line.variantId) ?? 0.08 }))
  );
  return {
    subtotal: Number(subtotal),
    discountTotal: Number(discounts.total),
    taxAmount: Number(taxAmount),
    total: Number(subtotal - discounts.total + shipping.fee),
    shipping: { zone: shipping.zone, fee: Number(shipping.fee), freeShip: shipping.freeShip },
    promotions: applied
      .filter((promo) => promo.discountTotal > 0n)
      .map((promo) => ({ name: promo.name, discountTotal: Number(promo.discountTotal) })),
    couponApplied,
    couponInvalidReason: coupon && !couponApplied
      ? (couponInvalidReason ?? "Mã chưa đạt điều kiện áp dụng cho giỏ hàng này")
      : undefined,
  };
}

export type TrackOrderInput = {
  number: string;
  phone: string;
};

export type TrackStage = {
  label: string;
  time: string;
  done: boolean;
  desc: string;
};

export type TrackedOrder = {
  number: string;
  status: string;
  createdAt: Date;
  total: number;
  storeName: string;
  shipment: { carrier: string | null; trackingNumber: string | null; status: string | null } | null;
  items: { id: string; name: string; quantity: number; price: number }[];
  stages: TrackStage[];
};

function normPhone(v: string) {
  // 0901234567 / +84 90 123 4567 / 84 912345678 all normalize to the same core.
  return v.replace(/\D/g, "").replace(/^84/, "").replace(/^0/, "");
}

/**
 * Public delivery tracking. Two-factor lookup: the exact order number AND the
 * phone recorded on the order must both match — knowing one alone reveals
 * nothing. The response carries fulfillment status only: no customer name,
 * phone or address ever leaves the system here. Extracted from the track
 * route so the shopping agent backend reuses the same ordered flow.
 */
export async function trackStorefrontOrder(
  input: TrackOrderInput,
): Promise<{ order: TrackedOrder | null }> {
  const number = input.number.trim().toUpperCase();
  const phone = input.phone.trim();
  if (!number || !phone) return { order: null };
  const order = await prisma.order.findUnique({
    where: { number },
    select: {
      number: true, status: true, createdAt: true, total: true,
      store: { select: { name: true } },
      customer: { select: { phone: true } }, // verification factor only — never returned
      shipment: { select: { carrier: true, trackingNumber: true, status: true } },
      items: {
        select: {
          id: true, quantity: true, unitPrice: true,
          variant: { select: { product: { select: { name: true } } } },
        },
      },
    },
  });
  if (!order || !order.customer.phone) return { order: null };
  if (normPhone(order.customer.phone) !== normPhone(phone)) return { order: null };

  const isDelivered = order.status === "DELIVERED";
  const isShipped = order.status === "SHIPPED" || isDelivered;
  const isPacked = ["PACKED", "READY"].includes(order.status) || isShipped;
  const isConfirmed = order.status !== "NEW" && order.status !== "CANCELLED";

  const stages: TrackStage[] = [
    { label: "Đã tiếp nhận đơn", time: new Date(order.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }), done: true, desc: "Hệ thống đã xác nhận đơn hàng" },
    { label: "Thủ thư đóng gói", time: "", done: isConfirmed, desc: "Đã kiểm tra chất lượng ấn bản & bọc chống sốc" },
    { label: "Bàn giao vận chuyển", time: "", done: isPacked, desc: "Đơn vị vận chuyển đã nhận hàng" },
    { label: "Đang giao hàng", time: "", done: isShipped, desc: "Shipper đang trên đường giao đến bạn" },
    { label: "Giao thành công", time: "", done: isDelivered, desc: "Hoàn tất đơn hàng" },
  ];

  return {
    order: {
      number: order.number,
      status: order.status,
      createdAt: order.createdAt,
      total: Number(order.total),
      storeName: order.store?.name ?? "Kho Trung Tâm",
      shipment: order.shipment,
      items: order.items.map((it) => ({
        id: it.id,
        name: it.variant.product.name,
        quantity: it.quantity,
        price: Number(it.unitPrice),
      })),
      stages,
    },
  };
}

/** Returns the created order plus a VNPay redirect URL when paying online. */
export async function checkoutStorefrontOrder(
  input: StorefrontCheckoutInput,
  opts: { ip?: string; baseUrl?: string } = {},
) {
  const method = input.paymentMethod ?? "COD";
  if (!["COD", "VNPAY", "MOMO", "ZALOPAY"].includes(method)) fail(400, "VALIDATION", "Invalid payment method");
  // Fail before reserving stock rather than after.
  if (method === "VNPAY" && !vnpayConfigured()) fail(400, "VALIDATION", "VNPay is not configured");
  if (method === "MOMO" && !momoConfigured()) fail(400, "VALIDATION", "MoMo is not configured");
  if (method === "ZALOPAY" && !zaloPayConfigured()) fail(400, "VALIDATION", "ZaloPay is not configured");
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
  const store = await prisma.store.findFirst({
    where: { id: input.storeId, active: true },
    include: { region: { select: { orgId: true } } },
  });
  if (!store) fail(404, "NOT_FOUND", "Store not found or inactive");

  // SEC-004: customer identity is scoped per org — the same phone at two
  // tenants is two customers, and this order belongs to this store's org.
  // Guest upsert race: two concurrent checkouts with the same phone both see
  // "no row" and both INSERT; one loses the unique race (P2002). The loser
  // re-reads — the winner's row is committed by then — and continues. Found
  // by the k6 checkout pressure run (VUs re-use one phone per VU): a raw
  // P2002 here surfaced as a 500 to real shoppers.
  const orgId = store.region.orgId;
  const customerCode = await nextBusinessNumber("CUS");
  const customer = await prisma.customer
    .upsert({
      where: { orgId_phone: { orgId, phone } },
      create: { code: customerCode, name, phone, email, address, orgId },
      // Guest checkout must not overwrite an existing member profile using only a known phone number.
      update: {},
    })
    .catch(async (err: unknown) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // The loser of the create race re-reads by BOTH unique keys: the
        // conflict may be on (orgId, phone) — same phone, different email —
        // or (orgId, email) — same email, different phone (repeat guest
        // checkout with a new phone; k6 exposed exactly this). Prefer the
        // phone-keyed row so orders keep grouping by the phone the customer
        // just typed; fall back to the email-keyed one.
        const byPhone = await prisma.customer.findUnique({ where: { orgId_phone: { orgId, phone } } });
        if (byPhone) return byPhone;
        if (email) {
          const byEmail = await prisma.customer.findFirst({ where: { orgId, email } });
          if (byEmail) return byEmail;
        }
      }
      throw err;
    });

  // Fetch variant details for email template (org-scoped like the quote).
  const variantIds = input.items.map((item) => item.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, orgId },
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
 * Attach the gateway redirect URL when paying online. COD returns the bare
 * order. The payment intent row is created here so the callback has an
 * amount/ref to verify against even before the gateway redirects.
 */
async function withPayment(
  order: { id: string; number: string; total: bigint; status?: unknown },
  method: "COD" | "VNPAY" | "MOMO" | "ZALOPAY",
  opts: { ip?: string; baseUrl?: string },
): Promise<{ id: string; number: string; total: bigint; status?: unknown; paymentUrl?: string }> {
  if (method === "COD") return order;
  // A retry on an already-settled or expired/cancelled order must not mint a
  // fresh payment URL — that is the paid-after-cancel path (audit MONEY-001).
  if (order.status && order.status !== "CONFIRMED")
    fail(409, "INVALID_STATUS_TRANSITION", `Order is ${order.status} and can no longer be paid online`);
  const target = { id: order.id, number: order.number, total: order.total };
  const paymentUrl =
    method === "VNPAY" ? await buildVnpayUrl(target, opts.ip ?? "", opts.baseUrl ?? "")
    : method === "MOMO" ? await buildMomoUrl(target, opts.baseUrl ?? "")
    : await buildZaloPayUrl(target, opts.baseUrl ?? "");
  return { ...order, paymentUrl };
}
