import { NextResponse } from "next/server";

// no-store: load balancers and CDNs must probe the live process, never a cached copy.
export function GET() {
  return NextResponse.json(
    { status: "ok", uptimeSeconds: Math.floor(process.uptime()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
