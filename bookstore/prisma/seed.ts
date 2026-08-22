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

async function main() {
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

  const org = await prisma.organization.create({ data: { name: "Nhà Sách Melio" } });
  const region = await prisma.region.create({ data: { name: "Miền Nam", orgId: org.id } });

  const storeNames = [
    ["NH", "Nhà sách Nguyễn Huệ"], ["TD", "Nhà sách Tân Định"],
    ["BT", "Nhà sách Bình Thạnh"], ["QT", "Nhà sách Quận 7"], ["GV", "Nhà sách Gò Vấp"],
  ];
  const stores = [];
  for (const [code, name] of storeNames) {
    const store = await prisma.store.create({ data: { code, name, regionId: region.id } });
    const stockroom = await prisma.stockLocation.create({ data: { name: `${name} — Kho sau`, type: "STORE_STOCKROOM", storeId: store.id } });
    await prisma.stockLocation.create({ data: { name: `${name} — Kệ A`, type: "STORE_SHELF", storeId: store.id, parentId: stockroom.id } });
    await prisma.posTerminal.create({ data: { storeId: store.id, name: `POS-${code}-01` } });
    stores.push({ store, stockroom });
  }
  const warehouse = await prisma.warehouse.create({ data: { name: "Kho Trung Tâm", isCentral: true } });
  const whLoc = await prisma.stockLocation.create({ data: { name: "Kho Trung Tâm — Main", type: "WAREHOUSE", warehouseId: warehouse.id } });

  // Users
  const users = [
    ["owner@melio.vn", "owner", null],
    ["manager.nh@melio.vn", "store_manager", stores[0].store.id],
    ["cashier.nh@melio.vn", "cashier", stores[0].store.id],
    ["warehouse@melio.vn", "warehouse", null],
    ["purchasing@melio.vn", "purchasing", null],
  ] as const;
  for (const [email, role, storeId] of users) {
    const u = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash: hash("Passw0rd!") },
      update: {},
    });
    const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: u.id, roleId: r.id } },
      create: { userId: u.id, roleId: r.id, storeId },
      update: {},
    });
  }

  // Categories + attributes
  const cats: Record<string, string> = {};
  for (const name of ["Sách", "Văn phòng phẩm", "Đồ chơi", "Lifestyle", "Mỹ thuật", "Quà tặng"]) {
    const c = await prisma.category.create({ data: { name } });
    cats[name] = c.id;
  }
  const bookCat = cats["Sách"];
  for (const name of ["Văn học", "Kinh tế", "Thiếu nhi", "Manga"]) {
    await prisma.category.create({ data: { name, parentId: bookCat } });
  }
  const attrDefs: Record<string, string> = {};
  for (const [cat, attrs] of Object.entries({
    "Sách": [["isbn", "ISBN", "text"], ["author_name", "Tác giả", "text"], ["publisher_name", "NXB", "text"], ["pages", "Số trang", "integer"], ["cover", "Loại bìa", "enum", ["Bìa mềm", "Bìa cứng"]]],
    "Văn phòng phẩm": [["color", "Màu", "text"], ["brand_name", "Thương hiệu", "text"]],
    "Đồ chơi": [["age_range", "Độ tuổi", "enum", ["3+", "6+", "12+"]], ["character", "Nhân vật", "text"]],
  } as Record<string, [string, string, string, string[]?][]>)) {
    for (const [code, label, type, enums] of attrs) {
      const d = await prisma.attributeDefinition.create({
        data: { categoryId: cats[cat], code, label, type, enumValues: enums ?? [] },
      });
      attrDefs[code] = d.id;
    }
  }

  // Brands / authors / publishers
  const brands: Record<string, string> = {};
  for (const n of ["Double A", "Thiên Long", "LEGO", "Sanrio"]) {
    const b = await prisma.brand.create({ data: { name: n } });
    brands[n] = b.id;
  }
  const authors: Record<string, string> = {};
  for (const n of ["Nguyễn Nhật Ánh", "Tô Hoài", "J.K. Rowling"]) {
    const a = await prisma.author.create({ data: { name: n } });
    authors[n] = a.id;
  }
  const pubs: Record<string, string> = {};
  for (const n of ["NXB Kim Đồng", "NXB Trẻ", "NXB Hội Nhà Văn"]) {
    const p = await prisma.publisher.create({ data: { name: n } });
    pubs[n] = p.id;
  }

  // Price list
  const retail = await prisma.priceList.create({ data: { name: "RETAIL", kind: "retail" } });
  await prisma.priceList.create({ data: { name: "MEMBER", kind: "member" } });
  await prisma.priceList.create({ data: { name: "ONLINE", kind: "online" } });

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
    const variant = product.variants[0];
    variantIds[p.sku] = variant.id;
    await prisma.price.create({ data: { variantId: variant.id, priceListId: retail.id, amount: BigInt(p.price) } });
    for (const [code, value] of p.attrs ?? []) {
      if (attrDefs[code])
        await prisma.attributeValue.create({ data: { variantId: variant.id, definitionId: attrDefs[code], value } });
    }
  }

  // Inventory: stock in warehouse + each store stockroom
  const skus = Object.keys(variantIds);
  for (const { stockroom } of stores) {
    for (const sku of skus) {
      await prisma.inventoryBalance.create({
        data: { variantId: variantIds[sku], locationId: stockroom.id, onHand: 15 + Math.floor(Math.random() * 40) },
      });
    }
  }
  for (const sku of skus) {
    await prisma.inventoryBalance.create({
      data: { variantId: variantIds[sku], locationId: whLoc.id, onHand: 100 + Math.floor(Math.random() * 200) },
    });
  }

  // Suppliers
  const suppliers: string[] = [];
  const supplierData: [string, string, string, string, number][] = [
    ["SUP-NKD", "NXB Kim Đồng", "0300123456", "NET30", 7],
    ["SUP-NXT", "NXB Trẻ", "0300234567", "NET30", 5],
    ["SUP-TL", "Công ty TNHH Thiên Long", "0300345678", "NET15", 3],
    ["SUP-LEGO", "LEGO Vietnam", "0300456789", "NET45", 21],
    ["SUP-PH", "Phương Nam Book", "0300567890", "NET30", 7],
  ];
  for (const [code, name, taxCode, terms, lead] of supplierData) {
    const s = await prisma.supplier.create({ data: { code, name, taxCode, paymentTerms: terms, leadTimeDays: lead, email: `sales@${code.toLowerCase()}.vn` } });
    suppliers.push(s.id);
  }

  // Customers
  for (let i = 1; i <= 30; i++) {
    const c = await prisma.customer.create({
      data: {
        code: `CUS-${String(i).padStart(6, "0")}`,
        name: `Khách hàng ${i}`,
        phone: `090${String(1000000 + i * 137).slice(0, 7)}`,
      },
    });
    await prisma.loyaltyAccount.create({ data: { customerId: c.id, points: i * 3, tier: i > 20 ? "Gold" : "Member" } });
  }

  // Promotions
  await prisma.promotion.create({
    data: {
      name: "Mua 2 manga giảm 10%",
      type: "percentage", value: 10n, minQty: 2,
      categoryId: cats["Sách"], channel: "ALL", stackable: false,
      endAt: new Date(Date.now() + 90 * 86400_000),
    },
  });
  await prisma.promotion.create({
    data: {
      name: "Thành viên Gold giảm 5% toàn bộ",
      type: "percentage", value: 5n, memberOnly: true, stackable: true, priority: 5,
      endAt: new Date(Date.now() + 365 * 86400_000),
    },
  });

  console.log("Seed done:", {
    stores: stores.length, products: products.length, suppliers: suppliers.length,
  });
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
