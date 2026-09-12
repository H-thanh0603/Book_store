import { NextRequest, NextResponse } from "next/server";
import { buildAgentManifest } from "@/lib/agent";

// Machine-readable Agent manifest: /.well-known/agent
// Cacheable công khai (không chứa dữ liệu user), CDN 5 phút.
export function GET(req: NextRequest) {
  const manifest = buildAgentManifest(req.nextUrl.origin);
  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=300",
    },
  });
}
