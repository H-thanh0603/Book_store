-- Reverse-lookup indexes: "which orders/transactions contain variant X" used to
-- seq-scan the whole item table once ledgers grew.
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");
CREATE INDEX "PosTransactionItem_variantId_idx" ON "PosTransactionItem"("variantId");
CREATE INDEX "PosTransactionItem_promoId_idx" ON "PosTransactionItem"("promoId");
CREATE INDEX "ReturnItem_variantId_idx" ON "ReturnItem"("variantId");
CREATE INDEX "PurchaseOrderItem_variantId_idx" ON "PurchaseOrderItem"("variantId");
CREATE INDEX "StockTransferItem_variantId_idx" ON "StockTransferItem"("variantId");
CREATE INDEX "GoodsReceiptItem_variantId_idx" ON "GoodsReceiptItem"("variantId");
CREATE INDEX "SupplierReturnItem_variantId_idx" ON "SupplierReturnItem"("variantId");
CREATE INDEX "InventoryAdjustmentItem_variantId_idx" ON "InventoryAdjustmentItem"("variantId");
CREATE INDEX "WarehouseTaskItem_variantId_idx" ON "WarehouseTaskItem"("variantId");

-- Replay protection for gift-card adjustments: one ledger row per
-- (card, refType, refId). NULL refIds remain distinct under PostgreSQL unique
-- semantics, so legacy rows never conflict.
CREATE UNIQUE INDEX "GiftCardTransaction_giftCardId_refType_refId_key" ON "GiftCardTransaction"("giftCardId", "refType", "refId");
