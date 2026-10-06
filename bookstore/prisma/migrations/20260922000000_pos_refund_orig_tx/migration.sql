-- MED-12 (audit): refundSale resolved prior partial refunds by scanning the
-- last 200 AuditLog rows and pattern-matching `after->>refundedTx`. Two
-- weaknesses: (a) no index → seq-scan on the biggest audit surface, and
-- (b) a busy register could push >200 unrelated audit rows between two
-- partial refunds of the SAME tx, letting a third refund exceed the sold
-- quantity. Fix: the refund PosTransaction carries origTxId pointing at the
-- sale it reverses — prior partials become a direct, indexed lookup.
--
-- Backfill: existing refund txs are mirrored negatives whose audit row links
-- entityId (refund tx) → after.refundedTx (orig number). One UPDATE maps
-- them; orphans (audit row pruned) simply keep origTxId NULL and fall back
-- to the legacy path.

ALTER TABLE "PosTransaction" ADD COLUMN IF NOT EXISTS "origTxId" TEXT;
ALTER TABLE "PosTransaction"
  ADD CONSTRAINT "PosTransaction_origTxId_fkey"
  FOREIGN KEY ("origTxId") REFERENCES "PosTransaction"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "PosTransaction_origTxId_idx" ON "PosTransaction"("origTxId");

-- Backfill from the audit trail. after->>'refundedTx' holds the ORIGINAL
-- tx NUMBER (TXN-...), so join through number, then store the id.
UPDATE "PosTransaction" r
SET "origTxId" = o.id
FROM "AuditLog" a
JOIN "PosTransaction" o ON o.number = a."after"->>'refundedTx'
WHERE a.action = 'pos.refund'
  AND a."entityId" = r.id
  AND r."origTxId" IS NULL;
