import type { MetadataRoute } from "next";
import { blogArticles } from "@/app/shop/_components/data";

// Public storefront sitemap (WS2.2): static landing pages + blog articles.
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

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
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
  ];
}
