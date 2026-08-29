// GET /api/support/conversations - list conversations for the caller's
// org. Staff-side only (the in-app widget is on staff pages). Status
// filter via ?status=OPEN|ESCALATED|CLOSED.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { withOrg } from "@/lib/org-scope";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.read");
    if (!auth.orgId) return NextResponse.json([]);
    const status = req.nextUrl.searchParams.get("status");
    const conversations = await prisma.supportConversation.findMany({
      where: withOrg(auth, status ? { status } : {}),
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      include: { customer: { select: { name: true, phone: true } } },
    });
    return NextResponse.json(conversations.map((c) => ({
      id: c.id,
      subject: c.subject,
      status: c.status,
      lastMessageAt: c.lastMessageAt,
      customerName: c.customer.name,
      customerPhone: c.customer.phone,
    })));
  } catch (err) {
    return apiError(err);
  }
}
