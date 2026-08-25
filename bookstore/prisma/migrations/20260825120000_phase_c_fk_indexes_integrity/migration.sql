-- Phase C: FK indexes, storefront search index, financial-lineage delete rules,
-- marketplace idempotency. Schema.prisma carries the @@index/onDelete changes;
-- this file is the SQL counterpart (hand-written like the other SQL-managed
-- migrations — see the drift guard in CI).
--
-- NOTE on locking: plain CREATE INDEX takes a brief write lock. Tables here are
-- small-to-medium at this stage; if a future migration touches InventoryMovement
-- or AuditLog at production scale, run CREATE INDEX CONCURRENTLY manually
-- (Prisma wraps migrations in a transaction, which forbids CONCURRENTLY).

-- ── 1. FK indexes (PostgreSQL does not auto-index FK columns) ──────────────
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderStatusHistory_orderId_idx" ON "OrderStatusHistory"("orderId");
CREATE INDEX "PosTransactionItem_txId_idx" ON "PosTransactionItem"("txId");
CREATE INDEX "Payment_txId_idx" ON "Payment"("txId");
CREATE INDEX "LoyaltyTransaction_accountId_idx" ON "LoyaltyTransaction"("accountId");
CREATE INDEX "InventoryMovement_refType_refId_idx" ON "InventoryMovement"("refType", "refId");
CREATE INDEX "ReturnItem_returnId_idx" ON "ReturnItem"("returnId");
CREATE INDEX "ReturnItem_orderItemId_idx" ON "ReturnItem"("orderItemId");
CREATE INDEX "PurchaseOrderItem_poId_idx" ON "PurchaseOrderItem"("poId");
CREATE INDEX "GoodsReceiptItem_receiptId_idx" ON "GoodsReceiptItem"("receiptId");
CREATE INDEX "StockTransferItem_transferId_idx" ON "StockTransferItem"("transferId");
CREATE INDEX "SupplierReturnItem_supplierReturnId_idx" ON "SupplierReturnItem"("supplierReturnId");
CREATE INDEX "InventoryAdjustmentItem_adjustmentId_idx" ON "InventoryAdjustmentItem"("adjustmentId");
CREATE INDEX "ProductBarcode_variantId_idx" ON "ProductBarcode"("variantId");
-- PK is (promotionId, storeId): store-first lookups scan otherwise.
CREATE INDEX "PromotionStore_storeId_idx" ON "PromotionStore"("storeId");

-- ── 2. Storefront search: Product.description ILIKE was a seq scan ─────────
CREATE INDEX "Product_description_trgm_idx" ON "Product" USING gin ("description" gin_trgm_ops);

-- ── 3. Financial-lineage FKs: hard deletes must not orphan history ─────────
ALTER TABLE "Order" DROP CONSTRAINT "Order_storeId_fkey";
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PosTransaction" DROP CONSTRAINT "PosTransaction_customerId_fkey";
ALTER TABLE "PosTransaction" ADD CONSTRAINT "PosTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Return" DROP CONSTRAINT "Return_orderId_fkey";
ALTER TABLE "Return" ADD CONSTRAINT "Return_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Return" DROP CONSTRAINT "Return_customerId_fkey";
ALTER TABLE "Return" ADD CONSTRAINT "Return_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 4. Marketplace idempotency: one order per external id per channel ──────
-- Storefront already has its own partial unique (storefront:% prefix, migration
-- 20260823130000); MARKETPLACE imports had none, so duplicate webhook imports
-- could create duplicate orders.
CREATE UNIQUE INDEX "Order_marketplace_external_id_key" ON "Order"("externalId")
  WHERE "channel" = 'MARKETPLACE' AND "externalId" IS NOT NULL;
