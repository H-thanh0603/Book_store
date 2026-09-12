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
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (MelioBookstore/1.0; +cover-fetch)";

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

// Tiki public catalog API (no auth) — used ONLY as a fallback for Vietnamese
// titles Open Library doesn't carry. Covers are DOWNLOADED to our own
// /public (never hotlinked), one request per ~500ms, and every match is
// logged so a human can spot mismatches.
//
// WARNING for production: retailer images are placeholders. Before any
// commercial use, replace them with publisher/supplier-provided files —
// check "Housekeeping — demo dataset policy" in docs/OPERATIONS.md.
async function fetchCoverTiki(query: string): Promise<{ buf: Buffer; matched: string } | null> {
  // Retry with backoff: the catalog API rate-limits bursts (429s) — a single
  // failed attempt must not condemn the product to "no cover".
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(
        `https://tiki.vn/api/v2/products?q=${encodeURIComponent(query)}&limit=3`,
        { signal: ctrl.signal, headers: { "User-Agent": UA } }
      );
      if (res.status === 429) continue; // retry below
      if (!res.ok) return null;
      const data = (await res.json()) as { data?: { name?: string; thumbnail_url?: string }[] };
      if ((data.data ?? []).length === 0) return null; // genuine no-match, don't retry
      for (const item of data.data ?? []) {
        if (!item.thumbnail_url) continue;
        // Prefer a larger render when the cache pattern allows it.
        const big = item.thumbnail_url.replace("/cache/280x280/", "/cache/750x750/");
        for (const url of [big, item.thumbnail_url]) {
          const img = await fetch(url, { headers: { "User-Agent": UA } });
          if (!img.ok) continue;
          const buf = Buffer.from(await img.arrayBuffer());
          if (buf.length < 2048) continue;
          return { buf, matched: item.name ?? "?" };
        }
      }
      return null;
    } catch {
      continue; // network hiccup — retry
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const limit = Number(process.env.COVER_LIMIT ?? 0) || Infinity;
  const all = await prisma.product.findMany({
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
  const products = all.slice(0, limit);
  console.log(`products without image: ${all.length} (processing ${products.length})`);
  await mkdir(OUT_DIR, { recursive: true });
  let ok = 0;
  let missing = 0;
  for (const p of products) {
    const isbn = p.variants[0]?.attributes[0]?.value;
    let buf: Buffer | null = null;
    let source = "";
    if (isbn) {
      buf = await fetchCover(isbn);
      if (buf) source = `openlibrary (${isbn})`;
    }
    if (!buf) {
      // Fallback: Tiki catalog search — ISBN first (precise), then title.
      // Strip generated volume suffixes (" — Tập 2") that never match retail.
      const baseTitle = p.name.replace(/\s+—\s*Tập\s*\d+\s*$/u, "").trim();
      const queries = isbn
        ? [isbn.replace(/[^0-9Xx]/g, ""), baseTitle]
        : [baseTitle];
      for (const q of queries) {
        const hit = await fetchCoverTiki(q);
        await sleep(1000); // politeness delay between retailer requests
        if (hit) {
          buf = hit.buf;
          source = `tiki ("${q}" → "${hit.matched}")`;
          break;
        }
      }
    }
    if (!buf) {
      missing++;
      console.log(`  no cover: ${p.name}${isbn ? ` (${isbn})` : ""}`);
      continue;
    }
    const filename = `${p.id}.jpg`;
    await writeFile(join(OUT_DIR, filename), buf);
    await prisma.product.update({
      where: { id: p.id },
      data: { imageUrl: `/products/${filename}` },
    });
    ok++;
    console.log(`  ✓ ${p.name} ← ${source}`);
  }
  console.log(`done: ${ok} covers downloaded, ${missing} without cover (keep typographic cards)`);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
