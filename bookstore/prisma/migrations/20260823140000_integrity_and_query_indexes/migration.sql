ALTER TABLE "UserRole" ADD COLUMN IF NOT EXISTS "id" TEXT, ADD COLUMN IF NOT EXISTS "scopeKey" TEXT;
UPDATE "UserRole" SET "id" = COALESCE("id", gen_random_uuid()::text), "scopeKey" = COALESCE("scopeKey", "storeId", '*');
ALTER TABLE "UserRole" ALTER COLUMN "id" SET NOT NULL, ALTER COLUMN "scopeKey" SET NOT NULL;
ALTER TABLE "UserRole" DROP CONSTRAINT IF EXISTS "UserRole_pkey";
DROP INDEX IF EXISTS "UserRole_userId_roleId_storeId_key";
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX IF NOT EXISTS "UserRole_userId_roleId_scopeKey_key" ON "UserRole"("userId", "roleId", "scopeKey");
ALTER TABLE "UserRole" DROP CONSTRAINT IF EXISTS "UserRole_storeId_fkey";
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockLocation" DROP CONSTRAINT IF EXISTS "StockLocation_owner_check";
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_owner_check" CHECK (
  ("type" IN ('STORE_STOCKROOM', 'STORE_SHELF') AND "storeId" IS NOT NULL AND "warehouseId" IS NULL)
  OR ("type" = 'WAREHOUSE' AND "warehouseId" IS NOT NULL AND "storeId" IS NULL)
);
ALTER TABLE "InventoryBalance" DROP CONSTRAINT IF EXISTS "InventoryBalance_nonnegative_check";
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_nonnegative_check" CHECK (
  "onHand" >= 0 AND reserved >= 0 AND "inTransit" >= 0 AND damaged >= 0
);
ALTER TABLE "Price" DROP CONSTRAINT IF EXISTS "Price_amount_check";
ALTER TABLE "Price" ADD CONSTRAINT "Price_amount_check" CHECK (amount >= 0 AND ("validTo" IS NULL OR "validTo" > "validFrom"));
ALTER TABLE "PurchaseOrderItem" DROP CONSTRAINT IF EXISTS "PurchaseOrderItem_quantity_check";
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_quantity_check" CHECK (
  quantity > 0 AND "unitCost" >= 0 AND "receivedQty" >= 0 AND "receivedQty" <= quantity
);
ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_value_check";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_value_check" CHECK (quantity > 0 AND "unitPrice" >= 0 AND discount >= 0);
-- Refund rows are signed reversals: negative quantity and negative discount.
ALTER TABLE "PosTransactionItem" DROP CONSTRAINT IF EXISTS "PosTransactionItem_value_check";
ALTER TABLE "PosTransactionItem" ADD CONSTRAINT "PosTransactionItem_value_check" CHECK (
  quantity <> 0 AND "unitPrice" >= 0
  AND ((quantity > 0 AND discount >= 0) OR (quantity < 0 AND discount <= 0))
);
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_amount_check";
-- Refund transactions mirror the original payment with a negative amount.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK (amount <> 0);
ALTER TABLE "ReturnItem" DROP CONSTRAINT IF EXISTS "ReturnItem_value_check";
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_value_check" CHECK (quantity > 0 AND "refundAmount" >= 0);
ALTER TABLE "GiftCard" DROP CONSTRAINT IF EXISTS "GiftCard_balance_check";
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_balance_check" CHECK ("initialValue" >= 0 AND balance >= 0 AND balance <= "initialValue");
ALTER TABLE "LoyaltyAccount" DROP CONSTRAINT IF EXISTS "LoyaltyAccount_points_check";
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_points_check" CHECK (points >= 0);

CREATE INDEX IF NOT EXISTS "Order_storeId_createdAt_idx" ON "Order"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "PosTransaction_storeId_status_createdAt_idx" ON "PosTransaction"("storeId", status, "createdAt");
CREATE INDEX IF NOT EXISTS "SupplierProductPrice_variantId_recordedAt_idx" ON "SupplierProductPrice"("variantId", "recordedAt");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_id_idx" ON "AuditLog"("createdAt", id);
CREATE INDEX IF NOT EXISTS "InventoryMovement_sale_createdAt_variant_location_idx"
  ON "InventoryMovement"("createdAt", "variantId", "locationId") WHERE type = 'SALE';
