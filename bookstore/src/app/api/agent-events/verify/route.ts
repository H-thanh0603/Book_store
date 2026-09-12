import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { verifyAgentChain, currentDay } from "@/lib/agent-auth";

// GET /api/agent-events/verify?keyId=&day= — A2: recompute a hash chain.
// Staff-only: the underlying events reveal per-key traffic patterns.
// Response is independently re-checkable: every link is
// sha256(prevHash + canonical{day,status,tool,at}) and any edit/deletion
// breaks the chain exactly at the tampered event (brokenAt).
export async function GET(req: NextRequest) {
  try {
    await requirePermission("admin.users");
    const sp = req.nextUrl.searchParams;
    const keyId = sp.get("keyId");
    const day = sp.get("day") ?? currentDay();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
      throw Object.assign(new Error("day must be YYYY-MM-DD"), { status: 400, code: "VALIDATION" });
    if (keyId) {
      const key = await prisma.agentKey.findUnique({ where: { id: keyId }, select: { id: true, label: true } });
      if (!key) return NextResponse.json({ code: "NOT_FOUND", message: "Key not found" }, { status: 404 });
    }
    const verdict = await verifyAgentChain(keyId, day);
    return NextResponse.json({ keyId, day, ...verdict });
  } catch (e) {
    return apiError(e);
  }
}
