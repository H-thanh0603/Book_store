// GET /api/support/conversations/[id]/messages - poll for new messages
// since ?since=<ISO>. Staff-side.
// POST /api/support/conversations/[id]/messages - staff reply. Body
// { body }. Sets conversation.status = ESCALATED if it was OPEN.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { withOrg } from "@/lib/org-scope";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const auth = await requirePermission("settings.read");
    if (!auth.orgId) return NextResponse.json([]);
    const since = req.nextUrl.searchParams.get("since");
    const conversation = await prisma.supportConversation.findFirst({ where: withOrg(auth, { id }) });
    if (!conversation) return ok({ code: "NOT_FOUND", message: "conversation not found" }, 404);
    const messages = await prisma.supportMessage.findMany({
      where: { conversationId: id, ...(since ? { createdAt: { gt: new Date(since) } } : {}) },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ messages, lastMessageAt: conversation.lastMessageAt });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const auth = await requirePermission("settings.write");
    if (!auth.orgId) return ok({ code: "VALIDATION", message: "caller has no org" }, 400);
    const body = (await req.json().catch(() => ({}))) as { body?: string };
    const text = (body.body ?? "").trim();
    if (!text) return ok({ code: "VALIDATION", message: "body is required" }, 400);
    const conversation = await prisma.supportConversation.findFirst({ where: withOrg(auth, { id }) });
    if (!conversation) return ok({ code: "NOT_FOUND", message: "conversation not found" }, 404);
    const now = new Date();
    await prisma.$transaction([
      prisma.supportMessage.create({ data: { conversationId: id, kind: "STAFF", body: text } }),
      prisma.supportConversation.update({
        where: { id },
        data: { lastMessageAt: now, status: conversation.status === "CLOSED" ? "CLOSED" : "ESCALATED" },
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
