// Embedding lib self-check. Run: npx tsx scripts/test-embeddings.ts
// With GEMINI_API_KEY set: verifies a real 768-dim vector comes back.
// Without: verifies graceful null (search/recommendations keep working).
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { embedText, embeddingConfigured } from "../src/lib/embeddings";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`✅ ${name}`);
  else { failures++; console.error(`❌ ${name}`, detail ?? ""); }
}

async function main() {
  const vec = await embedText("sách thiếu nhi phiêu lưu");
  if (embeddingConfigured()) {
    check("embedText returns 768 dims", vec?.length === 768, `len=${vec?.length}`);
  } else {
    check("embedText degrades to null without key", vec === null);
    console.log("⏭️ set GEMINI_API_KEY to exercise the live path");
  }
}

main()
  .then(() => {
    process.exitCode = failures ? 1 : 0;
    if (failures) throw new Error(`${failures} check(s) failed`);
    console.log("All checks passed.");
    return prisma.$disconnect();
  })
  .catch((err) => { console.error(err); process.exit(1); });
