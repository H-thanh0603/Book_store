-- P4-2: server-backed wishlist (one row per customer x variant).
CREATE TABLE IF NOT EXISTS "WishlistItem" (
  id TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  "variantId" TEXT NOT NULL REFERENCES "ProductVariant"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "WishlistItem_customerId_variantId_key" UNIQUE ("customerId", "variantId")
);
CREATE INDEX IF NOT EXISTS "WishlistItem_customerId_createdAt_idx" ON "WishlistItem"("customerId", "createdAt");
