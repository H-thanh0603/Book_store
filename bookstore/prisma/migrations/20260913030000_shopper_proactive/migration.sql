-- P1+P3: two-way server cart, back-in-stock alerts, shopper outbox.
-- Nullable-subject uniques: Postgres treats NULLs as distinct, so the
-- customer-keyed and phone-keyed shapes each enforce their own dedupe.
CREATE TABLE "ServerCart" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "customerId" TEXT,
    "phone" TEXT,
    "storeId" TEXT,
    "items" JsonB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'shop',
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerCart_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServerCart_orgId_customerId_storeId_key" ON "ServerCart"("orgId", "customerId", "storeId");
CREATE UNIQUE INDEX "ServerCart_orgId_phone_storeId_key" ON "ServerCart"("orgId", "phone", "storeId");
CREATE INDEX "ServerCart_orgId_updatedAt_idx" ON "ServerCart"("orgId", "updatedAt");
ALTER TABLE "ServerCart" ADD CONSTRAINT "ServerCart_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerCart" ADD CONSTRAINT "ServerCart_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StockAlert" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "customerId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "variantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockAlert_orgId_customerId_variantId_key" ON "StockAlert"("orgId", "customerId", "variantId");
CREATE UNIQUE INDEX "StockAlert_orgId_phone_variantId_key" ON "StockAlert"("orgId", "phone", "variantId");
CREATE INDEX "StockAlert_orgId_status_idx" ON "StockAlert"("orgId", "status");
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ShopperNotification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "customerId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopperNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShopperNotification_orgId_status_idx" ON "ShopperNotification"("orgId", "status");
ALTER TABLE "ShopperNotification" ADD CONSTRAINT "ShopperNotification_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopperNotification" ADD CONSTRAINT "ShopperNotification_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
