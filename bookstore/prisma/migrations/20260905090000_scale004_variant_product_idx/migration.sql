-- SCALE-004 (audit 2026-08-30): every Product→variants lookup (POS cart
-- include, product detail pages, seed joins) seq-scanned ProductVariant
-- because productId had no index — only sku (unique) did.
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");
