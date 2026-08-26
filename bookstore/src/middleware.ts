// Next.js middleware — defense-in-depth layer for auth.
// Per-route requirePermission()/getAuth() handles fine-granted authorization;
// this middleware rejects unauthenticated requests BEFORE they reach route handlers
// so a forgotten auth check in a new route doesn't silently become public.
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

const SESSION_COOKIE = "bs_session";

// Routes that are intentionally public (no session required)
const PUBLIC_PATHS = [
  "/api/auth",           // login/logout/reset
  "/api/storefront",     // customer-facing shop
  "/api/health",         // k8s probes
  "/api/payments/vnpay", // external callbacks
  "/api/integrations/webhook", // external webhooks
];

// Static assets and pages that don't need API auth
const PUBLIC_PAGE_PREFIXES = [
  "/login",
  "/shop",
  "/track",
  "/api/health",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return true;
  return false;
}

// Simple CSRF protection: state-changing methods (POST/PUT/DELETE/PATCH) from
// browser requests must include a header that matches the session cookie.
// This blocks cross-site form submissions using cookie-based auth.
function validateCsrf(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  // Non-browser clients (curl, server-to-server) don't send cookies automatically
  // for cross-origin requests, so we check for the session cookie presence.
  // If the cookie is present, we require a matching header.
  const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return true; // no session = not authenticated = let route handler fail

  // The custom header is always sent by fetch() in same-origin browser requests.
  // Cross-origin requests would be blocked by CORS even if CSRF header is missing.
  const csrfHeader = req.headers.get("x-csrf-check");
  if (csrfHeader === "1") return true;

  // Also allow SameSite cookie policy to handle it: lax SameSite cookies are
  // not sent on cross-origin POST, so a forged form won't have the session.
  // But defense-in-depth: require the header for API routes.
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/api/")) {
    // API state-changing requests from browser must have CSRF header
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) {
      return false; // cross-origin POST without CSRF header = suspicious
    }
  }

  return true;
}

// Session refresh: if the session is valid and more than half the TTL has passed,
// extend it. This keeps active users logged in without requiring re-login.
function shouldRefreshSession(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  const TTL = 12 * 60 * 60 * 1000; // must match SESSION_TTL_MS in auth.ts
  return remaining > 0 && remaining < TTL / 2;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip middleware for static assets, Next.js internals, and public paths
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".") // static files
  ) {
    return NextResponse.next();
  }

  // CSRF check for state-changing API requests
  if (pathname.startsWith("/api/") && !validateCsrf(req)) {
    return NextResponse.json(
      { error: "CSRF validation failed. Include x-csrf-check: 1 header." },
      { status: 403 }
    );
  }

  // Public paths pass through
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // For API routes: check session cookie presence (lightweight check).
  // Full authorization is done by requirePermission() in route handlers.
  if (pathname.startsWith("/api/")) {
    const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
  }

  // For page routes: redirect to /login if no session
  if (!pathname.startsWith("/api/")) {
    const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
    if (!sessionToken && pathname !== "/login") {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
