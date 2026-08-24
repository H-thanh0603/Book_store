import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// no-store: readiness must reflect the instance that answered the probe — a cached
// 200 would keep a broken instance in rotation (and a cached 503 would drain it).
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ready", database: "ok", latencyMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "not_ready", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
