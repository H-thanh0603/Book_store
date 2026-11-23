import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { requireOrgId } from "@/lib/org-scope";
import { apiError } from "@/lib/api";
import { verifyAgentChain, currentDay } from "@/lib/agent-auth";

// GET /api/agent-events/verify?keyId=&day= — A2: recompute a hash chain.
// Staff-only and strictly org-scoped: callers may only verify keys owned by
// their own organization (never anonymous global chains or other tenants' keys).
export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("admin.users");
    const orgId = requireOrgId(auth);
    const sp = req.nextUrl.searchParams;
    const keyId = sp.get("keyId");
    const day = sp.get("day") ?? currentDay();
    if (!keyId)
      throw Object.assign(new Error("keyId is required"), { status: 400, code: "VALIDATION" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
      throw Object.assign(new Error("day must be YYYY-MM-DD"), { status: 400, code: "VALIDATION" });
    const key = await prisma.agentKey.findFirst({
      where: { id: keyId, orgId },
      select: { id: true, label: true },
    });
    if (!key) return NextResponse.json({ code: "NOT_FOUND", message: "Key not found" }, { status: 404 });
    const verdict = await verifyAgentChain(keyId, day);
    return NextResponse.json({ keyId, day, ...verdict });
  } catch (e) {
    return apiError(e);
  }
}
