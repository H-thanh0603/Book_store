// POST /api/support/conversations/[id]/close - mark CLOSED.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { withOrg } from "@/lib/org-scope";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const auth = await requirePermission("settings.write");
    if (!auth.orgId) return ok({ code: "VALIDATION", message: "caller has no org" }, 400);
    const conversation = await prisma.supportConversation.findFirst({ where: withOrg(auth, { id }) });
    if (!conversation) return ok({ code: "NOT_FOUND", message: "conversation not found" }, 404);
    await prisma.supportConversation.update({ where: { id }, data: { status: "CLOSED" } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
