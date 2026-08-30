-- EInvoice.idempotency made real (audit 2026-08-30 EINV-001): the schema
-- comment claimed idempotency by orderId but nothing enforced it — two
-- concurrent paid events could create two DRAFT rows and issue two tax
-- invoices for one sale. Replaces the plain orderId index with a unique one.
DROP INDEX IF EXISTS "EInvoice_orderId_idx";
CREATE UNIQUE INDEX "EInvoice_orderId_key" ON "EInvoice"("orderId");
