-- Phase 2 additions created after the initial fulfillment migration was applied.
ALTER TYPE "MovementType" ADD VALUE 'SUPPLIER_RETURN';
ALTER TYPE "PaymentMethod" ADD VALUE 'GIFT_CARD';

ALTER TABLE "Promotion" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");
