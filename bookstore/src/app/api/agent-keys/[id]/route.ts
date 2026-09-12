import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { withOrg } from "@/lib/org-scope";
import { apiError } from "@/lib/api";
import { verifyAgentChain, currentDay } from "@/lib/agent-auth";

// GET /api/agent-keys/[id] — key detail + chain verification status.
// POST /api/agent-keys/[id] { action: "revoke" } — instant revocation.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("admin.users");
    const { id } = await ctx.params;
    const key = await prisma.agentKey.findFirst({
      where: withOrg(auth, { id }),
      select: {
        id: true, label: true, quotaPerMin: true, status: true,
        lastUsedAt: true, createdAt: true,
        _count: { select: { events: true } },
      },
    });
    if (!key) return NextResponse.json({ code: "NOT_FOUND", message: "Key not found" }, { status: 404 });
    const chain = await verifyAgentChain(key.id, currentDay());
    return NextResponse.json({ key, chainToday: chain });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("admin.users");
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "revoke")
      throw Object.assign(new Error("Unknown action"), { status: 400, code: "VALIDATION" });
    const owned = await prisma.agentKey.findFirst({
      where: withOrg(auth, { id }),
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ code: "NOT_FOUND", message: "Key not found" }, { status: 404 });
    await prisma.agentKey.update({ where: { id }, data: { status: "REVOKED" } });
    return NextResponse.json({ id, status: "REVOKED" });
  } catch (e) {
    return apiError(e);
  }
}
