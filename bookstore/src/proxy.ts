import { NextRequest, NextResponse } from "next/server";

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const origin = request.headers.get("origin");
  const host = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).host : request.nextUrl.host;
  if (request.nextUrl.pathname.startsWith("/api/") && MUTATIONS.has(request.method) && origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { /* rejected below */ }
    if (!host || originHost !== host)
      return NextResponse.json({ code: "FORBIDDEN", message: "Invalid request origin" }, { status: 403 });
  }
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  if (request.nextUrl.pathname.startsWith("/api/")) console.info(JSON.stringify({
    level: "info", event: "request", requestId, method: request.method, path: request.nextUrl.pathname,
  }));
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
