-- P1-3: FK lookup indexes + value CHECKs, batch 1.
-- All statements are idempotent (IF NOT EXISTS / DROP IF EXISTS) so the
-- migration replays cleanly on every environment. Prisma schema needs no
-- change: these are pure query/shape guards invisible to the datamodel.

-- ── FK indexes: reverse lookups that currently seq-scan ──
CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_warehouseId_idx" ON "PurchaseOrder"("warehouseId");
CREATE INDEX IF NOT EXISTS "GoodsReceipt_poId_idx" ON "GoodsReceipt"("poId");
CREATE INDEX IF NOT EXISTS "StockTransfer_fromLocationId_idx" ON "StockTransfer"("fromLocationId");
CREATE INDEX IF NOT EXISTS "StockTransfer_toLocationId_idx" ON "StockTransfer"("toLocationId");
CREATE INDEX IF NOT EXISTS "Return_orderId_idx" ON "Return"("orderId");
CREATE INDEX IF NOT EXISTS "Return_customerId_idx" ON "Return"("customerId");
CREATE INDEX IF NOT EXISTS "Return_locationId_idx" ON "Return"("locationId");
CREATE INDEX IF NOT EXISTS "SupplierReturn_supplierId_idx" ON "SupplierReturn"("supplierId");
CREATE INDEX IF NOT EXISTS "SupplierReturn_locationId_idx" ON "SupplierReturn"("locationId");
CREATE INDEX IF NOT EXISTS "InventoryCount_locationId_idx" ON "InventoryCount"("locationId");
CREATE INDEX IF NOT EXISTS "PosShift_terminalId_idx" ON "PosShift"("terminalId");
CREATE INDEX IF NOT EXISTS "PosTransaction_customerId_idx" ON "PosTransaction"("customerId");

-- ── CHECKs: negatives/extremes caught in app code only until now ──
ALTER TABLE "GoodsReceiptItem" DROP CONSTRAINT IF EXISTS "GoodsReceiptItem_quantity_check";
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_quantity_check" CHECK (
  quantity > 0 AND "damagedQty" >= 0 AND "damagedQty" <= quantity
);
ALTER TABLE "StockTransferItem" DROP CONSTRAINT IF EXISTS "StockTransferItem_quantity_check";
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_quantity_check" CHECK (
  quantity > 0 AND "receivedQty" >= 0 AND "receivedQty" <= quantity
);
ALTER TABLE "SupplierReturnItem" DROP CONSTRAINT IF EXISTS "SupplierReturnItem_quantity_check";
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_quantity_check" CHECK (quantity > 0);
ALTER TABLE "InventoryCountItem" DROP CONSTRAINT IF EXISTS "InventoryCountItem_qty_check";
ALTER TABLE "InventoryCountItem" ADD CONSTRAINT "InventoryCountItem_qty_check" CHECK (
  "expectedQty" >= 0 AND "countedQty" >= 0
);
ALTER TABLE "InventoryAdjustmentItem" DROP CONSTRAINT IF EXISTS "InventoryAdjustmentItem_quantity_check";
ALTER TABLE "InventoryAdjustmentItem" ADD CONSTRAINT "InventoryAdjustmentItem_quantity_check" CHECK (
  "expectedQty" >= 0 AND "countedQty" >= 0
);
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_totals_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_totals_check" CHECK (
  subtotal >= 0 AND "discountTotal" >= 0 AND total >= 0 AND "shippingFee" >= 0
);
ALTER TABLE "PosTransaction" DROP CONSTRAINT IF EXISTS "PosTransaction_totals_check";
ALTER TABLE "PosTransaction" ADD CONSTRAINT "PosTransaction_totals_check" CHECK (
  subtotal >= 0 AND "discountTotal" >= 0 AND total >= 0
);
ALTER TABLE "WebPayment" DROP CONSTRAINT IF EXISTS "WebPayment_amount_check";
ALTER TABLE "WebPayment" ADD CONSTRAINT "WebPayment_amount_check" CHECK (amount > 0);
ALTER TABLE "Return" DROP CONSTRAINT IF EXISTS "Return_refundTotal_check";
ALTER TABLE "Return" ADD CONSTRAINT "Return_refundTotal_check" CHECK ("refundTotal" >= 0);
ALTER TABLE "Promotion" DROP CONSTRAINT IF EXISTS "Promotion_value_check";
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_value_check" CHECK (
  value >= 0
  AND ("buyQty" IS NULL OR "buyQty" > 0)
  AND ("getQty" IS NULL OR "getQty" > 0)
  AND ("minQty" IS NULL OR "minQty" >= 0)
  AND ("usageLimit" IS NULL OR "usageLimit" >= 0)
  AND ("priority" IS NULL OR "priority" >= 0)
);
ALTER TABLE "ReplenishmentSuggestion" DROP CONSTRAINT IF EXISTS "ReplenishmentSuggestion_qty_check";
ALTER TABLE "ReplenishmentSuggestion" ADD CONSTRAINT "ReplenishmentSuggestion_qty_check" CHECK (
  "recommendedQty" >= 0 AND "safetyStock" >= 0 AND "leadTimeDays" >= 0
);
ALTER TABLE "LoyaltyTransaction" DROP CONSTRAINT IF EXISTS "LoyaltyTransaction_points_check";
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_points_check" CHECK (points <> 0);
