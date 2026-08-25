// One-shot: embed every active product into ProductEmbedding.
// Run: npx tsx scripts/backfill-embeddings.ts
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { backfillProductEmbeddings, embeddingConfigured } from "../src/lib/embeddings";

async function main() {
  if (!embeddingConfigured()) {
    console.error("GEMINI_API_KEY is not set — nothing to do.");
    process.exitCode = 1;
    return;
  }
  const written = await backfillProductEmbeddings();
  console.log(`Embedded ${written} products.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => { console.error(err); process.exit(1); });
