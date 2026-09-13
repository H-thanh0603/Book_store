// StorefrontBackend — the shopping agent's contract over the store's catalog,
// cart, order and policy systems. Mirrors anthropics/commerce-agents
// `shopping_agent/backend.py::StorefrontBackend`: a deployment implements this
// interface, the agent loop only reads results. Two implementations ship:
//
// - PrismaStorefrontBackend: the real store (delegates to lib/storefront.ts).
// - StubStorefrontBackend: every method returns { unavailable: true } so a
//   shopping pilot runs with zero database. Prompt bytes never change.

import { prismaRead } from "../db";
import { encodeAgentCartSigned } from "../agent-cart";
import {
  listStorefrontProducts,
  quoteStorefrontOrder,
  trackStorefrontOrder,
  type StorefrontQuote,
  type StorefrontQuoteInput,
  type TrackedOrder,
} from "../storefront";
import { unavailable, type Unavailable } from "./types";

export type ProductSearchInput = {
  q?: string | null;
  categoryId?: string | null;
  storeId?: string | null;
};

export type ProductSearchResult = {
  products: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    image?: string | null;
    category?: { id: string; name: string } | null;
    author?: { name: string } | null;
    variants: { id: string; name: string; sku: string; price: number; available: number }[];
  }[];
  categories: { id: string; name: string }[];
  stores: { id: string; name: string; code: string }[];
  storeId: string;
};

export type TrackOrderInput = {
  number: string;
  phone: string;
};

export type PrepareCheckoutInput = {
  storeId: string;
  items: { variantId: string; quantity: number }[];
  couponCode?: string | null;
};

/**
 * Read-only checkout card. Validates items through the SAME quote engine the
 * human checkout runs, then renders the cart for the HOST to complete — the
 * agent never creates an order or charges. The host opens checkoutUrl, merges
 * `agent_cart` into the local cart, and the shopper presses Thanh toán.
 */
export type CheckoutCard = {
  storeId: string;
  items: { variantId: string; name: string; quantity: number; unitPrice: number }[];
  quote: StorefrontQuote;
  /** Absent when AGENT_CART_SECRET is unset — no forgeable handoff link. */
  checkoutUrl?: string;
};

export interface StorefrontBackend {
  readonly kind: string;
  searchProducts(input: ProductSearchInput): Promise<ProductSearchResult | Unavailable>;
  quoteOrder(input: StorefrontQuoteInput): Promise<StorefrontQuote | Unavailable>;
  trackOrder(input: TrackOrderInput): Promise<{ order: TrackedOrder | null } | Unavailable>;
  prepareCheckout(input: PrepareCheckoutInput): Promise<CheckoutCard | Unavailable>;
}

export class PrismaStorefrontBackend implements StorefrontBackend {
  readonly kind = "prisma";

  async searchProducts(input: ProductSearchInput): Promise<ProductSearchResult | Unavailable> {
    // listStorefrontProducts carries extra runtime fields (imageUrl, balances);
    // the interface exposes only the shopping-agent contract.
    const result = await listStorefrontProducts(input);
    return result as unknown as ProductSearchResult;
  }

  async quoteOrder(input: StorefrontQuoteInput): Promise<StorefrontQuote | Unavailable> {
    return quoteStorefrontOrder(input);
  }

  async trackOrder(input: TrackOrderInput): Promise<{ order: TrackedOrder | null } | Unavailable> {
    return trackStorefrontOrder(input);
  }

  async prepareCheckout(input: PrepareCheckoutInput): Promise<CheckoutCard | Unavailable> {
    const items = input.items
      .filter((l) => typeof l.variantId === "string" && l.variantId && Number.isFinite(l.quantity))
      .map((l) => ({ variantId: l.variantId, quantity: Math.min(Math.max(Math.floor(l.quantity), 1), 99) }))
      .slice(0, 50);
    if (!input.storeId || items.length === 0) {
      return unavailable("prepare_checkout cần storeId và ít nhất 1 món hàng.");
    }
    // Fixed order, enforced server-side: quote first (same engine as the
    // human checkout), card second. Unknown variants fail closed here.
    const quote = await quoteStorefrontOrder({
      storeId: input.storeId,
      couponCode: input.couponCode ?? null,
      items,
    });
    const variants = await prismaRead.productVariant.findMany({
      where: { id: { in: items.map((l) => l.variantId) } },
      select: { id: true, product: { select: { name: true } } },
    });
    const now = new Date();
    const prices = await prismaRead.price.findMany({
      where: {
        variantId: { in: items.map((l) => l.variantId) },
        priceList: { kind: { in: ["online", "retail"] } },
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gt: now } }],
      },
      include: { priceList: true },
      orderBy: { validFrom: "desc" },
    });
    const cardItems = items.map((l) => {
      const variant = variants.find((v) => v.id === l.variantId);
      const unitPrice =
        prices.find((p) => p.variantId === l.variantId && p.priceList.kind === "online")?.amount ??
        prices.find((p) => p.variantId === l.variantId && p.priceList.kind === "retail")?.amount ??
        0;
      return {
        variantId: l.variantId,
        name: variant?.product.name ?? l.variantId,
        quantity: l.quantity,
        unitPrice: Number(unitPrice),
      };
    });
    return {
      storeId: input.storeId,
      items: cardItems,
      quote,
      // Signed handoff (AGENT_CART_SECRET): unsigned forgeable links are the
      // spoofed-cart channel; without the secret the card ships no URL at
      // all (the shopper still sees items + quote in the card).
      ...(process.env.AGENT_CART_SECRET
        ? {
            checkoutUrl: `/shop?agent_cart=${encodeAgentCartSigned(cardItems.map((i) => ({ variantId: i.variantId, quantity: i.quantity, name: i.name, price: i.unitPrice })))}`,
          }
        : {}),
    };
  }
}

const STUB_REASON =
  "Storefront backend chưa cấu hình (COMMERCE_BACKEND=stub) — chạy ở chế độ pilot, mọi phương thức đều unavailable.";

export class StubStorefrontBackend implements StorefrontBackend {
  readonly kind = "stub";

  async searchProducts(_input?: ProductSearchInput): Promise<ProductSearchResult | Unavailable> {
    return unavailable(STUB_REASON);
  }

  async quoteOrder(_input?: StorefrontQuoteInput): Promise<StorefrontQuote | Unavailable> {
    return unavailable(STUB_REASON);
  }

  async trackOrder(_input?: TrackOrderInput): Promise<{ order: TrackedOrder | null } | Unavailable> {
    return unavailable(STUB_REASON);
  }

  async prepareCheckout(_input?: PrepareCheckoutInput): Promise<CheckoutCard | Unavailable> {
    return unavailable(STUB_REASON);
  }
}

export function stubReason(): string {
  return STUB_REASON;
}
