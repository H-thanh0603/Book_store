import type { MetadataRoute } from "next";
import { blogArticles } from "@/app/shop/_components/data";
import { prismaRead } from "@/lib/db";

// Public storefront sitemap (WS2.2): static landing pages + blog articles +
// active products (B growth: indexable /shop/p/[id] entries for Google).
// Staff/admin routes stay out — robots.ts already disallows them.
const STATIC_ROUTES = [
  "",
  "/shop",
  "/deals",
  "/bestsellers",
  "/toys",
  "/back-to-school",
  "/gift-finder",
  "/reading-challenge",
  "/stores",
  "/track",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const products = await prismaRead.product.findMany({
    where: { status: "active" },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  }).catch(() => []);
  return [
    ...STATIC_ROUTES.map((path) => ({
      url: path || "/",
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: path === "/shop" || path === "" ? 1 : 0.8,
    })),
    ...blogArticles.map((a) => ({
      url: `/blog/${a.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...products.map((p) => ({
      url: `/shop/p/${p.id}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
