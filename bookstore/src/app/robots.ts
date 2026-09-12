import type { MetadataRoute } from "next";

// Agentic Web: crawlers/AI browsers được phép đọc storefront công khai,
// nhưng khu vực vận hành (staff/admin) luôn bị chặn.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/shop", "/llms.txt", "/.well-known/agent"],
        disallow: [
          "/pos",
          "/dashboard",
          "/inventory",
          "/orders",
          "/customers",
          "/purchase-orders",
          "/transfers",
          "/audit-logs",
          "/settings",
          "/api/",
        ],
      },
    ],
  };
}
