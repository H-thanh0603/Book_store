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
  // Content-similar fallback: word-vs-word trigram similarity between product
  // names beats same-category recency ("Atomic Habits Tập 1" → "Tập 2", not
  // just any book in the category). ponytail: full-scan SIMILARITY — swap for
  // pgvector + embeddings when the DB has the `vector` extension available.
  const similar = await prisma.$queryRaw<{ id: string; sku: string; name: string; score: number }[]>`
    SELECT v.id, v.sku, p.name, AVG(sw.score)::float AS score
    FROM "ProductVariant" v
    JOIN "Product" p ON p.id = v."productId"
    CROSS JOIN LATERAL (
      SELECT w FROM unnest(string_to_array(lower(${source.product.name}), ' ')) s(w) WHERE length(s.w) >= 3
    ) sq
    CROSS JOIN LATERAL (
      SELECT MAX(SIMILARITY(nw.w, sq.w)) AS score
      FROM unnest(string_to_array(lower(p.name), ' ')) nw(w) WHERE length(nw.w) >= 3
    ) sw
    WHERE v.id <> ${variantId} AND v.active = true AND p.status = 'active'
      AND p."categoryId" = ${source.product.categoryId}
    GROUP BY v.id, v.sku, p.name
    HAVING MIN(sw.score) >= 0.6 OR AVG(sw.score) >= 0.8
    ORDER BY score DESC, p.name ASC
    LIMIT ${take}`;
  if (similar.length)
    return similar.map((item) => ({ ...item, reason: "similar_content" }));

  const related = await prisma.productVariant.findMany({
    where: { id: { not: variantId }, active: true, product: { categoryId: source.product.categoryId, status: "active" } },
    include: { product: true }, take, orderBy: { createdAt: "desc" },
  });
  return related.map((item) => ({ id: item.id, sku: item.sku, name: item.product.name, score: 0, reason: "same_category" }));
}
