-- P1 follow-up: POS refunds mirror the original sale with negated totals
-- (refundSale in src/lib/pos.ts) — the same signed-reversal shape already
-- allowed for PosTransactionItem and Payment. The all-nonnegative CHECK
-- from 20260916061643 blocked every refund; allow all-negative rows too.
ALTER TABLE "PosTransaction" DROP CONSTRAINT IF EXISTS "PosTransaction_totals_check";
ALTER TABLE "PosTransaction" ADD CONSTRAINT "PosTransaction_totals_check" CHECK (
  (subtotal >= 0 AND "discountTotal" >= 0 AND total >= 0)
  OR (subtotal <= 0 AND "discountTotal" <= 0 AND total <= 0)
);
