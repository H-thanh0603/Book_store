import { prisma } from "./db";

// Co-purchase window: only recent transactions count, so stale pairings fade
// out instead of dominating the score forever.
const CO_PURCHASE_WINDOW_DAYS = 90;

export async function getProductRecommendations(variantId: string, take = 5) {
  const coPurchased = await prisma.$queryRaw<{ id: string; sku: string; name: string; score: number }[]>`
    SELECT v.id, v.sku, p.name, COUNT(DISTINCT source."txId")::int AS score
    FROM "PosTransactionItem" source
    JOIN "PosTransactionItem" other ON other."txId" = source."txId" AND other."variantId" <> source."variantId"
    JOIN "PosTransaction" tx ON tx.id = source."txId"
    JOIN "ProductVariant" v ON v.id = other."variantId"
    JOIN "Product" p ON p.id = v."productId"
    WHERE source."variantId" = ${variantId} AND v.active = true
      AND tx.status = 'COMPLETED' AND tx."createdAt" > now() - ${`${CO_PURCHASE_WINDOW_DAYS} days`}::interval
    GROUP BY v.id, v.sku, p.name
    ORDER BY score DESC, p.name ASC
    LIMIT ${take}`;
  if (coPurchased.length) return coPurchased.map((item) => ({ ...item, reason: "frequently_bought_together" }));

  const source = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!source) return [];
  // Content-similar fallback (pgvector): nearest neighbors of the source
  // product's Gemini embedding. Stored-vs-stored — no API call at query time;
  // products without an embedding row simply don't match here and the
  // same-category tier answers instead ("Atomic Habits Tập 1" → "Tập 2").
  // Missing table/extension (pgvector not installed yet) degrades silently.
  let similar: { id: string; sku: string; name: string; score: number }[] = [];
  try {
    similar = await prisma.$queryRaw<{ id: string; sku: string; name: string; score: number }[]>`
      SELECT v.id, v.sku, p.name,
             (1 - (se.embedding <=> ce.embedding))::float AS score
      FROM "ProductEmbedding" ce
      JOIN "Product" sp ON sp.id = ce."productId"
      JOIN "ProductVariant" sv ON sv."productId" = sp.id AND sv.id = ${variantId}
      JOIN "ProductEmbedding" se ON se."productId" <> ce."productId"
      JOIN "Product" p ON p.id = se."productId" AND p.status = 'active'
      JOIN "ProductVariant" v ON v."productId" = p.id AND v.active = true AND v.id <> ${variantId}
      WHERE se.model = ce.model
      ORDER BY se.embedding <=> ce.embedding
      LIMIT ${take}`;
  } catch {
    // ponytail: blanket catch hides DB outages too; acceptable — the
    // same-category tier below still answers the request.
  }
  if (similar.length)
    return similar.map((item) => ({ ...item, reason: "similar_content" }));

  const related = await prisma.productVariant.findMany({
    where: { id: { not: variantId }, active: true, product: { categoryId: source.product.categoryId, status: "active" } },
    include: { product: true }, take, orderBy: { createdAt: "desc" },
  });
  return related.map((item) => ({ id: item.id, sku: item.sku, name: item.product.name, score: 0, reason: "same_category" }));
}
