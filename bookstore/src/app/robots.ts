import type { MetadataRoute } from "next";

// Agentic Web: crawlers/AI browsers được phép đọc storefront công khai,
// nhưng khu vực vận hành (staff/admin) luôn bị chặn.
// (audit Q159) Non-prod origins return a blanket Disallow so staging
// never leaks into Google — prod allowlist below only applies when
// APP_ORIGIN is the production domain or unset (local dev default).
const PROD_ORIGIN = "https://melio.vn";

export default function robots(): MetadataRoute.Robots {
  const origin = (process.env.APP_ORIGIN || "").replace(/\/$/, "");
  if (origin && origin !== PROD_ORIGIN) {
    return { rules: [{ userAgent: "*", disallow: ["/"] }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/shop", "/shop/p/", "/llms.txt", "/.well-known/agent"],
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
