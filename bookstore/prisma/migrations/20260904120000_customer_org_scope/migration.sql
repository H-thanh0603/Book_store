-- SEC-004 (audit 2026-08-30): Customer.phone / Customer.email were globally
-- unique, so the storefront upsert keyed on phone alone attached org A's
-- customer to org B's order. Scope both uniques to the owning org.

-- 1) orgId column, nullable during backfill.
ALTER TABLE "Customer" ADD COLUMN "orgId" TEXT;

-- 2a) Backfill from web orders (Order.storeId -> Store.regionId -> Region.orgId)
UPDATE "Customer" c
SET "orgId" = sub."orgId"
FROM (
  SELECT DISTINCT ON (o."customerId") o."customerId", r."orgId"
  FROM "Order" o
  JOIN "Store" s ON s."id" = o."storeId"
  JOIN "Region" r ON r."id" = s."regionId"
  ORDER BY o."customerId", o."createdAt"
) sub
WHERE c."id" = sub."customerId" AND c."orgId" IS NULL;

-- 2b) From POS transactions (PosTransaction.storeId, same join chain)
UPDATE "Customer" c
SET "orgId" = sub."orgId"
FROM (
  SELECT DISTINCT ON (t."customerId") t."customerId", r."orgId"
  FROM "PosTransaction" t
  JOIN "Store" s ON s."id" = t."storeId"
  JOIN "Region" r ON r."id" = s."regionId"
  ORDER BY t."customerId", t."createdAt"
) sub
WHERE c."id" = sub."customerId" AND c."orgId" IS NULL;

-- 2c) Still null (no orders, single-tenant/demo data): first org.
UPDATE "Customer"
SET "orgId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" LIMIT 1)
WHERE "orgId" IS NULL;

-- 3) NULL-refuse + FK. The DELETE is a no-op on any DB with at least one
--    org; on a fresh dev DB with zero orgs it drops unreachable rows.
DELETE FROM "Customer" WHERE "orgId" IS NULL;
ALTER TABLE "Customer" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4) Swap the uniques: drop global, create org-scoped.
--    Phone clashes across orgs (same person shops at two tenants) are now
--    legal; email likewise. A clash WITHIN an org fails here — resolve by
--    merging before rerunning.
DROP INDEX IF EXISTS "Customer_phone_key";
DROP INDEX IF EXISTS "Customer_email_key";

CREATE UNIQUE INDEX "Customer_orgId_phone_key" ON "Customer"("orgId", "phone");
CREATE UNIQUE INDEX "Customer_orgId_email_key" ON "Customer"("orgId", "email") WHERE "email" IS NOT NULL;
