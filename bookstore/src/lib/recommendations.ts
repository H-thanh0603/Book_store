import { prisma } from "./db";

export async function getProductRecommendations(variantId: string, take = 5) {
  const coPurchased = await prisma.$queryRaw<{ id: string; sku: string; name: string; score: number }[]>`
    SELECT v.id, v.sku, p.name, COUNT(DISTINCT source."txId")::int AS score
    FROM "PosTransactionItem" source
    JOIN "PosTransactionItem" other ON other."txId" = source."txId" AND other."variantId" <> source."variantId"
    JOIN "ProductVariant" v ON v.id = other."variantId"
    JOIN "Product" p ON p.id = v."productId"
    WHERE source."variantId" = ${variantId} AND v.active = true
    GROUP BY v.id, v.sku, p.name
    ORDER BY score DESC, p.name ASC
    LIMIT ${take}`;
  if (coPurchased.length) return coPurchased.map((item) => ({ ...item, reason: "frequently_bought_together" }));

  const source = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!source) return [];
  const related = await prisma.productVariant.findMany({
    where: { id: { not: variantId }, active: true, product: { categoryId: source.product.categoryId, status: "active" } },
    include: { product: true }, take, orderBy: { createdAt: "desc" },
  });
  return related.map((item) => ({ id: item.id, sku: item.sku, name: item.product.name, score: 0, reason: "same_category" }));
}
