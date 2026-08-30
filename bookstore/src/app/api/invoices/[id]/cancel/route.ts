import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { withOrg } from "@/lib/org-scope";
import { apiError, ok, fail } from "@/lib/api";
import { adapterFor, loadProviderConfig, recordAttempt } from "@/lib/einvoice";

/**
 * POST /api/invoices/[id]/cancel — cancel an issued e-invoice. Only allowed
 * for rows already ISSUED; sends the cancel to the provider, records an
 * attempt, and flips the row to CANCELED on success.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("invoices.cancel");
    const { id } = await ctx.params;
    // Org-scoped (audit 2026-08-30 SEC-003): cancelling another org's fiscal
    // document must 404 here, not proceed.
    const row = await prisma.eInvoice.findFirst({ where: withOrg(auth, { id }) });
    if (!row) fail(404, "NOT_FOUND", "Invoice not found");
    if (row.status !== "ISSUED") fail(409, "VALIDATION", "Only ISSUED invoices can be canceled");

    const providerInvoiceId = (row.rawResponse as { _providerInvoiceId?: string } | null)?._providerInvoiceId;
    if (!providerInvoiceId) fail(409, "VALIDATION", "Missing provider invoice id; cannot cancel");

    const started = new Date();
    try {
      const cfg = await loadProviderConfig(row.provider);
      const out = await adapterFor(row.provider).cancel(providerInvoiceId, cfg);
      await recordAttempt({
        einvoiceId: row.id, phase: "CANCEL", status: "OK",
        requestPayload: { providerInvoiceId }, responsePayload: out.raw as object,
        startedAt: started, finishedAt: new Date(),
      });
      const updated = await prisma.eInvoice.update({
        where: { id: row.id },
        data: { status: "CANCELED", canceledAt: new Date() },
      });
      return ok(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await recordAttempt({
        einvoiceId: row.id, phase: "CANCEL", status: "ERROR", errorMessage: msg,
        startedAt: started, finishedAt: new Date(),
      });
      fail(502, "VALIDATION", "Provider cancel failed", { provider: row.provider, message: msg });
    }
  } catch (e) { return apiError(e); }
}
