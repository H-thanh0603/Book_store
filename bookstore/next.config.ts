import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // camera=(self): POS barcode scanner needs getUserMedia on same origin (audit FE).
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            // Fonts are self-hosted via next/font, so nothing outside 'self' is needed.
            // 'unsafe-inline' on script/style covers the Next.js inline bootstrap;
            // tightening further requires per-request nonces through the app router.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js dev runtime uses eval() to reconstruct server-side error
              // stacks in the browser. Required in development only.
              // Per Next 16 docs: "unsafe-eval is not required for production."
              "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""),
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
      {
        // /bookshelf mounts a Three.js scene inside an iframe loaded from
        // /bookshelf.html. The reference bundle uses an importmap to fetch
        // three@0.165.0 from unpkg and relies on `eval`-shaped code paths
        // inside three/examples/jsm. The rest of the app keeps the strict
        // CSP; this rule only loosens directives for the bookshelf surface.
        source: "/bookshelf(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' https://cdn.jsdelivr.net",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "frame-ancestors 'self'",
              "base-uri 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
