// Typo-tolerant search + recommendation decay/content-similar verification
// against a seeded database. Run: npx tsx scripts/test-search-recs.ts
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { listStorefrontProducts } from "../src/lib/storefront";
import { getProductRecommendations } from "../src/lib/recommendations";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`✅ ${name}`);
  else { failures++; console.error(`❌ ${name}`, detail ?? ""); }
}

async function main() {
  const cat = await listStorefrontProducts({});
  check("no-q catalog returns products", cat.products.length > 0);
  check("cache hit is the same object", (await listStorefrontProducts({})) === cat);

  // Pick a sellable product from the actual catalog (has stock at its store).
  const target = cat.products[0];
  const dbProduct = await prisma.product.findUniqueOrThrow({
    where: { id: target.id }, select: { id: true, name: true, variants: { select: { id: true } } },
  });
  const exactWords = target.name.split(/\s+/).filter((w) => w.length >= 2 && !/^—$/.test(w));
  {
    const exact = await listStorefrontProducts({ q: exactWords.join(" ") });
    check("exact multi-word matches", exact.products.some((p) => p.id === target.id), exactWords.join(" "));

    const swapped = [...exactWords].reverse().join(" ");
    const swappedResult = await listStorefrontProducts({ q: swapped });
    check("swapped word order matches", swappedResult.products.some((p) => p.id === target.id), swapped);

    // Fuzzy: mangle every word (drop a char / swap chars).
    const mangled = exactWords.map((w) => (w.length >= 4 ? w.slice(0, -1) : w + w)).join(" ");
    const fuzzy = await listStorefrontProducts({ q: mangled });
    check("mangled words still find product", fuzzy.products.some((p) => p.id === target.id), mangled);
  }

  // ── Recommendations ──
  const variant = await prisma.productVariant.findFirstOrThrow({
    where: { id: { in: dbProduct.variants.map((v) => v.id) } },
  });
  const recs = await getProductRecommendations(variant.id);
  check("recommendations ≤5 and valid shape", recs.length <= 5 && recs.every((r) => r.id && r.sku && r.reason));
  check("no self-recommendation", recs.every((r) => r.id !== variant.id));

  // ── Semantic tier (only meaningful when embeddings exist) ──
  let embeddedCount = 0;
  try {
    const embedded = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "ProductEmbedding"`;
    embeddedCount = Number(embedded[0].count);
  } catch {
    // pgvector migration not applied yet — semantic tier can't run.
  }
  if (embeddedCount > 0 && process.env.GEMINI_API_KEY) {
    // Paraphrase that shares no word with any product name — only the
    // embedding tier can answer it. Uses the seeded Dế Mèn book's theme.
    const semantic = await listStorefrontProducts({ q: "truyện phiêu lưu của con nhện" });
    check(
      "semantic paraphrase finds a product",
      semantic.products.length > 0,
      `embeddings=${embeddedCount}`,
    );
    const recsVec = await getProductRecommendations(variant.id);
    check("vector recs carry similar_content or co-purchase reason", recsVec.every((r) =>
      ["similar_content", "frequently_bought_together"].includes(r.reason)), JSON.stringify(recsVec.map((r) => r.reason)));
  } else {
    console.log("⏭️ semantic checks skipped — no embeddings / GEMINI_API_KEY unset");
  }

  process.exitCode = failures ? 1 : 0;
  if (failures) throw new Error(`${failures} check(s) failed`);
  console.log("All checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });
