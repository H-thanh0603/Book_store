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
  "/api/mcp", // A3: agent discovery + tools are public (keyed quota inside)
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

async function validateCsrf(req: NextRequest): Promise<boolean> {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return true;

  // Per-session token bound to the session cookie (lib/csrf.ts). The legacy
  // static "1" is rejected: every staff client sends the same value, so it
  // proves nothing about the caller's session. Fail closed — a staff mutation
  // without a valid token is rejected even with a matching origin.
  const { verifyCsrfToken } = await import("./lib/csrf");
  return verifyCsrfToken(sessionCookie, req.headers.get("x-csrf-check"));
}

export async function proxy(req: NextRequest) {
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
  if (pathname.startsWith("/api/") && !(await validateCsrf(req))) {
    return NextResponse.json(
      { error: "CSRF validation failed. Refresh the page and retry." },
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

  // Root decides by session: guests are sent to /shop, staff see the
  // workspace (see src/app/page.tsx). Let it through so guests land on
  // the storefront instead of bouncing to /login.
  if (pathname === "/" || isPublicPath(pathname)) {    const requestId = crypto.randomUUID();
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
