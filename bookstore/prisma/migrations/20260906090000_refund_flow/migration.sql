-- MONEY-001 follow-up (audit 2026-08-30 review 2026-09-06): REFUND_REQUIRED
-- captures previously had no operator path — money landed, order was cancelled,
-- nobody was paged. These columns make the refund queue first-class.
ALTER TABLE "WebPayment" ADD COLUMN "refundStatus" TEXT;
ALTER TABLE "WebPayment" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "WebPayment" ADD COLUMN "refundedBy" TEXT;
ALTER TABLE "WebPayment" ADD COLUMN "refundNote" TEXT;

-- Backfill: every existing REFUND_REQUIRED row enters the queue as PENDING.
UPDATE "WebPayment" SET "refundStatus" = 'PENDING' WHERE "status" = 'REFUND_REQUIRED';

-- Refund queue scans (job + admin list) hit this index.
CREATE INDEX "WebPayment_status_refundStatus_idx" ON "WebPayment"("status", "refundStatus");
