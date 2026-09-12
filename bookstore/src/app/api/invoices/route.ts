import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { withOrg } from "@/lib/org-scope";
import { apiError, ok, optStr, optDate, optPage } from "@/lib/api";

/**
 * GET /api/invoices — list e-invoices. Owner/manager view.
 * Optional filters: orderId, status, from, to (createdAt range).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("invoices.read");
    const url = req.nextUrl;
    const orderId = optStr(url.searchParams.get("orderId"), "orderId");
    const status = optStr(url.searchParams.get("status"), "status");
    const from = optDate(url.searchParams.get("from"), "from");
    const to = optDate(url.searchParams.get("to"), "to");

    const where = {
      ...withOrg(auth),
      ...(orderId ? { orderId } : {}),
      ...(status ? { status: status as never } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
    const { page, pageSize, skip } = optPage(url.searchParams);
    const [rows, total] = await Promise.all([
      prisma.eInvoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip, take: pageSize,
      }),
      prisma.eInvoice.count({ where }),
    ]);
    return ok({ rows, page, pageSize, total });
  } catch (e) { return apiError(e); }
}
