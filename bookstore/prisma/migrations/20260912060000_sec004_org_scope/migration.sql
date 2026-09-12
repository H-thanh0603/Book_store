-- WS3.1 (SEC-004): tenant-scoped uniqueness for store codes and SKUs.
--
-- Single-tenant deployments: one Organization row exists, backfill assigns
-- everything to it. Multi-org production databases MUST review the backfill
-- below — existing catalog rows are assigned to the oldest org; split them
-- per tenant BEFORE going live (see OPERATIONS.md "SEC-004 backfill").
ALTER TABLE "Store" ADD COLUMN "orgId" TEXT;
UPDATE "Store" s SET "orgId" = r."orgId" FROM "Region" r WHERE r.id = s."regionId";
ALTER TABLE "Store" ALTER COLUMN "orgId" SET NOT NULL;
-- Prisma 7 creates global uniques as bare unique INDEXES, not constraints.
DROP INDEX IF EXISTS "Store_code_key";
ALTER TABLE "Store" ADD CONSTRAINT "Store_orgId_code_key" UNIQUE ("orgId", "code");
CREATE INDEX "Store_orgId_idx" ON "Store"("orgId");
ALTER TABLE "Store" ADD CONSTRAINT "Store_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product" ADD COLUMN "orgId" TEXT;
UPDATE "Product" SET "orgId" = (SELECT id FROM "Organization" ORDER BY "createdAt" LIMIT 1);
ALTER TABLE "Product" ALTER COLUMN "orgId" SET NOT NULL;
CREATE INDEX "Product_orgId_idx" ON "Product"("orgId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductVariant" ADD COLUMN "orgId" TEXT;
UPDATE "ProductVariant" v SET "orgId" = p."orgId" FROM "Product" p WHERE p.id = v."productId";
ALTER TABLE "ProductVariant" ALTER COLUMN "orgId" SET NOT NULL;
DROP INDEX IF EXISTS "ProductVariant_sku_key";
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_orgId_sku_key" UNIQUE ("orgId", "sku");
