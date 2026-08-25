-- WebPayment: online payment intents for storefront checkout (VNPay sandbox).
CREATE TABLE "WebPayment" (
  id            TEXT PRIMARY KEY,
  "orderId"     TEXT NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'VNPAY',
  "txnRef"      TEXT NOT NULL,
  amount        BIGINT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING',
  "responseCode" TEXT,
  "bankCode"    TEXT,
  "rawParams"   JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt"      TIMESTAMP(3)
);

CREATE UNIQUE INDEX "WebPayment_orderId_key" ON "WebPayment"("orderId");
CREATE UNIQUE INDEX "WebPayment_txnRef_key" ON "WebPayment"("txnRef");
CREATE INDEX "WebPayment_status_idx" ON "WebPayment"("status");

ALTER TABLE "WebPayment"
  ADD CONSTRAINT "WebPayment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
