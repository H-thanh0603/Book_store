// Unified Next.js proxy — merges CSRF, session-guard, origin-check, and
// request-id injection. Next.js 16.3.2 requires proxy.ts over middleware.ts.
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "bs_session";
const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const PUBLIC_PATHS = [
  "/api/auth",
  "/api/storefront",
  "/api/concierge",
  "/api/health",
  "/api/payments/vnpay",
  "/api/integrations/webhook",
];

const PUBLIC_PAGE_PREFIXES = [
  "/login",
  "/signup",
  "/shop",
  "/deals",
  "/bestsellers",
  "/toys",
  "/back-to-school",
  "/gift-finder",
  "/reading-challenge",
  "/stores",
  "/track",
  "/bookshelf",
  "/api/health",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return true;
  return false;
}

function validateCsrf(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return true;

  const csrfHeader = req.headers.get("x-csrf-check");
  if (csrfHeader === "1") return true;

  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) {
      return false;
    }
  }

  return true;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip static assets, Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
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

  // Origin check for API mutations (from original proxy.ts)
  if (pathname.startsWith("/api/") && MUTATIONS.has(req.method)) {
    const origin = req.headers.get("origin");
    const host = process.env.APP_ORIGIN
      ? new URL(process.env.APP_ORIGIN).host
      : req.nextUrl.host;
    if (origin) {
      let originHost = "";
      try { originHost = new URL(origin).host; } catch { /* rejected below */ }
      if (!host || originHost !== host) {
        return NextResponse.json(
          { code: "FORBIDDEN", message: "Invalid request origin" },
          { status: 403 }
        );
      }
    }
  }

  // Public paths pass through
  if (isPublicPath(pathname)) {
    const requestId = crypto.randomUUID();
    const headers = new Headers(req.headers);
    headers.set("x-request-id", requestId);
    if (pathname.startsWith("/api/")) console.info(JSON.stringify({
      level: "info", event: "request", requestId, method: req.method, path: pathname,
    }));
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  // API routes: require session cookie
  if (pathname.startsWith("/api/")) {
    const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
  }

  // Page routes: redirect to /login if no session
  if (!pathname.startsWith("/api/")) {
    const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
    if (!sessionToken && pathname !== "/login") {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Inject request-id and log
  const requestId = crypto.randomUUID();
  const headers = new Headers(req.headers);
  headers.set("x-request-id", requestId);
  if (pathname.startsWith("/api/")) console.info(JSON.stringify({
    level: "info", event: "request", requestId, method: req.method, path: pathname,
  }));
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
