-- E-invoice (T-VAN) — Vietnamese hóa đơn điện tử.
-- Reversible: drop enums last so other tables that may reference them are
-- gone first. orderId has onDelete Restrict to keep tax records; cancel by
-- status transition, not by delete.
-- NOTE: schema.prisma carries the model definitions; this file is the SQL
-- counterpart (hand-written, see the drift guard in CI). Re-run with
-- `npx prisma migrate deploy` after the schema change is merged.

-- ── 1. Enums ────────────────────────────────────────────────────────────────
CREATE TYPE "EInvoiceProvider" AS ENUM ('VNPT', 'VIETTEL', 'MISA', 'VN_EINVOICE');
CREATE TYPE "EInvoiceStatus"   AS ENUM ('DRAFT', 'PENDING', 'SENDING', 'ISSUED', 'CANCELED', 'ERROR');

-- ── 2. EInvoice ─────────────────────────────────────────────────────────────
CREATE TABLE "EInvoice" (
  "id"              TEXT PRIMARY KEY,
  "orgId"           TEXT NOT NULL,
  "storeId"         TEXT,
  "orderId"         TEXT NOT NULL,
  "orderKind"       TEXT NOT NULL,
  "invoiceNumber"   TEXT,
  "templateCode"    TEXT NOT NULL,
  "provider"        "EInvoiceProvider" NOT NULL,
  "status"          "EInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "customerName"    TEXT NOT NULL,
  "customerTaxCode" TEXT,
  "customerEmail"   TEXT,
  "customerAddress" TEXT,
  "subtotal"        BIGINT NOT NULL,
  "tax"             BIGINT NOT NULL DEFAULT 0,
  "total"           BIGINT NOT NULL,
  "signedXmlUrl"    TEXT,
  "pdfUrl"          TEXT,
  "rawResponse"     JSONB,
  "errorMessage"    TEXT,
  "nextPollAt"      TIMESTAMP(3),
  "pollAttempts"    INTEGER NOT NULL DEFAULT 0,
  "issuedAt"        TIMESTAMP(3),
  "canceledAt"      TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EInvoice_invoiceNumber_key" UNIQUE ("invoiceNumber"),
  CONSTRAINT "EInvoice_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EInvoice_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "EInvoice_orgId_status_idx"     ON "EInvoice"("orgId", "status");
CREATE INDEX "EInvoice_orderId_idx"          ON "EInvoice"("orderId");
CREATE INDEX "EInvoice_status_nextPollAt_idx" ON "EInvoice"("status", "nextPollAt");

-- ── 3. EInvoiceAttempt ──────────────────────────────────────────────────────
CREATE TABLE "EInvoiceAttempt" (
  "id"              TEXT PRIMARY KEY,
  "einvoiceId"      TEXT NOT NULL,
  "phase"           TEXT NOT NULL,
  "status"          TEXT NOT NULL,
  "requestPayload"  JSONB,
  "responsePayload" JSONB,
  "errorMessage"    TEXT,
  "startedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"      TIMESTAMP(3),
  CONSTRAINT "EInvoiceAttempt_einvoiceId_fkey"
    FOREIGN KEY ("einvoiceId") REFERENCES "EInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EInvoiceAttempt_einvoiceId_startedAt_idx" ON "EInvoiceAttempt"("einvoiceId", "startedAt");
