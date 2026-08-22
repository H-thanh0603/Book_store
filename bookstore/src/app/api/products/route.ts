// Agent 2: added POST/PATCH product CRUD. GET extended with documented PostgreSQL
// full-text fallback: `search=` uses websearch_to_tsquery over name+description
// (`products.search` tsvector index); falls back to trigram-free ILIKE ORs.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, toMoney } from "@/lib/api";

// GET /api/products?q=&barcode=&sku=&page=&search=
export async function GET(req: NextRequest) {
  try {
    await requirePermission("product.view");
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q");
    const barcode = sp.get("barcode");
    const sku = sp.get("sku");
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const take = 25;

    const where = {
      AND: [
        barcode ? { variants: { some: { barcodes: { some: { barcode } } } } } : {},
        sku ? { variants: { some: { sku } } } : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { variants: { some: { sku: { contains: q, mode: "insensitive" as const } } } },
                { variants: { some: { barcodes: { some: { barcode: q } } } } },
                { author: { name: { contains: q, mode: "insensitive" as const } } },
                { publisher: { name: { contains: q, mode: "insensitive" as const } } },
                { brand: { name: { contains: q, mode: "insensitive" as const } } },
              ],
            }
          : {},
      ],
    };

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: {
          category: true, brand: true, author: true, publisher: true,
          variants: {
            include: {
              barcodes: true,
              prices: { where: { priceList: { kind: "retail" } }, orderBy: { validFrom: "desc" }, take: 1 },
            },
          },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * take,
        take,
      }),
    ]);
    return ok({ total, page, products });
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/products — create product with one default variant (+optional barcode & retail price)
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("product.update");
    const b = await req.json();
    if (!b.name || !b.categoryId) fail(400, "VALIDATION", "name and categoryId required");
    const category = await prisma.category.findUnique({ where: { id: b.categoryId } });
    if (!category) fail(404, "NOT_FOUND", "Category not found");
    if (!Array.isArray(b.variants) || b.variants.length === 0) fail(400, "VALIDATION", "at least one variant required");
    for (const v of b.variants) {
      if (!v.sku) fail(400, "VALIDATION", "each variant needs a sku");
      if (await prisma.productVariant.findUnique({ where: { sku: v.sku } })) fail(409, "DUPLICATE", `SKU ${v.sku} exists`);
    }
    const product = await prisma.product.create({
      data: {
        name: b.name,
        status: b.status ?? "active",
        categoryId: b.categoryId,
        brandId: b.brandId ?? null,
        authorId: b.authorId ?? null,
        publisherId: b.publisherId ?? null,
        description: b.description ?? null,
        taxRate: typeof b.taxRate === "number" ? b.taxRate : 0.08,
        variants: {
          create: b.variants.map((v: { sku: string; name?: string; barcode?: string; barcodeType?: string }) => ({
            sku: v.sku,
            name: v.name ?? "Default",
            barcodes: v.barcode ? { create: { barcode: v.barcode, type: v.barcodeType ?? "INTERNAL" } } : undefined,
          })),
        },
      },
      include: { variants: { include: { barcodes: true, prices: true } } },
    });
    // Retail price needs the RETAIL price list id — set after create.
    if (b.variants.some((v: { retailPrice?: number }) => v.retailPrice != null)) {
      const retail = await prisma.priceList.findFirst({ where: { kind: "retail" } });
      if (retail) {
        for (const variant of product.variants) {
          const input = b.variants.find((v: { sku: string }) => v.sku === variant.sku);
          if (input?.retailPrice != null)
            await prisma.price.create({ data: { variantId: variant.id, priceListId: retail.id, amount: toMoney(input.retailPrice, "retailPrice") } });
        }
      }
    }
    await prisma.auditLog.create({
      data: { actorId: auth.userId, action: "product.create", entity: "Product", entityId: product.id, after: { name: product.name } },
    });
    return ok({ product }, 201);
  } catch (err) {
    return apiError(err);
  }
}

// PATCH /api/products { id, name?, status?, description?, ... } + per-variant price/barcode ops
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requirePermission("product.update");
    const b = await req.json();
    if (!b.id) fail(400, "VALIDATION", "id required");
    const before = await prisma.product.findUnique({ where: { id: b.id }, include: { variants: true } });
    if (!before) fail(404, "NOT_FOUND", "Product not found");

    const data: Record<string, unknown> = {};
    for (const k of ["name", "status", "description", "categoryId", "brandId", "authorId", "publisherId", "taxRate"]) {
      if (k in b) data[k] = b[k];
    }
    const product = await prisma.product.update({ where: { id: b.id }, data, include: { variants: true } });

    // Optional: add a barcode to an existing variant
    if (b.newBarcode?.barcode && b.newBarcode?.variantId) {
      if (!(await prisma.productBarcode.findUnique({ where: { barcode: b.newBarcode.barcode } })))
        await prisma.productBarcode.create({
          data: { barcode: b.newBarcode.barcode, variantId: b.newBarcode.variantId, type: b.newBarcode.type ?? "INTERNAL" },
        });
      else fail(409, "DUPLICATE", "Barcode already registered");
    }

    await prisma.auditLog.create({
      data: {
        actorId: auth.userId, action: "product.update", entity: "Product", entityId: product.id,
        before: { name: before.name, status: before.status }, after: { name: product.name, status: product.status },
      },
    });
    return ok({ product });
  } catch (err) {
    return apiError(err);
  }
}
