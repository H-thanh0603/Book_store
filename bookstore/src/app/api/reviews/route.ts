import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/api";

// GET /api/reviews?status=PENDING — staff moderation queue (product.update).
export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("product.update");
    const status = req.nextUrl.searchParams.get("status") ?? "PENDING";
    if (!["PENDING", "APPROVED", "REJECTED"].includes(status))
      throw Object.assign(new Error("Invalid status"), { status: 400, code: "VALIDATION" });
    const rows = await prisma.productReview.findMany({
      where: {
        status,
        product: auth.orgId ? { orgId: auth.orgId } : {},
      },
      include: { product: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ reviews: rows });
  } catch (e) {
    return apiError(e);
  }
}

// POST /api/reviews { id, action: "approve" | "reject" }
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("product.update");
    const body = (await req.json().catch(() => ({}))) as { id?: string; action?: string };
    if (!body.id || !["approve", "reject"].includes(body.action ?? ""))
      throw Object.assign(new Error("id and action (approve|reject) are required"), { status: 400, code: "VALIDATION" });
    const owned = await prisma.productReview.findFirst({
      where: {
        id: body.id,
        product: auth.orgId ? { orgId: auth.orgId } : {},
      },
      select: { id: true },
    });
    if (!owned)
      throw Object.assign(new Error("Review not found"), { status: 404, code: "NOT_FOUND" });
    const updated = await prisma.productReview.update({
      where: { id: owned.id },
      data: { status: body.action === "approve" ? "APPROVED" : "REJECTED" },
      select: { id: true, status: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
