// Edge middleware: cookie-presence gate only. Real authn/authz happens in
// the route handlers via requireAuth/requirePermission (those run on the
// Node runtime where Prisma is available). The middleware exists so
// unauthenticated users hit /login fast without a server-side DB round
// trip, and so the marketing pages stay public without a per-request
// session lookup cost.
//
// ponytail: cookie check is best-effort -- flipping it to a real session
// lookup needs Prisma in edge runtime, which is its own migration.

import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "bs_session";

// Public paths that don't need a session. Anything else under /app, /pos,
// /dashboard, /orders, /inventory, /promotions, /reports, /invoices,
// /settings, /customers, /purchase-orders, /purchasing is considered
// private. Update the regexes if a new top-level app section lands.
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/api/auth",
  "/shop",
  "/api/storefront",
  "/api/webhooks/inbox",
  "/api/payments/vnpay/ipn",
  "/api/payments/momo/ipn",
  "/api/payments/zalopay/ipn",
  "/_next",
  "/favicon.ico",
  "/manifest.json",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (!session) {
    // API callers get a 401 JSON; HTML callers get a redirect to /login.
    if (pathname.startsWith("/api/")) {
      return new NextResponse(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
