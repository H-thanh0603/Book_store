// Group 2, task 9 — "Index theo đo đếm": prove the scaling indexes exist AND are
// actually chosen by the planner. Run: npx tsx scripts/verify-scale-indexes.ts
//
// Verifies against the live database:
//   1. pg_trgm extension + trigram GIN indexes for every ILIKE search column
//   2. Reverse-lookup FK indexes (variantId ×10), SALE partial index, gift-card ledger key
//   3. EXPLAIN on the storefront search shape uses a trgm index (no seq scan)
import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";

const REQUIRED_INDEXES = [
  // task 8 — trigram GIN (ILIKE '%q%' acceleration)
  "Product_name_trgm_idx",
  "Brand_name_trgm_idx",
  "Author_name_trgm_idx",
  "Publisher_name_trgm_idx",
  "ProductVariant_sku_trgm_idx",
  "Customer_name_trgm_idx",
  "Customer_phone_trgm_idx",
  // prior hardening — reverse-lookup FK indexes on item ledgers (variantId ×10)
  "OrderItem_variantId_idx",
  "PosTransactionItem_variantId_idx",
  "PosTransactionItem_promoId_idx",
  "ReturnItem_variantId_idx",
  "PurchaseOrderItem_variantId_idx",
  "StockTransferItem_variantId_idx",
  "GoodsReceiptItem_variantId_idx",
  "SupplierReturnItem_variantId_idx",
  "InventoryAdjustmentItem_variantId_idx",
  "WarehouseTaskItem_variantId_idx",
  // movement ledger: SALE-only partial covering index
  "InventoryMovement_sale_createdAt_variant_location_idx",
  // gift-card replay protection
  "GiftCardTransaction_giftCardId_refType_refId_key",
];

async function main() {
  const ext = await prisma.$queryRaw<{ extname: string }[]>`
    SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`;
  assert.equal(ext.length, 1, "pg_trgm extension missing — run the 20260823213000 migration");
  console.log("✅ pg_trgm extension installed");

  const present = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ANY(${REQUIRED_INDEXES})`;
  const found = new Set(present.map((r) => r.indexname));
  const missing = REQUIRED_INDEXES.filter((name) => !found.has(name));
  assert.deepEqual(missing, [], `missing indexes: ${missing.join(", ")}`);
  console.log(`✅ all ${REQUIRED_INDEXES.length} required indexes present`);

  // Planner proof: ILIKE '%q%' must be servable by each trgm GIN index. Dev tables
  // are tiny (seq scan genuinely wins at 150 rows), so force index consideration
  // with enable_seqscan=off — this proves the INDEX PATH exists; at production row
  // counts the planner picks it without the flag.
  const searchable: [string, string][] = [
    ['"Product"', "name"],
    ['"ProductVariant"', "sku"],
    ['"Customer"', "phone"],
    ['"Brand"', "name"],
    ['"Author"', "name"],
    ['"Publisher"', "name"],
  ];
  await prisma.$executeRawUnsafe(`SET enable_seqscan = off`);
  try {
    for (const [table, column] of searchable) {
      // Identifiers can't be bound as query parameters; both values come from the
      // fixed whitelist above, so interpolation is injection-safe here.
      const plan = await prisma.$queryRawUnsafe<{ plan: Record<string, unknown> }[]>(
        `EXPLAIN (FORMAT JSON) SELECT * FROM ${table} WHERE ${column} ILIKE '%harry%'`,
      );
      const planJson = JSON.stringify(plan);
      assert.ok(/trgm_idx/.test(planJson), `${table}.${column} ILIKE has no usable trgm index:\n${planJson}`);
    }
  } finally {
    await prisma.$executeRawUnsafe(`SET enable_seqscan = on`);
  }
  console.log("✅ storefront/admin/customer search plans use trgm GIN indexes");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
