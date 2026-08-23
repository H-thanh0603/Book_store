import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", uptimeSeconds: Math.floor(process.uptime()) });
}
