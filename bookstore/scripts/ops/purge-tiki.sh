#!/usr/bin/env bash
# purge-tiki.sh — R5: remove Tiki-scraped research imports (SKU TKI-*) from a
# DEV database so the demo catalog is the curated seed only.
#
# Variants referenced by real transactional history (OrderItem,
# PosTransactionItem) are KEPT and reported — history is never deleted.
# Everything else hanging off a Tiki variant goes.
#
# Safety: refuses when NODE_ENV=production. Dry-run by default; set
# CONFIRM=YES to actually delete.
#
#   DATABASE_URL=... ./scripts/ops/purge-tiki.sh
#   CONFIRM=YES DATABASE_URL=... ./scripts/ops/purge-tiki.sh
set -uo pipefail

if [[ "${NODE_ENV:-}" == "production" ]]; then
  echo "✗ Refusing to purge a production database." >&2; exit 1
fi
[[ -n "${DATABASE_URL:-}" ]] || { echo "✗ DATABASE_URL is required" >&2; exit 1; }
command -v psql >/dev/null || { echo "✗ psql not found" >&2; exit 1; }

MODE="DRY-RUN (no changes)"
[[ "${CONFIRM:-}" == "YES" ]] && MODE="LIVE DELETE"

echo "▶ mode: $MODE"
psql "$DATABASE_URL" <<'SQL'
BEGIN;
-- Scratch set: Tiki variants + their products.
CREATE TEMP TABLE tiki_v AS SELECT id, "productId" FROM "ProductVariant" WHERE sku LIKE 'TKI-%';
CREATE TEMP TABLE tiki_p AS SELECT DISTINCT p.id FROM "Product" p JOIN tiki_v v ON v."productId" = p.id;

-- Transactional references: these variants STAY, reported below.
CREATE TEMP TABLE tiki_blocked AS
  SELECT DISTINCT "variantId" AS id FROM "OrderItem" WHERE "variantId" IN (SELECT id FROM tiki_v)
  UNION
  SELECT DISTINCT "variantId" AS id FROM "PosTransactionItem" WHERE "variantId" IN (SELECT id FROM tiki_v);
CREATE TEMP TABLE tiki_del AS SELECT id FROM tiki_v WHERE id NOT IN (SELECT id FROM tiki_blocked);

SELECT 'tiki_variants_total=' || (SELECT count(*) FROM tiki_v);
SELECT 'tiki_variants_blocked_by_history=' || (SELECT count(*) FROM tiki_blocked);
SELECT 'tiki_variants_to_delete=' || (SELECT count(*) FROM tiki_del);
SQL

if [[ "${CONFIRM:-}" != "YES" ]]; then
  echo "Dry run only — re-run with CONFIRM=YES to delete."
  exit 0
fi

psql "$DATABASE_URL" <<'SQL'
BEGIN;
CREATE TEMP TABLE tiki_v AS SELECT id, "productId" FROM "ProductVariant" WHERE sku LIKE 'TKI-%';
CREATE TEMP TABLE tiki_blocked AS
  SELECT DISTINCT "variantId" AS id FROM "OrderItem" WHERE "variantId" IN (SELECT id FROM tiki_v)
  UNION
  SELECT DISTINCT "variantId" AS id FROM "PosTransactionItem" WHERE "variantId" IN (SELECT id FROM tiki_v);
CREATE TEMP TABLE tiki_del AS SELECT id FROM tiki_v WHERE id NOT IN (SELECT id FROM tiki_blocked);

DELETE FROM "AttributeValue" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "BundleItem" WHERE "variantId" IN (SELECT id FROM tiki_del) OR "bundleId" IN (SELECT id FROM tiki_del);
DELETE FROM "GoodsReceiptItem" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "InventoryAdjustmentItem" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "InventoryBalance" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "InventoryCountItem" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "InventoryMovement" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "Price" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "ProductBarcode" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "ProductEmbedding" WHERE "productId" IN (SELECT "productId" FROM tiki_del);
DELETE FROM "ProductReview" WHERE "productId" IN (SELECT "productId" FROM tiki_del);
DELETE FROM "PurchaseOrderItem" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "ReplenishmentSuggestion" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "ReturnItem" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "StockTransferItem" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "SupplierProductPrice" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "SupplierReturnItem" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "WarehouseTaskItem" WHERE "variantId" IN (SELECT id FROM tiki_del);
DELETE FROM "ProductVariant" WHERE id IN (SELECT id FROM tiki_del);
-- Products left with no variants were import-only shells: remove them too.
DELETE FROM "Product" p
 WHERE NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id)
   AND p.id IN (SELECT "productId" FROM tiki_v);
COMMIT;
VACUUM ANALYZE "ProductVariant";
VACUUM ANALYZE "Product";
SQL
echo "✓ purge complete."
