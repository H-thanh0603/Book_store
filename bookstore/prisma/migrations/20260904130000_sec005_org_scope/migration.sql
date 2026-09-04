-- Audit 2026-08-30 SEC-005: GiftCard, Supplier and Promotion had no org link,
-- so their [id] API routes accepted resources from any tenant (IDOR).
-- Add orgId (backfilled from existing relations where possible) + FK + index.

-- 1) GiftCard: best signal is a POS redemption — Payment -> PosTransaction ->
-- Store -> Region. Fall back to the first org (single-tenant data today).
ALTER TABLE "GiftCard" ADD COLUMN "orgId" TEXT;
UPDATE "GiftCard" g
SET "orgId" = COALESCE(
  (SELECT DISTINCT ON (t."storeId") r."orgId"
   FROM "Payment" p
   JOIN "PosTransaction" t ON t."id" = p."txId"
   JOIN "Store" s ON s."id" = t."storeId"
   JOIN "Region" r ON r."id" = s."regionId"
   WHERE p."giftCardId" = g."id"
   ORDER BY t."storeId"),
  (SELECT "id" FROM "Organization" ORDER BY "createdAt" LIMIT 1)
);
DELETE FROM "GiftCard" WHERE "orgId" IS NULL;
ALTER TABLE "GiftCard" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "GiftCard"
  ADD CONSTRAINT "GiftCard_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "GiftCard_orgId_idx" ON "GiftCard"("orgId");

-- 2) Promotion: first linked store's region; promos with no store link fall
-- back to the first org (they were global before, now they anchor there).
ALTER TABLE "Promotion" ADD COLUMN "orgId" TEXT;
UPDATE "Promotion" p
SET "orgId" = COALESCE(
  (SELECT r."orgId"
   FROM "PromotionStore" ps
   JOIN "Store" s ON s."id" = ps."storeId"
   JOIN "Region" r ON r."id" = s."regionId"
   WHERE ps."promotionId" = p."id"
   LIMIT 1),
  (SELECT "id" FROM "Organization" ORDER BY "createdAt" LIMIT 1)
);
DELETE FROM "Promotion" WHERE "orgId" IS NULL;
ALTER TABLE "Promotion" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Promotion"
  ADD CONSTRAINT "Promotion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Promotion_orgId_idx" ON "Promotion"("orgId");

-- 3) Supplier: no relation to anything org-scoped exists — every supplier
-- simply anchors to the first org.
ALTER TABLE "Supplier" ADD COLUMN "orgId" TEXT;
UPDATE "Supplier" SET "orgId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" LIMIT 1);
DELETE FROM "Supplier" WHERE "orgId" IS NULL;
ALTER TABLE "Supplier" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Supplier_orgId_idx" ON "Supplier"("orgId");
