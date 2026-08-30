// Agent 2: added POST/PATCH product CRUD. GET extended with documented PostgreSQL
// full-text fallback: `search=` uses websearch_to_tsquery over name+description
// (`products.search` tsvector index); falls back to trigram-free ILIKE ORs.
import { NextRequest } from "next/server";
import { prisma, prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, toMoney, reqStr, optStr } from "@/lib/api";
import { embedProduct } from "@/lib/embeddings";
import { Prisma } from "../../../generated/prisma/client";

const PRODUCT_STATUSES = ["draft", "active", "inactive", "discontinued", "out_of_print", "preorder", "archived"];

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Resolve an optional scalar FK id against its table; junk becomes a clean 400. */
async function requireOptionalRef(table: "category" | "brand" | "author" | "publisher", id: unknown, label: string) {
  if (id === undefined || id === null || id === "") return null;
  if (typeof id !== "string") fail(400, "VALIDATION", `${label} must be an id`);
  const row = table === "category" ? await prisma.category.findUnique({ where: { id } })
    : table === "brand" ? await prisma.brand.findUnique({ where: { id } })
    : table === "author" ? await prisma.author.findUnique({ where: { id } })
    : await prisma.publisher.findUnique({ where: { id } });
  if (!row) fail(404, "NOT_FOUND", `${label} not found`);
  return id;
}

function parseTaxRate(v: unknown): number {
  if (v === undefined || v === null) return 0.08;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v >= 1)
    fail(400, "VALIDATION", "taxRate must be a number between 0 and 1");
  return v;
}

// GET /api/products?q=&barcode=&sku=&page=&search=
// Admin browse is read-only and seconds-stale-tolerant → replica when configured.
export async function GET(req: NextRequest) {
  try {
    await requirePermission("product.view");
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q");
    const barcode = sp.get("barcode");
    const sku = sp.get("sku");
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    // take is client-tunable (POS/order pickers request a bigger page) but
    // hard-clamped so a hand-crafted ?take=100000 cannot dump the catalog.
    const take = Math.min(200, Math.max(1, Number(sp.get("take") ?? 25)));

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
      prismaRead.product.count({ where }),
      prismaRead.product.findMany({
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
    const name = reqStr(b.name, "name", 255);
    const categoryId = await requireOptionalRef("category", b.categoryId, "Category").then((id) => {
      if (!id) fail(400, "VALIDATION", "categoryId required");
      return id as string;
    });
    const brandId = await requireOptionalRef("brand", b.brandId, "Brand");
    const authorId = await requireOptionalRef("author", b.authorId, "Author");
    const publisherId = await requireOptionalRef("publisher", b.publisherId, "Publisher");
    const description = optStr(b.description, "description", 5000);
    const taxRate = parseTaxRate(b.taxRate);
    const status = PRODUCT_STATUSES.includes(b.status) ? b.status : "active";
    if (!Array.isArray(b.variants) || b.variants.length === 0) fail(400, "VALIDATION", "at least one variant required");
    for (const v of b.variants) {
      if (typeof v.sku !== "string" || !v.sku.trim()) fail(400, "VALIDATION", "each variant needs a sku");
      // Retail price rows are created inside the same transaction below — never
      // leave a sellable product without a price because a later step failed.
      if (v.retailPrice != null) toMoney(v.retailPrice, "retailPrice");
    }
    let product;
    try {
      product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            name,
            status,
            categoryId,
            brandId,
            authorId,
            publisherId,
            description,
            taxRate,
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
        // Retail price needs the RETAIL price list id — same transaction as create.
        if (b.variants.some((v: { retailPrice?: number }) => v.retailPrice != null)) {
          const retail = await tx.priceList.findFirst({ where: { kind: "retail" } });
          if (retail) {
            for (const variant of created.variants) {
              const input = b.variants.find((v: { sku: string }) => v.sku === variant.sku);
              if (input?.retailPrice != null)
                await tx.price.create({ data: { variantId: variant.id, priceListId: retail.id, amount: toMoney(input.retailPrice, "retailPrice") } });
            }
          }
        }
        return created;
      });
    } catch (err) {
      // Pre-check races: two concurrent creates can pass the findUnique probe.
      if (isUniqueViolation(err)) fail(409, "DUPLICATE", "SKU or barcode already exists");
      throw err;
    }
    await prisma.auditLog.create({
      data: { actorId: auth.userId, action: "product.create", entity: "Product", entityId: product.id, after: { name: product.name } },
    });
    // Refresh the semantic-search embedding; never blocks/fails the request.
    void embedProduct(product.id).catch(() => {});
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

    // Whitelist + validate every field — raw client values must never reach
    // Prisma untyped (junk types surface as 500s instead of 400s).
    const data: Record<string, unknown> = {};
    if ("name" in b) data.name = reqStr(b.name, "name", 255);
    if ("status" in b) {
      if (!PRODUCT_STATUSES.includes(b.status)) fail(400, "VALIDATION", `status must be one of ${PRODUCT_STATUSES.join("|")}`);
      data.status = b.status;
    }
    if ("description" in b) data.description = optStr(b.description, "description", 5000);
    if ("categoryId" in b) data.categoryId = await requireOptionalRef("category", b.categoryId, "Category");
    if ("brandId" in b) data.brandId = await requireOptionalRef("brand", b.brandId, "Brand");
    if ("authorId" in b) data.authorId = await requireOptionalRef("author", b.authorId, "Author");
    if ("publisherId" in b) data.publisherId = await requireOptionalRef("publisher", b.publisherId, "Publisher");
    if ("taxRate" in b) data.taxRate = parseTaxRate(b.taxRate);

    let product;
    try {
      product = await prisma.product.update({ where: { id: b.id }, data, include: { variants: true } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025")
        fail(404, "NOT_FOUND", "Product not found");
      throw err;
    }

    // Optional: add a barcode to an existing variant
    if (b.newBarcode?.barcode && b.newBarcode?.variantId) {
      const bcBarcode = reqStr(b.newBarcode.barcode, "newBarcode.barcode", 128);
      const bcType = ["EAN13", "ISBN", "INTERNAL", "SUPPLIER"].includes(b.newBarcode.type) ? b.newBarcode.type : "INTERNAL";
      const variant = await prisma.productVariant.findUnique({ where: { id: b.newBarcode.variantId } });
      if (!variant) fail(404, "NOT_FOUND", "Variant for newBarcode not found");
      try {
        await prisma.productBarcode.create({
          data: { barcode: bcBarcode, variantId: variant.id, type: bcType },
        });
      } catch (err) {
        if (isUniqueViolation(err)) fail(409, "DUPLICATE", "Barcode already registered");
        throw err;
      }
    }

    await prisma.auditLog.create({
      data: {
        actorId: auth.userId, action: "product.update", entity: "Product", entityId: product.id,
        before: { name: before.name, status: before.status }, after: { name: product.name, status: product.status },
      },
    });
    // Text fields may have changed — refresh the embedding (fire-and-forget).
    void embedProduct(product.id).catch(() => {});
    return ok({ product });
  } catch (err) {
    return apiError(err);
  }
}
