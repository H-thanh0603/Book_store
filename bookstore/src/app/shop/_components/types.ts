// Types shared across the shop page and its split-out components.
// Kept here (instead of in page.tsx) so each component imports a single
// authority for the shape of the storefront catalog.

import type { ComponentType } from "react";

export type Variant = {
  id: string;
  name: string;
  sku: string;
  price: number;
  /** Available-to-promise units for the selected store's stock room. */
  available: number;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  category: { id: string; name: string };
  brand?: { name: string } | null;
  author?: { name: string } | null;
  publisher?: { name: string } | null;
  /**
   * Optional cover image path (e.g. "/products/<id>.jpg" served from /public).
   * When absent, components render a styled placeholder so layout never shifts.
   */
  image?: string | null;
  variants: Variant[];
};

export type StoreOption = { id: string; name: string; code: string };

export type Catalog = {
  products: Product[];
  categories: { id: string; name: string }[];
  stores: StoreOption[];
  storeId: string;
};

export type CartLine = {
  variantId: string;
  productId: string;
  name: string;
  category: string;
  brand?: string;
  price: number;
  quantity: number;
  available: number;
};

export type Department = {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  count: string;
};

export type ReadingAtmosphere = {
  id: string;
  title: string;
  icon: string;
  desc: string;
  filter: string;
};

export type FeaturedCampaign = {
  tag: string;
  tagColor: string;
  badge: string;
  title: string;
  highlight: string;
  desc: string;
  bg: string;
  accent: string;
  ctaText: string;
  ctaLink: string;
  secondaryText: string;
  secondaryLink: string;
};

export type ComboBundle = {
  id: string;
  title: string;
  tag: string;
  price: number;
  originalPrice: number;
  items: string[];
  desc: string;
};

export type AuthorSpotlightData = {
  name: string;
  title: string;
  avatar: string;
  bio: string;
  quote: string;
  notableBooks: string[];
};

export type BlogArticle = {
  id: string;
  category: string;
  title: string;
  readTime: string;
  snippet: string;
  date: string;
};

export type Voucher = {
  code: string;
  title: string;
  desc: string;
};

export type GiftWrapping = "none" | "vintage" | "heritage";

export type Fulfillment = "delivery" | "pickup";

/** Shape of a backend 409 (INSUFFICIENT_STOCK) body after apiError surfaces details. */
export type StockConflictDetail = {
  variantId: string;
  locationId?: string;
  requested?: number;
  available?: number;
};
