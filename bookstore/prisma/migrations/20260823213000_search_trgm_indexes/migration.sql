-- Search acceleration for ILIKE '%q%' (Group 2, task 8).
--
-- Plain btree indexes cannot serve leading-wildcard LIKE/ILIKE, so every
-- storefront/admin search degenerated to a sequential scan. pg_trgm trigram
-- GIN indexes DO serve `ILIKE '%q%'` — including Vietnamese diacritics —
-- turning search into an index probe as catalogs grow.
--
-- Requires the pg_trgm extension. On most managed Postgres (RDS, Cloud SQL,
-- Supabase, Neon) the database owner may create it; on locked-down installs a
-- superuser must run the first statement once, then this migration re-runs cleanly.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Storefront catalog search (public, hottest path): name + brand + author + publisher.
CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx" ON "Product" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Brand_name_trgm_idx" ON "Brand" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Author_name_trgm_idx" ON "Author" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Publisher_name_trgm_idx" ON "Publisher" USING gin ("name" gin_trgm_ops);

-- Admin product search also matches variant SKU substrings.
CREATE INDEX IF NOT EXISTS "ProductVariant_sku_trgm_idx" ON "ProductVariant" USING gin (sku gin_trgm_ops);

-- POS/customer lookup searches by partial phone and name.
CREATE INDEX IF NOT EXISTS "Customer_name_trgm_idx" ON "Customer" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Customer_phone_trgm_idx" ON "Customer" USING gin (phone gin_trgm_ops);

-- Deliberately NOT indexed: AuditLog.action/entity (admin-only filters over
-- enum-like values with low selectivity) and Supplier.name/code (tiny table) —
-- GIN write amplification would cost more than the scans do.

-- Refresh planner statistics so queries pick the new indexes immediately.
ANALYZE "Product";
ANALYZE "ProductVariant";
ANALYZE "Brand";
ANALYZE "Author";
ANALYZE "Publisher";
ANALYZE "Customer";
