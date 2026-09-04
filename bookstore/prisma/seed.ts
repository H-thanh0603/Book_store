// Phase 1 seed — realistic Vietnamese bookstore data (spec §68).
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { scryptSync, randomBytes, randomUUID } from "crypto";

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
  if (!org) org = await prisma.organization.create({ data: { name: "Nhà Sách Melio", slug: "melio" } });
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
  const { org, region } = await getOrCreateOrg();
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
  // Service account for automated actors (reservation expiry etc.): inactive so
  // it can never log in, but a real User row so audit FKs are satisfied.
  await prisma.user.upsert({
    where: { email: "system@bookstore.internal" },
    create: { email: "system@bookstore.internal", passwordHash: hash(randomUUID()), active: false },
    update: {},
  });
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
    // ── Sách Văn Học Việt Nam ──
    { name: "Dế Mèn Phiêu Lưu Ký", cat: "Sách", author: "Tô Hoài", pub: "NXB Kim Đồng", sku: "BK-DEMEN-01", barcode: "9786042089131", price: 89000, attrs: [["isbn", "978-604-2-08913-1"], ["author_name", "Tô Hoài"], ["publisher_name", "NXB Kim Đồng"], ["pages", "288"], ["cover", "Bìa mềm"]] },
    { name: "Tôi Thấy Hoa Vàng Trên Cỏ Xanh", cat: "Sách", author: "Nguyễn Nhật Ánh", pub: "NXB Trẻ", sku: "BK-HOAVANG-01", barcode: "9786042096436", price: 118000, attrs: [["isbn", "978-604-2-09643-6"], ["author_name", "Nguyễn Nhật Ánh"], ["publisher_name", "NXB Trẻ"], ["pages", "352"], ["cover", "Bìa mềm"]] },
    { name: "Mắt Biếc", cat: "Sách", author: "Nguyễn Nhật Ánh", pub: "NXB Trẻ", sku: "BK-MATBIEC-01", barcode: "9786042090780", price: 108000, attrs: [["isbn", "978-604-2-09078-0"], ["author_name", "Nguyễn Nhật Ánh"], ["publisher_name", "NXB Trẻ"], ["pages", "320"], ["cover", "Bìa mềm"]] },
    { name: "Cho Tôi Xin Một Vé Đi Tuổi Thơ", cat: "Sách", author: "Nguyễn Nhật Ánh", pub: "NXB Trẻ", sku: "BK-CHOIXIN-01", barcode: "9786042094375", price: 98000, attrs: [["isbn", "978-604-2-09437-5"], ["author_name", "Nguyễn Nhật Ánh"], ["publisher_name", "NXB Trẻ"], ["pages", "280"], ["cover", "Bìa mềm"]] },
    { name: "Cánh Đồng Bất Tận", cat: "Sách", author: "Nguyễn Ngọc Tư", pub: "NXB Trẻ", sku: "BK-CANHDONG-01", barcode: "9786042083592", price: 95000, attrs: [["isbn", "978-604-2-08359-2"], ["author_name", "Nguyễn Ngọc Tư"], ["publisher_name", "NXB Trẻ"], ["pages", "344"], ["cover", "Bìa mềm"]] },
    { name: "Nhà Giả Kim", cat: "Sách", author: "Paulo Coelho", pub: "NXB Văn Học", sku: "BK-NHAGIAKIM-01", barcode: "9786042084338", price: 79000, attrs: [["isbn", "978-604-2-08433-8"], ["author_name", "Paulo Coelho"], ["publisher_name", "NXB Văn Học"], ["pages", "224"], ["cover", "Bìa mềm"]] },
    { name: "Đắc Nhân Tâm", cat: "Sách", author: "Dale Carnegie", pub: "NXB Tổng Hợp", sku: "BK-DACNHANTAM-01", barcode: "9786042084574", price: 89000, attrs: [["isbn", "978-604-2-08457-4"], ["author_name", "Dale Carnegie"], ["publisher_name", "NXB Tổng Hợp"], ["pages", "320"], ["cover", "Bìa mềm"]] },
    { name: "Tuổi Trẻ Đáng Giá Bao Nhiêu", cat: "Sách", author: "Rosie Nguyễn", pub: "NXB Thế Giới", sku: "BK-TUOITRE-01", barcode: "9786042082792", price: 79000, attrs: [["isbn", "978-604-2-08279-2"], ["author_name", "Rosie Nguyễn"], ["publisher_name", "NXB Thế Giới"], ["pages", "248"], ["cover", "Bìa mềm"]] },
    { name: "Sapiens: Lược Sử Loài Người", cat: "Sách", author: "Yuval Noah Harari", pub: "NXB Tổng Hợp", sku: "BK-SAPIENS-01", barcode: "9786042083201", price: 199000, attrs: [["isbn", "978-604-2-08320-1"], ["author_name", "Yuval Noah Harari"], ["publisher_name", "NXB Tổng Hợp"], ["pages", "528"], ["cover", "Bìa mềm"]] },
    { name: "Atomic Habits", cat: "Sách", author: "James Clear", pub: "NXB Trẻ", sku: "BK-ATOMIC-01", barcode: "9786042098014", price: 169000, attrs: [["isbn", "978-604-2-09801-4"], ["author_name", "James Clear"], ["publisher_name", "NXB Trẻ"], ["pages", "320"], ["cover", "Bìa mềm"]] },
    { name: "Cha Giàu Cha Nghèo", cat: "Sách", author: "Robert Kiyosaki", pub: "NXB Tổng Hợp", sku: "BK-CHAGIAU-01", barcode: "9786042083608", price: 109000, attrs: [["isbn", "978-604-2-08360-8"], ["author_name", "Robert Kiyosaki"], ["publisher_name", "NXB Tổng Hợp"], ["pages", "368"], ["cover", "Bìa mềm"]] },
    { name: "Nhật Ký Đặng Thùy Trâm", cat: "Sách", author: "Đặng Thùy Trâm", pub: "NXB Hội Nhà Văn", sku: "BK-NHATKY-01", barcode: "9786042078207", price: 89000, attrs: [["isbn", "978-604-2-07820-7"], ["author_name", "Đặng Thùy Trâm"], ["publisher_name", "NXB Hội Nhà Văn"], ["pages", "360"], ["cover", "Bìa mềm"]] },
    // ── Sách Kinh Doanh ──
    { name: "Đừng Bao Giờ Đi Ăn Một Mình", cat: "Sách", author: "Keith Ferrazzi", pub: "NXB Trẻ", sku: "BK-DUNGBAOGIO-01", barcode: "9786042091046", price: 89000, attrs: [["isbn", "978-604-2-09104-6"], ["author_name", "Keith Ferrazzi"], ["publisher_name", "NXB Trẻ"], ["pages", "288"], ["cover", "Bìa mềm"]] },
    { name: "Tri Thức Về Cuộc Sống", cat: "Sách", author: "Napoleon Hill", pub: "NXB Văn Học", sku: "BK-TRITHUC-01", barcode: "9786042084543", price: 79000, attrs: [["isbn", "978-604-2-08454-3"], ["author_name", "Napoleon Hill"], ["publisher_name", "NXB Văn Học"], ["pages", "288"], ["cover", "Bìa mềm"]] },
    // ── Sách Thiếu Nhi ──
    { name: "Harry Potter và Hòn Đá Phù Thủy", cat: "Sách", author: "J.K. Rowling", pub: "NXB Hội Nhà Văn", sku: "BK-HP1-VN", barcode: "9786042133261", price: 189000, attrs: [["isbn", "978-604-2-13326-1"], ["author_name", "J.K. Rowling"], ["publisher_name", "NXB Hội Nhà Văn"], ["pages", "448"], ["cover", "Bìa cứng"]] },
    { name: "Harry Potter và Phòng Chứa Bí Mật", cat: "Sách", author: "J.K. Rowling", pub: "NXB Hội Nhà Văn", sku: "BK-HP2-VN", barcode: "9786042133278", price: 199000, attrs: [["isbn", "978-604-2-13327-8"], ["author_name", "J.K. Rowling"], ["publisher_name", "NXB Hội Nhà Văn"], ["pages", "432"], ["cover", "Bìa cứng"]] },
    { name: "Cô Bé Người cá (The Little Mermaid)", cat: "Sách", author: "Hans Christian Andersen", pub: "NXB Kim Đồng", sku: "BK-COBE-01", barcode: "9786042085100", price: 45000, attrs: [["isbn", "978-604-2-08510-0"], ["author_name", "Hans Christian Andersen"], ["publisher_name", "NXB Kim Đồng"], ["pages", "96"], ["cover", "Bìa mềm"]] },
    { name: "Tắc Kè Hoa", cat: "Sách", author: "Nguyễn Việt Hà", pub: "NXB Trẻ", sku: "BK-TACKEHOA-01", barcode: "9786042094276", price: 98000, attrs: [["isbn", "978-604-2-09427-6"], ["author_name", "Nguyễn Việt Hà"], ["publisher_name", "NXB Trẻ"], ["pages", "328"], ["cover", "Bìa mềm"]] },
    { name: "Cây Cam Ngọt Của Tôi", cat: "Sách", author: "José Mauro de Vasconcelos", pub: "NXB Văn Học", sku: "BK-CAYCAM-01", barcode: "9786042085526", price: 109000, attrs: [["isbn", "978-604-2-08552-6"], ["author_name", "José Mauro de Vasconcelos"], ["publisher_name", "NXB Văn Học"], ["pages", "288"], ["cover", "Bìa mềm"]] },
    { name: "Thép Đã Tôi Thành Thế Đấy", cat: "Sách", author: "Nikolai Ostrovsky", pub: "NXB Văn Học", sku: "BK-THEP-01", barcode: "9786042079365", price: 85000, attrs: [["isbn", "978-604-2-07936-5"], ["author_name", "Nikolai Ostrovsky"], ["publisher_name", "NXB Văn Học"], ["pages", "456"], ["cover", "Bìa mềm"]] },
    // ── Manga ──
    { name: "One Piece Tập 101", cat: "Sách", sku: "BK-OP-101", barcode: "9786042110019", price: 39000, attrs: [["isbn", "978-604-2-11001-9"], ["cover", "Bìa mềm"]] },
    { name: "One Piece Tập 102", cat: "Sách", sku: "BK-OP-102", barcode: "9786042110026", price: 39000, attrs: [["isbn", "978-604-2-11002-6"], ["cover", "Bìa mềm"]] },
    { name: "One Piece Tập 103", cat: "Sách", sku: "BK-OP-103", barcode: "9786042110033", price: 39000, attrs: [["isbn", "978-604-2-11003-3"], ["cover", "Bìa mềm"]] },
    { name: "Dragon Ball Super Tập 15", cat: "Sách", sku: "BK-DBS-15", barcode: "9786042110118", price: 42000, attrs: [["isbn", "978-604-2-11011-8"], ["cover", "Bìa mềm"]] },
    { name: "Jujutsu Kaisen Tập 0", cat: "Sách", sku: "BK-JJK-0", barcode: "9786042110224", price: 45000, attrs: [["isbn", "978-604-2-11022-4"], ["cover", "Bìa mềm"]] },
    { name: "Attack on Titan Tập 34", cat: "Sách", sku: "BK-AOT-34", barcode: "9786042110330", price: 42000, attrs: [["isbn", "978-604-2-11033-0"], ["cover", "Bìa mềm"]] },
    { name: "Doraemon Tập 1", cat: "Sách", sku: "BK-DORA-01", barcode: "9786042080019", price: 35000, attrs: [["isbn", "978-604-2-08001-9"], ["cover", "Bìa mềm"]] },
    { name: "Naruto Tập 1", cat: "Sách", sku: "BK-NARUTO-01", barcode: "9786042080316", price: 35000, attrs: [["isbn", "978-604-2-08031-6"], ["cover", "Bìa mềm"]] },
    // ── Văn Phòng Phẩm ──
    { name: "Bút bi Thiên Long TL-027 (hộp 20)", cat: "Văn phòng phẩm", brand: "Thiên Long", sku: "VPP-TL027-20", barcode: "8934563100271", price: 62000, attrs: [["brand_name", "Thiên Long"], ["color", "Xanh"]] },
    { name: "Bút bi Thiên Long TL-027 (hộp 20 - Đỏ)", cat: "Văn phòng phẩm", brand: "Thiên Long", sku: "VPP-TL027-20-DO", barcode: "8934563100288", price: 62000, attrs: [["brand_name", "Thiên Long"], ["color", "Đỏ"]] },
    { name: "Giấy A4 Double A 70gsm (500 tờ)", cat: "Văn phòng phẩm", brand: "Double A", sku: "VPP-DA-A4-70", barcode: "8851561100704", price: 58000, attrs: [["brand_name", "Double A"]] },
    { name: "Giấy A4 Double A 80gsm (500 tờ)", cat: "Văn phòng phẩm", brand: "Double A", sku: "VPP-DA-A4-80", barcode: "8851561100803", price: 68000, attrs: [["brand_name", "Double A"]] },
    { name: "Vở ô ly 200 trang", cat: "Văn phòng phẩm", sku: "VPP-VO-200OL", barcode: "8936000001234", price: 25000 },
    { name: "Vở kẻ ngang 200 trang", cat: "Văn phòng phẩm", sku: "VPP-VO-200KN", barcode: "8936000001235", price: 25000 },
    { name: "Bút gel Thiên Long TL-08 (hộp 12)", cat: "Văn phòng phẩm", brand: "Thiên Long", sku: "VPP-TL08-12", barcode: "8934563100806", price: 48000, attrs: [["brand_name", "Thiên Long"], ["color", "Đen"]] },
    { name: "Bút chì 2B Thiên Long (hộp 2)", cat: "Văn phòng phẩm", brand: "Thiên Long", sku: "VPP-CHI2B-02", barcode: "8934563100202", price: 12000, attrs: [["brand_name", "Thiên Long"]] },
    { name: "Gôm tẩy Thiên Long W301", cat: "Văn phòng phẩm", brand: "Thiên Long", sku: "VPP-GOM-W301", barcode: "8934563103012", price: 8000, attrs: [["brand_name", "Thiên Long"]] },
    { name: "Thước kẻ 30cm planner", cat: "Văn phòng phẩm", sku: "VPP-THUOC-30", barcode: "8936000002345", price: 15000 },
    { name: "Compas vẽ tròn Excel", cat: "Văn phòng phẩm", sku: "VPP-COMPASS-01", barcode: "8936000002346", price: 35000 },
    { name: "Hộp bút nhựa 2 tầng", cat: "Văn phòng phẩm", sku: "VPP-HOPBUT-2T", barcode: "8936000003456", price: 45000 },
    { name: "Keo sữa Delta 500ml", cat: "Văn phòng phẩm", sku: "VPP-KEO-500", barcode: "8936000004567", price: 32000 },
    { name: "Kéo học sinh 18cm", cat: "Văn phòng phẩm", sku: "VPP-KEO-18", barcode: "8936000004568", price: 18000 },
    { name: "Bấm kim Thiên Long 23/6", cat: "Văn phòng phẩm", brand: "Thiên Long", sku: "VPP-BAMKIM-23", barcode: "8934563100233", price: 28000, attrs: [["brand_name", "Thiên Long"]] },
    { name: "Ghim bấm Thiên Long 26/6 (hộp 1000)", cat: "Văn phòng phẩm", brand: "Thiên Long", sku: "VPP-GHIM-26", barcode: "8934563100264", price: 22000, attrs: [["brand_name", "Thiên Long"]] },
    { name: "Bìa file nhựa A4 (hộp 10)", cat: "Văn phòng phẩm", sku: "VPP-BIA-A4-10", barcode: "8936000005678", price: 35000 },
    { name: "Giấy note Sticky Notes 76x76 (3 màu)", cat: "Văn phòng phẩm", sku: "VPP-NOTE-3M", barcode: "8936000005679", price: 25000 },
    { name: "Bút xóa Esteem BP-05", cat: "Văn phòng phẩm", brand: "Thiên Long", sku: "VPP-XOA-BP05", barcode: "8934563100500", price: 18000, attrs: [["brand_name", "Thiên Long"]] },
    { name: "Keo hai mặt 3M (5m)", cat: "Văn phòng phẩm", sku: "VPP-KEO2MAT-3M", barcode: "8936000006789", price: 28000 },
    { name: "Bìa hồ sơ A4 (hộp 50)", cat: "Văn phòng phẩm", sku: "VPP-BIARU-A4-50", barcode: "8936000006790", price: 85000 },
    { name: "Ruột hồ sơ A4 clear (hộp 100)", cat: "Văn phòng phẩm", sku: "VPP-RUOT-A4-100", barcode: "8936000006791", price: 65000 },
    { name: "Phong bì A4 trắng (hộp 100)", cat: "Văn phòng phẩm", sku: "VPP-PHONGBI-A4", barcode: "8936000006792", price: 75000 },
    // ── Đồ Chơi ──
    { name: "LEGO Classic Creative Bricks 11002", cat: "Đồ chơi", brand: "LEGO", sku: "TOY-LEGO-11002", barcode: "5702016110228", price: 899000, attrs: [["age_range", "6+"], ["character", "LEGO Classic"]] },
    { name: "LEGO City Fire Station 60320", cat: "Đồ chơi", brand: "LEGO", sku: "TOY-LEGO-60320", barcode: "5702017100208", price: 1299000, attrs: [["age_range", "6+"], ["character", "LEGO City"]] },
    { name: "LEGO Technic Lamborghini 42115", cat: "Đồ chơi", brand: "LEGO", sku: "TOY-LEGO-42115", barcode: "5702016630200", price: 6999000, attrs: [["age_range", "12+"], ["character", "LEGO Technic"]] },
    { name: "LEGO Friends Heartlake City 41717", cat: "Đồ chơi", brand: "LEGO", sku: "TOY-LEGO-41717", barcode: "5702016810206", price: 799000, attrs: [["age_range", "6+"], ["character", "LEGO Friends"]] },
    { name: "Gấu bông Hello Kitty 30cm", cat: "Đồ chơi", brand: "Sanrio", sku: "TOY-HK-30", barcode: "8938500004567", price: 259000, attrs: [["character", "Hello Kitty"]] },
    { name: "Gấu bông Doraemon 35cm", cat: "Đồ chơi", sku: "TOY-DORAEMON-35", barcode: "8938500004568", price: 299000, attrs: [["character", "Doraemon"]] },
    { name: "Gấu bông Pikachu 25cm", cat: "Đồ chơi", sku: "TOY-PIKACHU-25", barcode: "8938500004569", price: 199000, attrs: [["character", "Pikachu"]] },
    { name: "Rubik 3x3 MoYu MeiLong", cat: "Đồ chơi", sku: "TOY-RUBIK-3X3", barcode: "8938500005678", price: 120000, attrs: [["age_range", "6+"]] },
    { name: "Rubik 4x4 MoYu MeiLong", cat: "Đồ chơi", sku: "TOY-RUBIK-4X4", barcode: "8938500005679", price: 180000, attrs: [["age_range", "6+"]] },
    { name: "Xe điều khiển từ xa Traxxas", cat: "Đồ chơi", sku: "TOY-XE-RC-01", barcode: "8938500006789", price: 1590000, attrs: [["age_range", "12+"]] },
    { name: "Bộ xếp hình 100 mảnh gỗ", cat: "Đồ chơi", sku: "TOY-XEPHINH-100", barcode: "8938500006790", price: 159000, attrs: [["age_range", "3+"]] },
    { name: "Bóng đá mini mini Adidas", cat: "Đồ chơi", sku: "TOY-BONGDA-MINI", barcode: "8938500006791", price: 89000, attrs: [["age_range", "3+"]] },
    { name: "Yo-yo chuyên nghiệp Yomega", cat: "Đồ chơi", sku: "TOY-YOYO-01", barcode: "8938500006792", price: 189000, attrs: [["age_range", "6+"]] },
    { name: "Bộ thí nghiệm khoa học 15 experiments", cat: "Đồ chơi", sku: "TOY-THINHGHIEM-15", barcode: "8938500006793", price: 299000, attrs: [["age_range", "8+"]] },
    { name: "Bộ cờ vua gỗ cao cấp", cat: "Đồ chơi", sku: "TOY-COVO-01", barcode: "8938500006794", price: 450000, attrs: [["age_range", "6+"]] },
    { name: "Bộ cờ tướng gỗ mini", cat: "Đồ chơi", sku: "TOY-COTUONG-01", barcode: "8938500006795", price: 120000, attrs: [["age_range", "6+"]] },
    { name: "LEGO Star Wars Millennium Falcon 75257", cat: "Đồ chơi", brand: "LEGO", sku: "TOY-LEGO-75257", barcode: "5702016370205", price: 8999000, attrs: [["age_range", "12+"], ["character", "LEGO Star Wars"]] },
    { name: "LEGO Harry Potter Hogwarts Castle 71043", cat: "Đồ chơi", brand: "LEGO", sku: "TOY-LEGO-71043", barcode: "5702016310201", price: 5999000, attrs: [["age_range", "12+"], ["character", "LEGO Harry Potter"]] },
    { name: "Bộ nam châm BUILDON 120 mảnh", cat: "Đồ chơi", sku: "TOY-NAMCHAM-120", barcode: "8938500007890", price: 399000, attrs: [["age_range", "6+"]] },
    // ── Mỹ Thuật ──
    { name: "Bộ màu nước 12 màu Artline", cat: "Mỹ thuật", sku: "MT-MAUNUOC-12", barcode: "8936000005678", price: 78000 },
    { name: "Bộ màu nước 24 màu Sakura", cat: "Mỹ thuật", sku: "MT-MAUNUOC-24-SK", barcode: "8936000005679", price: 145000 },
    { name: "Bút lông Artline 101 (hộp 12 màu)", cat: "Mỹ thuật", sku: "MT-BUTLONG-12", barcode: "8936000007891", price: 89000 },
    { name: "Bút chì màu Staedtler 24 màu", cat: "Mỹ thuật", sku: "MT-CHIMAU-24", barcode: "8936000007892", price: 125000 },
    { name: "Giấy vẽ A3 200gsm (20 tờ)", cat: "Mỹ thuật", sku: "MT-GIAY-VE-A3", barcode: "8936000007893", price: 55000 },
    { name: "Bộ cọ vẽ 5 cây", cat: "Mỹ thuật", sku: "MT-CO-VE-05", barcode: "8936000007894", price: 35000 },
    { name: "Keo polycrylic Mod Podge 240ml", cat: "Mỹ thuật", sku: "MT-KEO-MODPODGE", barcode: "8936000007895", price: 85000 },
    { name: "Bộ màu acrylic 6 hũ", cat: "Mỹ thuật", sku: "MT-ACRYLIC-06", barcode: "8936000007896", price: 120000 },
    // ── Lifestyle ──
    { name: "Balo học sinh 20L", cat: "Lifestyle", sku: "LS-BALO-20-BLK", barcode: "8936000009012", price: 349000 },
    { name: "Balo laptop 15.6 inch", cat: "Lifestyle", sku: "LS-BALO-LT15", barcode: "8936000009013", price: 459000 },
    { name: "Cặp xách công sở", cat: "Lifestyle", sku: "LS-CAP-CONGSO", barcode: "8936000009014", price: 599000 },
    { name: "Ly giữ nhiệt 500ml Inox", cat: "Lifestyle", sku: "LS-LY-500ML", barcode: "8936000009015", price: 259000 },
    { name: "Bình nước thể thao 750ml", cat: "Lifestyle", sku: "LS-BINH-750ML", barcode: "8936000009016", price: 189000 },
    { name: "Đồng hồ treo tường 30cm", cat: "Lifestyle", sku: "LS-DONGHO-30", barcode: "8936000009017", price: 199000 },
    { name: "Đèn bàn LED học sinh", cat: "Lifestyle", sku: "LS-DEN-LED", barcode: "8936000009018", price: 399000 },
    { name: "Ổ cắm điện 3 ổ USB", cat: "Lifestyle", sku: "LS-OCAM-3USB", barcode: "8936000009019", price: 249000 },
    { name: "Tai nghe Bluetooth JBL Tune 510", cat: "Lifestyle", sku: "LS-TAI-NGHE-JBL", barcode: "8936000009020", price: 1290000 },
    { name: "Sạc nhanh Type-C 20W", cat: "Lifestyle", sku: "LS-SAC-C20W", barcode: "8936000009021", price: 199000 },
    // ── Quà Tặng ──
    { name: "Bộ quà Tết: sổ tay + bookmark", cat: "Quà tặng", sku: "GT-BOX-TET01", barcode: "8936000003456", price: 159000 },
    { name: "Hộp quà sinh nhật nhỏ", cat: "Quà tặng", sku: "GT-BOX-SINHNHAT", barcode: "8936000003457", price: 129000 },
    { name: "Ly sứ in hình theo yêu cầu", cat: "Quà tặng", sku: "GT-LYSU-INHINH", barcode: "8936000003458", price: 189000 },
    { name: "Sổ tay bìa da A5", cat: "Quà tặng", sku: "GT-SOTAY-DA-A5", barcode: "8936000003459", price: 149000 },
    { name: "Bút quà tặng cao cấp", cat: "Quà tặng", sku: "GT-BUT-CAOCAP", barcode: "8936000003460", price: 299000 },
    { name: "Móc chìa khóa USB 16GB", cat: "Quà tặng", sku: "GT-MOCCHIA-USB", barcode: "8936000003461", price: 199000 },
    { name: "Album ảnh mini 36 trang", cat: "Quà tặng", sku: "GT-ALBUM-MINI", barcode: "8936000003462", price: 89000 },
    { name: "Bộ thiệp chúc mừng (10 chiếc)", cat: "Quà tặng", sku: "GT-THIEP-10", barcode: "8936000003463", price: 65000 },
  ];

  const variantIds: Record<string, string> = {};
  for (const p of products) {
    // idempotent: skip if SKU already exists
    let variant = await prisma.productVariant.findUnique({ where: { sku: p.sku } });
    if (!variant) {
      // also skip if barcode already exists (from previous seed runs)
      const existingBarcode = await prisma.productBarcode.findUnique({ where: { barcode: p.barcode } });
      if (existingBarcode) {
        variant = await prisma.productVariant.findUnique({ where: { id: existingBarcode.variantId } });
        if (variant) {
          variantIds[p.sku] = variant.id;
          continue;
        }
      }
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
          orgId: org.id, // SEC-004: customers are org-scoped
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
  const bookTitles = ["Hạ đen", "Bóng đè", "Thời xa vắng", "Truyện Kiều", "Chí Phèo", "Lão Hạc", "Số Đỏ", "Tắt Đèn", "Bỉ vỏ", "Quãng đời còn lại nhớ em", "Rừng Na Uy", "1984", "Tiếng gọi nơi hoang dã", "Ba người lính ngự lâm", "Bố già", "Xuân Diệu tuyển tập", "Hồn ülke Ý", "Bông故居", "Người tình", "Đại gia đình"];
  const stationery = ["Bút viếtroller", "Bút highlight 5 màu", "Bút kỹ thuật Artline", "Bút chì cơ khí 0.5mm", "Ruột bút bi Thiên Long", "Giấy A5 80gsm", "Kệ sách mini", "Giá bìa hồ sơ", "Kẹp gim", "Bấm lỗ 2 lỗ"];
  const toys = ["Xe lửa barbie", "Bộ búp bê Barbie", "Đồ chơi bếp mini", "Bộ công cụ sửa chữa", "Máy tính Casio", "Bộ cờ caro", "Xe mô hìnhdiecast", "Bộ puzzle 500 mảnh"];
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
