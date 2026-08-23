import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ready", database: "ok", latencyMs: Date.now() - startedAt });
  } catch {
    return NextResponse.json({ status: "not_ready", database: "unavailable" }, { status: 503 });
  }
}
