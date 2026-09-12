#!/usr/bin/env tsx
// fetch-covers.ts — download real book covers for products that carry an ISBN
// attribute and have no imageUrl yet.
//
// Source: Open Library Covers API (covers.openlibrary.org) — free for any use,
// no key needed. We deliberately do NOT scrape retailer sites (Tiki/Fahasa):
// their ToS forbid it and their CDNs block hotlinking, so scraped URLs rot.
// Files land in public/products/<productId>.jpg and Product.imageUrl points
// at the local path — no external dependency at page-render time.
//
// Non-book categories (VPP/toys/gifts) have no ISBN: they keep the typographic
// cover cards. Run: DATABASE_URL=... npx tsx scripts/ops/fetch-covers.ts
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../../src/lib/db";

const OUT_DIR = join(process.cwd(), "public", "products");
const SIZES = ["L", "M"] as const;

async function fetchCover(isbn: string): Promise<Buffer | null> {
  const digits = isbn.replace(/[^0-9Xx]/g, "");
  for (const size of SIZES) {
    const url = `https://covers.openlibrary.org/b/isbn/${digits}-${size}.jpg?default=false`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      // default=false → 404 when Open Library has no cover (no 1px placeholder).
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      // Reject tiny error images (< 2KB can't be a real cover).
      if (buf.length < 2048) continue;
      return buf;
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { imageUrl: null, status: "active" },
    select: {
      id: true,
      name: true,
      variants: {
        select: {
          attributes: {
            where: { definition: { code: "isbn" } },
            select: { value: true },
            take: 1,
          },
        },
        take: 1,
      },
    },
  });
  console.log(`products without image: ${products.length}`);
  await mkdir(OUT_DIR, { recursive: true });
  let ok = 0;
  let missing = 0;
  for (const p of products) {
    const isbn = p.variants[0]?.attributes[0]?.value;
    if (!isbn) {
      missing++;
      continue;
    }
    const buf = await fetchCover(isbn);
    if (!buf) {
      missing++;
      console.log(`  no cover: ${p.name} (${isbn})`);
      continue;
    }
    const filename = `${p.id}.jpg`;
    await writeFile(join(OUT_DIR, filename), buf);
    await prisma.product.update({
      where: { id: p.id },
      data: { imageUrl: `/products/${filename}` },
    });
    ok++;
    if (ok % 10 === 0) console.log(`  ...${ok} downloaded`);
  }
  console.log(`done: ${ok} covers downloaded, ${missing} without ISBN/cover (keep typographic cards)`);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
