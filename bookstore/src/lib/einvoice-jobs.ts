// E-invoice background workers. Two responsibilities:
//   - einvoice.issue: pick up DRAFT rows and send them to the provider.
//   - einvoice.poll:  poll PENDING/SENDING rows until ISSUED or terminal ERROR.
//
// The actual issue + query logic lives in einvoice.ts (adapters). This file
// only orchestrates batches + backoff. JobRun is the same ledger the rest of
// the system uses, so failures are visible at /api/jobs and /api/reports.

import { prisma } from "./db";
import {
  adapterFor, loadProviderConfig, recordAttempt, transitionToPending,
  type EInvoiceInput, type ProviderConfig,
} from "./einvoice";

// Backoff ladder in milliseconds. 5s → 15s → 1m → 5m → 15m → 1h, then ERROR.
const POLL_BACKOFF_MS = [5_000, 15_000, 60_000, 300_000, 900_000, 3_600_000];
const MAX_POLL_ATTEMPTS = POLL_BACKOFF_MS.length;

const BATCH_SIZE = 20;

async function buildInput(einvoiceId: string, orderKind: "POS" | "WEB", templateCode: string): Promise<EInvoiceInput> {
  const row = await prisma.eInvoice.findUniqueOrThrow({ where: { id: einvoiceId } });
  if (orderKind === "POS") {
    const id = row.orderId.startsWith("POS:") ? row.orderId.slice(4) : row.orderId;
    const txn = await prisma.posTransaction.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });
    return {
      id: row.id, orderId: row.orderId, orderKind, templateCode,
      customerName: row.customerName, customerTaxCode: row.customerTaxCode,
      customerEmail: row.customerEmail, customerAddress: row.customerAddress,
      subtotal: row.subtotal, tax: row.tax, total: row.total,
      lines: txn.items.map((it) => ({
        name: it.variant.product.name, quantity: it.quantity,
        unitPrice: it.unitPrice, total: it.unitPrice * BigInt(it.quantity),
      })),
    };
  }
  // WEB path: orderId is the Order.id directly.
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: row.orderId },
    include: { items: { include: { variant: { include: { product: true } } } } },
  });
  return {
    id: row.id, orderId: row.orderId, orderKind, templateCode,
    customerName: row.customerName, customerTaxCode: row.customerTaxCode,
    customerEmail: row.customerEmail, customerAddress: row.customerAddress,
    subtotal: row.subtotal, tax: row.tax, total: row.total,
    lines: order.items.map((it) => ({
      name: it.variant.product.name, quantity: it.quantity,
      unitPrice: it.unitPrice, total: it.unitPrice * BigInt(it.quantity),
    })),
  };
}

/** Send a DRAFT row to the provider. Mark SENDING → record attempt → leave row in PENDING for poll. */
export async function issuePendingInvoices() {
  const batch = await prisma.eInvoice.findMany({
    where: { status: "DRAFT" }, take: BATCH_SIZE, orderBy: { createdAt: "asc" },
  });
  let succeeded = 0, failed = 0;
  for (const row of batch) {
    const started = new Date();
    await prisma.eInvoice.update({ where: { id: row.id }, data: { status: "SENDING" } });
    try {
      const cfg: ProviderConfig = await loadProviderConfig(row.provider);
      const adapter = adapterFor(row.provider);
      const input = await buildInput(row.id, row.orderKind as "POS" | "WEB", row.templateCode || cfg.templateCode);
      const out = await adapter.issue(input, cfg);
      await recordAttempt({
        einvoiceId: row.id, phase: "ISSUE", status: "OK",
        requestPayload: { provider: row.provider, externalId: row.id, total: row.total.toString() },
        responsePayload: out.raw as object,
        startedAt: started, finishedAt: new Date(),
      });
      // Store the provider ticket id on the raw response field (EInvoice has no
      // dedicated column yet — keeps the schema diff small for phase A1).
      await prisma.eInvoice.update({
        where: { id: row.id },
        data: {
          status: "PENDING",
          nextPollAt: new Date(Date.now() + POLL_BACKOFF_MS[0]),
          rawResponse: { ...(out.raw as object), _providerInvoiceId: out.providerInvoiceId },
        },
      });
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await recordAttempt({
        einvoiceId: row.id, phase: "ISSUE", status: "ERROR", errorMessage: msg,
        startedAt: started, finishedAt: new Date(),
      });
      await prisma.eInvoice.update({
        where: { id: row.id },
        data: { status: "ERROR", errorMessage: msg },
      });
      failed++;
    }
  }
  return { processed: batch.length, succeeded, failed };
}

/** Poll rows due for a status check. ISSUED → terminal; REJECTED → ERROR; PENDING → reschedule. */
export async function pollPendingInvoices() {
  const batch = await prisma.eInvoice.findMany({
    where: { status: "PENDING", nextPollAt: { lte: new Date() } },
    take: BATCH_SIZE, orderBy: { nextPollAt: "asc" },
  });
  let issued = 0, stillPending = 0, errored = 0;
  for (const row of batch) {
    const started = new Date();
    const providerInvoiceId = (row.rawResponse as { _providerInvoiceId?: string } | null)?._providerInvoiceId;
    if (!providerInvoiceId) {
      // No ticket id → push back to DRAFT for the next issue pass.
      await prisma.eInvoice.update({
        where: { id: row.id }, data: { status: "DRAFT", nextPollAt: null, errorMessage: "missing providerInvoiceId" },
      });
      continue;
    }
    try {
      const cfg = await loadProviderConfig(row.provider);
      const adapter = adapterFor(row.provider);
      const r = await adapter.query(providerInvoiceId, cfg);
      await recordAttempt({
        einvoiceId: row.id, phase: "POLL", status: "OK",
        requestPayload: { providerInvoiceId },
        responsePayload: r.raw as object,
        startedAt: started, finishedAt: new Date(),
      });
      if (r.status === "ISSUED") {
        await prisma.eInvoice.update({
          where: { id: row.id },
          data: {
            status: "ISSUED", invoiceNumber: r.invoiceNumber,
            signedXmlUrl: r.signedXmlUrl, pdfUrl: r.pdfUrl,
            issuedAt: new Date(), nextPollAt: null, errorMessage: null, pollAttempts: row.pollAttempts + 1,
          },
        });
        issued++;
      } else if (r.status === "REJECTED") {
        await prisma.eInvoice.update({
          where: { id: row.id },
          data: { status: "ERROR", errorMessage: r.error, nextPollAt: null, pollAttempts: row.pollAttempts + 1 },
        });
        errored++;
      } else {
        const next = row.pollAttempts + 1;
        if (next >= MAX_POLL_ATTEMPTS) {
          await prisma.eInvoice.update({
            where: { id: row.id },
            data: { status: "ERROR", errorMessage: "poll attempts exhausted", pollAttempts: next, nextPollAt: null },
          });
          errored++;
        } else {
          await transitionToPending(row.id, next);
          await prisma.eInvoice.update({ where: { id: row.id }, data: { pollAttempts: next } });
          stillPending++;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await recordAttempt({
        einvoiceId: row.id, phase: "POLL", status: "ERROR", errorMessage: msg,
        startedAt: started, finishedAt: new Date(),
      });
      const next = row.pollAttempts + 1;
      if (next >= MAX_POLL_ATTEMPTS) {
        await prisma.eInvoice.update({ where: { id: row.id }, data: { status: "ERROR", errorMessage: msg, pollAttempts: next, nextPollAt: null } });
        errored++;
      } else {
        await transitionToPending(row.id, next);
        await prisma.eInvoice.update({ where: { id: row.id }, data: { pollAttempts: next } });
        stillPending++;
      }
    }
  }
  return { processed: batch.length, issued, stillPending, errored };
}
