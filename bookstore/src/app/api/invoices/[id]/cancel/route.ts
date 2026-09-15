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
 *
 * P0-7: the old flow verified ISSUED, called the provider, then updated
 * unconditionally — two concurrent cancels both hit the provider (double
 * cancel at T-VAN) and wrote duplicate attempts. The row is now locked
 * (SELECT FOR UPDATE) inside a transaction: the loser waits, re-reads
 * CANCELED, and aborts BEFORE touching the provider. Holding the tx across
 * the provider call is deliberate here — cancels are rare, human-driven,
 * and correctness beats connection-hold time.
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

    return await prisma.$transaction(async (tx) => {
      // Serialize concurrent cancels on this row.
      await tx.$queryRaw`SELECT id FROM "EInvoice" WHERE id = ${row.id} FOR UPDATE`;
      const locked = await tx.eInvoice.findUnique({ where: { id: row.id } });
      if (!locked) fail(404, "NOT_FOUND", "Invoice not found");
      if (locked.status !== "ISSUED")
        fail(409, "VALIDATION", `Invoice is ${locked.status} — already canceled or updated`);

      const started = new Date();
      try {
        const cfg = await loadProviderConfig(locked.provider);
        const out = await adapterFor(locked.provider).cancel(providerInvoiceId, cfg);
        await recordAttempt({
          einvoiceId: locked.id, phase: "CANCEL", status: "OK",
          requestPayload: { providerInvoiceId }, responsePayload: out.raw as object,
          startedAt: started, finishedAt: new Date(),
        });
        const updated = await tx.eInvoice.updateMany({
          where: { id: locked.id, status: "ISSUED" },
          data: { status: "CANCELED", canceledAt: new Date() },
        });
        if (updated.count !== 1) fail(409, "VALIDATION", "Invoice was already updated");
        return ok(await tx.eInvoice.findUniqueOrThrow({ where: { id: locked.id } }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await recordAttempt({
          einvoiceId: locked.id, phase: "CANCEL", status: "ERROR", errorMessage: msg,
          startedAt: started, finishedAt: new Date(),
        });
        fail(502, "VALIDATION", "Provider cancel failed", { provider: locked.provider, message: msg });
      }
    });
  } catch (e) { return apiError(e); }
}
