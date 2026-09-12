-- R3: supplier codes unique per org (same pattern as Store/Variant).
DROP INDEX IF EXISTS "Supplier_code_key";
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_orgId_code_key" UNIQUE ("orgId", "code");
