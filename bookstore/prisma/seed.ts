// Phase 1 seed — realistic Vietnamese bookstore data (spec §68).
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { scryptSync, randomBytes } from "crypto";

const prisma = new PrismaClient({
  adapter: new PrismaPg(new pg.Pool({ connectionString: process.env.DATABASE_URL })),
});

function hash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const seedUserPassword = (() => {
  const value = process.env.SEED_USER_PASSWORD;
  if (!value || value.length < 12)
    throw new Error("SEED_USER_PASSWORD must be set to at least 12 characters");
  return value;
})();

const PERMS = [
  "product.view", "product.update", "inventory.view", "inventory.adjust",
  "inventory.transfer", "pos.sell", "pos.refund", "pos.override_price",
  "purchase.create", "purchase.approve", "purchase.receive",
  "customer.view", "customer.update", "promotion.manage",
  "reports.financial.view", "reports.store.view", "admin.users", "admin.config",
];

const ROLE_PERMS: Record<string, string[]> = {
  cashier: ["product.view", "inventory.view", "pos.sell", "pos.refund", "customer.view", "customer.update"],
  sales: ["product.view", "inventory.view", "inventory.transfer", "customer.view"],
  warehouse: ["product.view", "inventory.view", "inventory.adjust", "inventory.transfer", "purchase.receive"],
  store_manager: ["product.view", "product.update", "inventory.view", "inventory.adjust", "inventory.transfer", "pos.sell", "pos.refund", "purchase.create", "customer.view", "promotion.manage", "reports.store.view"],
  purchasing: ["product.view", "inventory.view", "purchase.create", "purchase.approve", "purchase.receive", "reports.store.view"],
  admin: PERMS,
  owner: PERMS,
};

async function getOrCreateOrg() {
  let org = await prisma.organization.findFirst({ where: { name: "Nhà Sách Melio" } });
  if (!org) org = await prisma.organization.create({ data: { name: "Nhà Sách Melio" } });
  let region = await prisma.region.findFirst({ where: { name: "Miền Nam", orgId: org.id } });
  if (!region) region = await prisma.region.create({ data: { name: "Miền Nam", orgId: org.id } });
  return { org, region };
}

// Agent 2: idempotent seed — every create below is guarded by a unique-key lookup
// (code/sku/barcode/name) so running the seed twice is a no-op.
async function main() {
  // Production guard: seeding creates well-known demo accounts — never run it
  // against a production database without an explicit override flag.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED_PRODUCTION !== "true")
    throw new Error(
      "Refusing to seed a production database. Set ALLOW_SEED_PRODUCTION=true only if you understand demo accounts will exist."
    );
  const { region } = await getOrCreateOrg();
  // Permissions + roles
  const perms = await Promise.all(
    PERMS.map((code) => prisma.permission.upsert({ where: { code }, create: { code }, update: {} }))
  );
  for (const [roleName, codes] of Object.entries(ROLE_PERMS)) {
    const role = await prisma.role.upsert({ where: { name: roleName }, create: { name: roleName }, update: {} });
    for (const code of codes) {
      const p = perms.find((x) => x.code === code)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
        create: { roleId: role.id, permissionId: p.id },
        update: {},
      });
    }
  }

  const storeNames = [
    ["NH", "Nhà sách Nguyễn Huệ"], ["TD", "Nhà sách Tân Định"],
    ["BT", "Nhà sách Bình Thạnh"], ["QT", "Nhà sách Quận 7"], ["GV", "Nhà sách Gò Vấp"],
  ];
  const stores = [];
  for (const [code, name] of storeNames) {
    let store = await prisma.store.findUnique({ where: { code } });
    if (!store) {
      store = await prisma.store.create({ data: { code, name, regionId: region.id } });
      const stockroom = await prisma.stockLocation.create({ data: { name: `${name} — Kho sau`, type: "STORE_STOCKROOM", storeId: store.id } });
      await prisma.stockLocation.create({ data: { name: `${name} — Kệ A`, type: "STORE_SHELF", storeId: store.id, parentId: stockroom.id } });
      await prisma.posTerminal.create({ data: { storeId: store.id, name: `POS-${code}-01` } });
    }
    const stockroom2 = await prisma.stockLocation.findFirstOrThrow({
      where: { storeId: store.id, type: "STORE_STOCKROOM" },
    });
    stores.push({ store, stockroom: stockroom2 });
  }
  let warehouse = await prisma.warehouse.findFirst({ where: { name: "Kho Trung Tâm" } });
  if (!warehouse) warehouse = await prisma.warehouse.create({ data: { name: "Kho Trung Tâm", isCentral: true } });
  let whLoc = await prisma.stockLocation.findFirst({ where: { warehouseId: warehouse.id, type: "WAREHOUSE" } });
  if (!whLoc) whLoc = await prisma.stockLocation.create({ data: { name: "Kho Trung Tâm — Main", type: "WAREHOUSE", warehouseId: warehouse.id } });

  // Users
  const users = [
    ["owner@melio.vn", "owner", null],
    ["manager.nh@melio.vn", "store_manager", stores[0].store.id],
    ["cashier.nh@melio.vn", "cashier", stores[0].store.id],
    ["warehouse@melio.vn", "warehouse", null],
    ["purchasing@melio.vn", "purchasing", null],
  ] as const;
  for (const [email, role, storeId] of users) {
    const passwordHash = hash(seedUserPassword);
    // Create-only: re-seeding must NEVER reset an existing account's password
    // (that would silently hand production owner access to whoever ran seed).
    // Local dev: delete the user row if you need a fresh password.
    const u = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash },
      update: {},
    });
    const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
    await prisma.userRole.upsert({
      where: { userId_roleId_scopeKey: { userId: u.id, roleId: r.id, scopeKey: storeId ?? "*" } },
      create: { userId: u.id, roleId: r.id, storeId, scopeKey: storeId ?? "*" },
      update: {},
    });
  }

  // Categories + attributes
  const cats: Record<string, string> = {};
  for (const name of ["Sách", "Văn phòng phẩm", "Đồ chơi", "Lifestyle", "Mỹ thuật", "Quà tặng"]) {
    let c = await prisma.category.findFirst({ where: { name, parentId: null } });
    if (!c) c = await prisma.category.create({ data: { name } });
    cats[name] = c.id;
  }
  const bookCat = cats["Sách"];
  for (const name of ["Văn học", "Kinh tế", "Thiếu nhi", "Manga"]) {
    let c = await prisma.category.findFirst({ where: { name, parentId: bookCat } });
    if (!c) c = await prisma.category.create({ data: { name, parentId: bookCat } });
    cats[name] = c.id;
  }
  const attrDefs: Record<string, string> = {};
  for (const [cat, attrs] of Object.entries({
    "Sách": [["isbn", "ISBN", "text"], ["author_name", "Tác giả", "text"], ["publisher_name", "NXB", "text"], ["pages", "Số trang", "integer"], ["cover", "Loại bìa", "enum", ["Bìa mềm", "Bìa cứng"]]],
    "Văn phòng phẩm": [["color", "Màu", "text"], ["brand_name", "Thương hiệu", "text"]],
    "Đồ chơi": [["age_range", "Độ tuổi", "enum", ["3+", "6+", "12+"]], ["character", "Nhân vật", "text"]],
  } as Record<string, [string, string, string, string[]?][]>)) {
    for (const [code, label, type, enums] of attrs) {
      let d = await prisma.attributeDefinition.findUnique({ where: { categoryId_code: { categoryId: cats[cat], code } } });
      if (!d) d = await prisma.attributeDefinition.create({
        data: { categoryId: cats[cat], code, label, type, enumValues: enums ?? [] },
      });
      attrDefs[code] = d.id;
    }
  }

  // Brands / authors / publishers
  const brands: Record<string, string> = {};
  for (const n of ["Double A", "Thiên Long", "LEGO", "Sanrio"]) {
    let b = await prisma.brand.findUnique({ where: { name: n } });
    if (!b) b = await prisma.brand.create({ data: { name: n } });
    brands[n] = b.id;
  }
  const authors: Record<string, string> = {};
  for (const n of ["Nguyễn Nhật Ánh", "Tô Hoài", "J.K. Rowling"]) {
    let a = await prisma.author.findFirst({ where: { name: n } });
    if (!a) a = await prisma.author.create({ data: { name: n } });
    authors[n] = a.id;
  }
  const pubs: Record<string, string> = {};
  for (const n of ["NXB Kim Đồng", "NXB Trẻ", "NXB Hội Nhà Văn"]) {
    let p = await prisma.publisher.findFirst({ where: { name: n } });
    if (!p) p = await prisma.publisher.create({ data: { name: n } });
    pubs[n] = p.id;
  }

  // Price list
  let retail = await prisma.priceList.findUnique({ where: { name: "RETAIL" } });
  if (!retail) retail = await prisma.priceList.create({ data: { name: "RETAIL", kind: "retail" } });
  for (const [name, kind] of [["MEMBER", "member"], ["ONLINE", "online"]] as const) {
    if (!(await prisma.priceList.findUnique({ where: { name } })))
      await prisma.priceList.create({ data: { name, kind } });
  }

  // Products — real Vietnamese bookstore items
  type SeedP = { name: string; cat: string; brand?: string; author?: string; pub?: string; sku: string; barcode: string; price: number; attrs?: [string, string][] };
  const products: SeedP[] = [
    { name: "Dế Mèn Phiêu Lưu Ký", cat: "Sách", author: "Tô Hoài", pub: "NXB Kim Đồng", sku: "BK-DEMEN-01", barcode: "9786042089131", price: 89000, attrs: [["isbn", "978-604-2-08913-1"], ["author_name", "Tô Hoài"], ["publisher_name", "NXB Kim Đồng"], ["pages", "288"], ["cover", "Bìa mềm"]] },
    { name: "Tôi Thấy Hoa Vàng Trên Cỏ Xanh", cat: "Sách", author: "Nguyễn Nhật Ánh", pub: "NXB Trẻ", sku: "BK-HOAVANG-01", barcode: "9786042096436", price: 118000, attrs: [["isbn", "978-604-2-09643-6"], ["author_name", "Nguyễn Nhật Ánh"], ["publisher_name", "NXB Trẻ"], ["pages", "352"], ["cover", "Bìa mềm"]] },
    { name: "Harry Potter và Hòn Đá Phù Thủy", cat: "Sách", author: "J.K. Rowling", pub: "NXB Hội Nhà Văn", sku: "BK-HP1-VN", barcode: "9786042133261", price: 189000, attrs: [["isbn", "978-604-2-13326-1"], ["author_name", "J.K. Rowling"], ["publisher_name", "NXB Hội Nhà Văn"], ["pages", "448"], ["cover", "Bìa cứng"]] },
    { name: "One Piece Tập 101", cat: "Sách", sku: "BK-OP-101", barcode: "9786042110019", price: 39000, attrs: [["isbn", "978-604-2-11001-9"], ["cover", "Bìa mềm"]] },
    { name: "Bút bi Thiên Long TL-027 (hộp 20)", cat: "Văn phòng phẩm", brand: "Thiên Long", sku: "VPP-TL027-20", barcode: "8934563100271", price: 62000, attrs: [["brand_name", "Thiên Long"], ["color", "Xanh"]] },
    { name: "Giấy A4 Double A 70gsm (500 tờ)", cat: "Văn phòng phẩm", brand: "Double A", sku: "VPP-DA-A4-70", barcode: "8851561100704", price: 58000, attrs: [["brand_name", "Double A"]] },
    { name: "Vở ô ly 200 trang", cat: "Văn phòng phẩm", sku: "VPP-VO-200OL", barcode: "8936000001234", price: 25000 },
    { name: "LEGO Classic Creative Bricks 11002", cat: "Đồ chơi", brand: "LEGO", sku: "TOY-LEGO-11002", barcode: "5702016110228", price: 899000, attrs: [["age_range", "6+"], ["character", "LEGO Classic"]] },
    { name: "Gấu bông Hello Kitty 30cm", cat: "Đồ chơi", brand: "Sanrio", sku: "TOY-HK-30", barcode: "8938500004567", price: 259000, attrs: [["character", "Hello Kitty"]] },
    { name: "Bộ màu nước 12 màu", cat: "Mỹ thuật", sku: "MT-MAUNUOC-12", barcode: "8936000005678", price: 78000 },
    { name: "Balo học sinh 20L", cat: "Lifestyle", sku: "LS-BALO-20-BLK", barcode: "8936000009012", price: 349000 },
    { name: "Bộ quà Tết: sổ tay + bookmark", cat: "Quà tặng", sku: "GT-BOX-TET01", barcode: "8936000003456", price: 159000 },
  ];

  const variantIds: Record<string, string> = {};
  for (const p of products) {
    // idempotent: skip if SKU already exists
    let variant = await prisma.productVariant.findUnique({ where: { sku: p.sku } });
    if (!variant) {
      const product = await prisma.product.create({
        data: {
          name: p.name,
          status: "active",
          categoryId: cats[p.cat],
          brandId: p.brand ? brands[p.brand] : null,
          authorId: p.author ? authors[p.author] : null,
          publisherId: p.pub ? pubs[p.pub] : null,
          taxRate: 0.08,
          variants: {
            create: { sku: p.sku, name: "Default", barcodes: { create: { barcode: p.barcode, type: p.cat === "Sách" ? "ISBN" : "EAN13" } } },
          },
        },
        include: { variants: true },
      });
      variant = product.variants[0];
      for (const [code, value] of p.attrs ?? []) {
        if (attrDefs[code])
          await prisma.attributeValue.create({ data: { variantId: variant.id, definitionId: attrDefs[code], value } });
      }
    }
    variantIds[p.sku] = variant.id;
    // price: only insert when no retail price exists yet (unique on variant+list+validFrom)
    const hasPrice = await prisma.price.findFirst({
      where: { variantId: variant.id, priceListId: retail.id, validTo: null },
    });
    if (!hasPrice)
      await prisma.price.create({ data: { variantId: variant.id, priceListId: retail.id, amount: BigInt(p.price) } });
  }

  // Inventory: stock in warehouse + each store stockroom
  const skus = Object.keys(variantIds);
  for (const { stockroom } of stores) {
    for (const sku of skus) {
      // idempotent: upsert on (variant, location)
      await prisma.inventoryBalance.upsert({
        where: { variantId_locationId: { variantId: variantIds[sku], locationId: stockroom.id } },
        create: { variantId: variantIds[sku], locationId: stockroom.id, onHand: 15 + Math.floor(Math.random() * 40) },
        update: {},
      });
    }
  }
  for (const sku of skus) {
    await prisma.inventoryBalance.upsert({
      where: { variantId_locationId: { variantId: variantIds[sku], locationId: whLoc.id } },
      create: { variantId: variantIds[sku], locationId: whLoc.id, onHand: 100 + Math.floor(Math.random() * 200) },
      update: {},
    });
  }

  // Suppliers — spec baseline §2360: at least 20
  const suppliers: string[] = [];
  const supplierData: [string, string, string, string, number][] = [
    ["SUP-NKD", "NXB Kim Đồng", "0300123456", "NET30", 7],
    ["SUP-NXT", "NXB Trẻ", "0300234567", "NET30", 5],
    ["SUP-TL", "Công ty TNHH Thiên Long", "0300345678", "NET15", 3],
    ["SUP-LEGO", "LEGO Vietnam", "0300456789", "NET45", 21],
    ["SUP-PH", "Phương Nam Book", "0300567890", "NET30", 7],
    ["SUP-FAHASA", "CTCP Phát hành Sách TP.HCM - Fahasa", "0300581231", "NET30", 10],
    ["SUP-DGT", "Đông A Times", "0305123456", "NET15", 5],
    ["SUP-ALPHA", "NXB Alpha Books", "0102894567", "NET30", 7],
    ["SUP-TRETP", "NXB Thanh Niên", "0300987654", "NET30", 7],
    ["SUP-LAOCT", "NXB Lao Động", "0102134567", "NET30", 10],
    ["SUP-HNV", "NXB Hội Nhà Văn", "0102345678", "NET30", 12],
    ["SUP-COLORME", "ColorME Art Supplies", "0312567890", "NET15", 3],
    ["SUP-BENNGOAI", "Văn phòng phẩm Bến Ngọa", "0312678901", "NET15", 2],
    ["SUP-DELMAS", "Delmas Stationery Import", "0312789012", "NET30", 14],
    ["SUP-SCHOLASTIC", "Scholastic Vietnam", "0070456789", "NET60", 30],
    ["SUP-KIMDONGTOY", "Kim Đồng Toy & Gift", "0300890123", "NET30", 15],
    ["SUP-MONKEY", "Monkey Edu Toys", "0312890123", "NET15", 7],
    ["SUP-GO", "Công ty Gốm men Việt", "3501234567", "NET15", 10],
    ["SUP-BAGVN", "Balo Sài Gòn", "0312901234", "NET15", 5],
    ["SUP-QUATANG", "Quà Tết Việt", "0312012345", "NET30", 20],
  ];
  for (const [code, name, taxCode, terms, lead] of supplierData) {
    const s = await prisma.supplier.upsert({
      where: { code },
      create: { code, name, taxCode, paymentTerms: terms, leadTimeDays: lead, email: `sales@${code.toLowerCase()}.vn` },
      update: {},
    });
    suppliers.push(s.id);
  }

  // Customers — spec baseline §2361: at least 100
  for (let i = 1; i <= 100; i++) {
    const code = `CUS-${String(i).padStart(6, "0")}`;
    let c = await prisma.customer.findUnique({ where: { code } });
    if (!c) {
      c = await prisma.customer.create({
        data: {
          code,
          name: `Khách hàng ${i}`,
          phone: `090${String(1000000 + i * 137).slice(0, 7)}`,
        },
      });
      await prisma.loyaltyAccount.create({ data: { customerId: c.id, points: i * 3, tier: i > 80 ? "Gold" : i > 50 ? "Silver" : "Member" } });
    }
  }

  // Promotions (idempotent by name)
  if (!(await prisma.promotion.findFirst({ where: { name: "Mua 2 manga giảm 10%" } })))
    await prisma.promotion.create({
      data: {
        name: "Mua 2 manga giảm 10%",
        type: "percentage", value: 10n, minQty: 2,
        categoryId: cats["Sách"], channel: "ALL", stackable: false,
        endAt: new Date(Date.now() + 90 * 86400_000),
      },
    });
  if (!(await prisma.promotion.findFirst({ where: { name: "Thành viên Gold giảm 5% toàn bộ" } })))
    await prisma.promotion.create({
      data: {
        name: "Thành viên Gold giảm 5% toàn bộ",
        type: "percentage", value: 5n, memberOnly: true, stackable: true, priority: 5,
        endAt: new Date(Date.now() + 365 * 86400_000),
      },
    });

  // Bulk product generator — spec baseline §2358: 100–500 products.
  // Deterministic combos so re-seeding is a no-op via SKU lookup above.
  const bookTitles = ["Nhật ký Đặng Thùy Trâm", "Mắt Biếc", "Cây Cam Ngọt Của Tôi", "Sapiens", "Atomic Habits", "Đắc Nhân Tâm", "Nhà Giả Kim", "Tuổi Trẻ Đáng Giá Bao Nhiêu", "Cha Giàu Cha Nghèo", "Tâm Lý Học Tiền Bạc"];
  const stationery = ["Bút gel Thiên Long TL-08", "Bút chì 2B", "Gôm tẩy", "Thước kẻ 30cm", "Compas vẽ tròn", "Hộp bút nhựa", "Sổ tay A6 cứng", "Sticker trang trí", "Keo sữa nhỏ", "Kéo học sinh"];
  const toys = ["Xe điều khiển từ xa", "Bộ lego thành phố", "Rubik 3x3", "Đồ chơi xếp hình 100 mảnh", "Bóng đá mini", "Yo-yo chuyên nghiệp", "Bộ thí nghiệm khoa học", "Gấu bông Doremon"];
  const catPool: [string, string[], number][] = [
    ["Sách", bookTitles, 79000],
    ["Văn phòng phẩm", stationery, 32000],
    ["Đồ chơi", toys, 199000],
  ];
  for (const [catName, titles, basePrice] of catPool) {
    for (let i = 0; i < titles.length; i++) {
      const title = titles[i];
      for (let vol = 1; vol <= 5; vol++) {
        const sku = `GEN-${catName.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(2, "0")}-V${vol}`;
        if (variantIds[sku]) continue;
        const name = `${title} — Tập ${vol}`;
        const barcode = `8936000${String(7000000 + Object.keys(variantIds).length * 13).padStart(7, "0")}`.slice(0, 13);
        variantIds[sku] = await seedGeneratedVariant(sku, name, barcode, cats[catName], basePrice + vol * 5000, retail.id);
      }
    }
  }
  async function seedGeneratedVariant(sku: string, name: string, barcode: string, categoryId: string, price: number, priceListId: string): Promise<string> {
    const existing = await prisma.productVariant.findUnique({ where: { sku } });
    if (existing) return existing.id;
    if (await prisma.productBarcode.findUnique({ where: { barcode } })) return "";
    const product = await prisma.product.create({
      data: {
        name, status: "active", categoryId, taxRate: 0.08,
        variants: { create: { sku, name: "Default", barcodes: { create: { barcode, type: "EAN13" } } } },
      },
      include: { variants: true },
    });
    await prisma.price.create({ data: { variantId: product.variants[0].id, priceListId, amount: BigInt(price) } });
    return product.variants[0].id;
  }

  console.log("Seed done:", {
    stores: stores.length, products: products.length,
    suppliers: suppliers.length,
  });

  // SystemConfig (spec §101) — loyalty rate: 10.000 VND = 1 point
  await prisma.systemConfig.upsert({
    where: { key: "loyalty.vndPerPoint" },
    create: { key: "loyalty.vndPerPoint", value: 10000 },
    update: {},
  });
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
