import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            // Fonts are self-hosted via next/font, so nothing outside 'self' is needed.
            // 'unsafe-inline' on script/style covers the Next.js inline bootstrap;
            // tightening further requires per-request nonces through the app router.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      {
        // Files from /public (served at the root) have no content hash — cache them
        // briefly at the edge and revalidate. Long enough to absorb traffic spikes,
        // short enough that an icon swap propagates within minutes.
        // Note: /_next/static already ships `immutable` from Next itself — do NOT
        // re-declare it here; custom Cache-Control under /_next/* breaks dev HMR.
        source: "/:file.(svg|png|jpg|jpeg|webp|ico|woff2)",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
