import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { withOrg } from "@/lib/org-scope";
import { apiError, ok, fail } from "@/lib/api";

/** GET /api/invoices/[id] — invoice + recent attempts. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("invoices.read");
    const { id } = await ctx.params;
    // Org-scoped (audit 2026-08-30 SEC-003): e-invoices carry another org's
    // customer names/addresses/tax codes.
    const row = await prisma.eInvoice.findFirst({
      where: withOrg(auth, { id }),
      include: { attempts: { orderBy: { startedAt: "desc" }, take: 10 } },
    });
    if (!row) fail(404, "NOT_FOUND", "Invoice not found");
    return ok(row);
  } catch (e) { return apiError(e); }
}
