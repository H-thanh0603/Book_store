-- Per-cycle subscription invoice. One per (org, period). PENDING
-- until the linked WebPayment settles, then PAID. Daily cron suspends
-- orgs whose latest invoice is still PENDING 3 days past periodEnd.
CREATE TABLE "BillingInvoice" (
  "id"             TEXT PRIMARY KEY,
  "orgId"          TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "planId"         TEXT NOT NULL,
  "periodStart"    TIMESTAMP NOT NULL,
  "periodEnd"      TIMESTAMP NOT NULL,
  "amount"         BIGINT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'PENDING',
  "webPaymentId"   TEXT,
  "issuedAt"       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt"         TIMESTAMP,
  UNIQUE ("webPaymentId")
);
CREATE INDEX "BillingInvoice_orgId_idx" ON "BillingInvoice" ("orgId");
CREATE INDEX "BillingInvoice_status_periodEnd_idx" ON "BillingInvoice" ("status", "periodEnd");
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE;
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE;
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT;
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_webPaymentId_fkey" FOREIGN KEY ("webPaymentId") REFERENCES "WebPayment"("id") ON DELETE SET NULL;

-- Drop the orderId unique constraint so a single WebPayment can be
-- a billing-cycle intent (no Order) instead. Existing order payments
-- still work; the constraint just stops blocking cycle rows.
ALTER TABLE "WebPayment" ALTER COLUMN "orderId" DROP NOT NULL;
