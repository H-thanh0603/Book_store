// GET /api/billing/invoices - list BillingInvoice rows for the caller's
// org, newest first. Returns the joined plan so the UI can show
// "PRO / 499k VND" without a second round-trip.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/api";

export async function GET() {
  try {
    const auth = await requirePermission("settings.read");
    if (!auth.orgId) return NextResponse.json([]);
    const rows = await prisma.billingInvoice.findMany({
      where: { orgId: auth.orgId },
      orderBy: { issuedAt: "desc" },
      take: 50,
      include: { plan: { select: { code: true, name: true } } },
    });
    return NextResponse.json(rows.map((r) => ({
      id: r.id,
      planCode: r.plan.code,
      planName: r.plan.name,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      amount: Number(r.amount),
      status: r.status,
      issuedAt: r.issuedAt,
      paidAt: r.paidAt,
    })));
  } catch (err) {
    return apiError(err);
  }
}
