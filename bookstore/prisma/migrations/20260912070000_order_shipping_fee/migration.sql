-- N3b: zone-based delivery fee on orders (0 = pickup / free ship).
ALTER TABLE "Order" ADD COLUMN "shippingFee" BIGINT NOT NULL DEFAULT 0;
