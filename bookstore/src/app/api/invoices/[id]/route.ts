import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";

/** GET /api/invoices/[id] — invoice + recent attempts. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("invoices.read");
    const { id } = await ctx.params;
    const row = await prisma.eInvoice.findUnique({
      where: { id },
      include: { attempts: { orderBy: { startedAt: "desc" }, take: 10 } },
    });
    if (!row) fail(404, "NOT_FOUND", "Invoice not found");
    return ok(row);
  } catch (e) { return apiError(e); }
}
