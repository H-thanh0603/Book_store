/**
 * Import scraped Tiki books (var/tiki_books.json — from scripts/scrape_tiki.py)
 * into the bookstore DB, following the same shapes as prisma/seed.ts.
 * Idempotent: skips products whose Tiki id is already recorded (bookmark file)
 * and any SKU/barcode collision.
 *
 * Run: npx tsx scripts/import-tiki.ts
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { prisma } from "../src/lib/db";

type TikiBook = {
  id: number; name: string; price: number; authors: string; publisher: string;
  pages: string; cover: string; isbn: string; category: string;
  quantity_sold: number; url: string; image: string;
};

const BOOKMARK = "var/tiki_imported.json"; // tiki ids already imported
const DATA = "var/tiki_books.json";

async function main() {
  const books: TikiBook[] = JSON.parse(readFileSync(DATA, "utf8"));
  const done: number[] = existsSync(BOOKMARK) ? JSON.parse(readFileSync(BOOKMARK, "utf8")) : [];
  const doneSet = new Set(done);
  console.log(`scraped: ${books.length}, already imported: ${doneSet.size}`);

  const bookCat = await prisma.category.findFirstOrThrow({ where: { name: "Sách", parentId: null } });
  const retail = await prisma.priceList.findUniqueOrThrow({ where: { name: "RETAIL" } });
  const whLoc = await prisma.stockLocation.findFirstOrThrow({ where: { type: "WAREHOUSE" } });
  const stockrooms = await prisma.stockLocation.findMany({ where: { type: "STORE_STOCKROOM" } });

  // attribute defs for category Sách (created by prisma/seed.ts)
  const attrDefs: Record<string, string> = {};
  for (const code of ["isbn", "author_name", "publisher_name", "pages", "cover"]) {
    const d = await prisma.attributeDefinition.findUnique({
      where: { categoryId_code: { categoryId: bookCat.id, code } },
    });
    if (d) attrDefs[code] = d.id;
  }

  async function findOrCreateAuthor(name: string) {
    const existing = await prisma.author.findFirst({ where: { name } });
    return existing?.id ?? (await prisma.author.create({ data: { name } })).id;
  }
  async function findOrCreatePublisher(name: string) {
    const existing = await prisma.publisher.findFirst({ where: { name } });
    return existing?.id ?? (await prisma.publisher.create({ data: { name } })).id;
  }

  let imported = 0, skipped = 0;
  for (const b of books) {
    if (doneSet.has(b.id)) { skipped++; continue; }
    const sku = `TKI-${b.id}`;
    if (await prisma.productVariant.findUnique({ where: { sku } })) { skipped++; continue; }
    // strip Tiki suffixes like " - NXB Trẻ" from display name
    const name = b.name.replace(/\s+-\s+NXB\s+\S+.*$/, "").trim() || b.name;

    const authorId = b.authors ? await findOrCreateAuthor(b.authors) : null;
    const publisherId = b.publisher ? await findOrCreatePublisher(b.publisher) : null;
    const product = await prisma.product.create({
      data: {
        name, status: "active", categoryId: bookCat.id,
        authorId, publisherId, taxRate: 0.08,
        description: `Nguồn: ${b.url}`,
        imageUrl: b.image || null,
        variants: {
          create: {
            sku, name: "Default",
            barcodes: { create: { barcode: b.isbn, type: "ISBN" } },
          },
        },
      },
      include: { variants: true },
    });
    const variant = product.variants[0];
    await prisma.price.create({ data: { variantId: variant.id, priceListId: retail.id, amount: BigInt(b.price) } });
    for (const [code, value] of [
      ["isbn", b.isbn], ["author_name", b.authors], ["publisher_name", b.publisher],
      ["pages", b.pages], ["cover", b.cover],
    ] as [string, string][]) {
      if (attrDefs[code] && value)
        await prisma.attributeValue.create({ data: { variantId: variant.id, definitionId: attrDefs[code], value } });
    }
    // stock: proportional to sales popularity, seeded rng not needed
    const stock = 5 + Math.min(40, Math.floor(b.quantity_sold / 20));
    for (const loc of [whLoc, ...stockrooms]) {
      await prisma.inventoryBalance.create({ data: { variantId: variant.id, locationId: loc.id, onHand: stock } });
    }
    done.push(b.id);
    imported++;
  }

  writeFileSync(BOOKMARK, JSON.stringify(done));
  console.log(`imported: ${imported}, skipped: ${skipped}, total products now:`,
    await prisma.product.count());
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
