// Agent 2: seed extension — idempotent top-up to spec §2358 baseline:
// 100–500 products, 20 suppliers, 100 customers. Run after the Phase-1 seed;
// safe to run twice (upsert / find-or-create everywhere).
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(new pg.Pool({ connectionString: process.env.DATABASE_URL })),
});

// Deterministic PRNG so two runs produce identical data
let s = 42;
const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

async function main() {
  // ── Suppliers: upsert to 20 ──────────────────────────────
  const supplierNames = [
    ["SUP-NKD", "NXB Kim Đồng"], ["SUP-NXT", "NXB Trẻ"], ["SUP-TL", "Công ty TNHH Thiên Long"],
    ["SUP-LEGO", "LEGO Vietnam"], ["SUP-PH", "Phương Nam Book"], ["SUP-HNV", "NXB Hội Nhà Văn"],
    ["SUP-FAHASA", "Fahasa"], ["SUP-TIKI", "Tiki Trading"], ["SUP-DH", "Đinh Tị Books"],
    ["SUP-ALPHA", "Alpha Books"], ["SUP-FIRSTNEWS", "First News - Trí Việt"], ["SUP-NAMVIET", "Nam Việt Books"],
    ["SUP-CQTD", "Nhà sách Cá Chép"], ["SUP-VIETBOOK", "VietBook Distribution"], ["SUP-PAPERWORLD", "Paperworld VN"],
    ["SUP-DELi", "Deli Stationery"], ["SUP-COLOKIT", "Colokit VN"], ["SUP-TOYWorld", "Toy World Saigon"],
    ["SUP-MONTOY", "Montoy Toys"], ["SUP-GIFTBOX", "Giftbox Studio"],
  ];
  const terms = ["NET15", "NET30", "NET45"];
  const suppliers: string[] = [];
  for (const [code, name] of supplierNames) {
    const sup = await prisma.supplier.upsert({
      where: { code },
      create: {
        code, name, taxCode: `03${String(Math.floor(rand() * 1e8)).padStart(8, "0")}`,
        paymentTerms: pick(terms), leadTimeDays: 3 + Math.floor(rand() * 18),
        email: `sales@${code.toLowerCase().replace("sup-", "")}.vn`,
      },
      update: {},
    });
    suppliers.push(sup.id);
  }

  // ── Customers: upsert to 100 ─────────────────────────────
  for (let i = 31; i <= 100; i++) {
    const code = `CUS-${String(i).padStart(6, "0")}`;
    const existing = await prisma.customer.findUnique({ where: { code } });
    if (existing) continue;
    const c = await prisma.customer.create({
      data: {
        code,
        name: `Khách hàng ${i}`,
        phone: `090${String(2000000 + i * 313).slice(0, 7)}`,
      },
    });
    await prisma.loyaltyAccount.create({ data: { customerId: c.id, points: i * 2, tier: i > 80 ? "Gold" : i > 50 ? "Silver" : "Member" } });
  }

  // ── Products: generate to ≥120 total ────────────────────
  const cats = await prisma.category.findMany();
  const brands = await prisma.brand.findMany();
  const authors = await prisma.author.findMany();
  const pubs = await prisma.publisher.findMany();
  const retail = await prisma.priceList.findFirstOrThrow({ where: { kind: "retail" } });

  const bookTitles = [
    "Mãi Mới Hiểu Ra", "Nhà Giả Kim", "Muôn Kiếp Nhân Sinh", "Đắc Nhân Tâm", "Nhật Ký Của Bé",
    "Doraemon Tập", "Thám Tử Lừng Danh Conan Tập", "Rừng Na Uy", "Không Gia Đình", "Bố Già",
    "Tuổi Trẻ Đáng Giá Bao Nhiêu", "Cà Phê Cùng Tony", "Truyện Kiều", "Chí Phèo", "Vợ Nhặt",
    "Lão Hạc", "Tắt Đèn", "Số Đỏ", "O Chuột", "Chú Teun Teun",
  ];
  const stationery = [
    "Bút chì gỗ", "Thước kẻ 30cm", "Gôm tẩy", "Kéo học sinh", "Băng keo trong", "Sổ tay A5",
    "Bút dạ quang", "Bút máy", "Hộp bút", "Compà", "Giấy note", "Bút lông bảng",
  ];
  const toys = ["Khối xếp hình gỗ", "Xe điều khiển", "Puzzle 100 mảnh", "Đồ chơi lắp ráp", "Búp bê", "Siêu nhân"];
  const others = ["Bình nước 500ml", "Hộp cơm giữ nhiệt", "Ô dù gấp gọn", "Túi vải canvas", "Ly sứ in hình"];

  type Gen = { skuPrefix: string; names: string[]; catName: string; basePrice: number };
  const gens: Gen[] = [
    { skuPrefix: "BK2", names: bookTitles, catName: "Sách", basePrice: 75000 },
    { skuPrefix: "VPP2", names: stationery, catName: "Văn phòng phẩm", basePrice: 25000 },
    { skuPrefix: "TOY2", names: toys, catName: "Đồ chơi", basePrice: 199000 },
    { skuPrefix: "LS2", names: others, catName: "Lifestyle", basePrice: 89000 },
  ];
  let created = 0;
  const TARGET_TOTAL = 120;
  let existingCount = await prisma.product.count();
  outer:
  for (const g of gens) {
    for (let n = 0; n < g.names.length; n++) {
      for (let vol = 1; vol <= 4; vol++) {
        if (existingCount >= TARGET_TOTAL) break outer;
        const title = `${g.names[n]}${vol > 1 ? ` — Tập ${vol}` : ""}`;
        const sku = `${g.skuPrefix}-${String(n + 1).padStart(2, "0")}-${vol}`;
        if (await prisma.productVariant.findUnique({ where: { sku } })) { existingCount++; continue; }
        const cat = cats.find((c) => c.name === g.catName) ?? cats[0];
        const price = Math.round((g.basePrice + Math.floor(rand() * g.basePrice)) / 1000) * 1000;
        const product = await prisma.product.create({
          data: {
            name: title,
            status: "active",
            categoryId: cat.id,
            brandId: g.catName !== "Sách" && brands.length ? pick(brands).id : null,
            authorId: g.catName === "Sách" && authors.length ? pick(authors).id : null,
            publisherId: g.catName === "Sách" && pubs.length ? pick(pubs).id : null,
            taxRate: 0.08,
            variants: {
              create: {
                sku, name: "Default",
                barcodes: { create: { barcode: `89${String(Math.floor(rand() * 1e10)).padStart(10, "0")}`, type: "EAN13" } },
              },
            },
          },
          include: { variants: true },
        });
        await prisma.price.create({ data: { variantId: product.variants[0].id, priceListId: retail.id, amount: BigInt(price) } });
        created++;
        existingCount++;
      }
    }
  }

  // ── Supplier-product price history: one entry per supplier × a sample of variants
  const variants = await prisma.productVariant.findMany({ take: 60, orderBy: { createdAt: "asc" }, select: { id: true } });
  let priceRows = 0;
  for (const sup of suppliers.slice(0, 10)) {
    for (const v of variants.slice(0, 6)) {
      const exists = await prisma.supplierProductPrice.findFirst({ where: { supplierId: sup, variantId: v.id } });
      if (exists) continue;
      await prisma.supplierProductPrice.create({
        data: { supplierId: sup, variantId: v.id, unitCost: BigInt(20000 + Math.floor(rand() * 150000)) },
      });
      priceRows++;
    }
  }

  console.log("Seed-ext done:", { suppliers: suppliers.length, newProducts: created, totalProducts: existingCount, customers: await prisma.customer.count(), priceHistoryRows: priceRows });
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
