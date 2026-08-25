// Agent 2: Catalog taxonomy CRUD (categories, attributes, brands, authors, publishers, barcodes).
// POST /api/catalog { kind, ...data } / PATCH { kind, id, ...data } / DELETE ?kind=&id=
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, reqStr } from "@/lib/api";
import { Prisma } from "../../../generated/prisma/client";

const KINDS = ["categories", "attributes", "brands", "authors", "publishers", "barcodes"] as const;
type Kind = (typeof KINDS)[number];
const ATTRIBUTE_TYPES = ["text", "integer", "enum", "multi_select", "relation"];

function audit(action: string, entity: string, entityId: string, userId: string, after?: unknown, before?: unknown) {
  return prisma.auditLog.create({
    data: { actorId: userId, action, entity, entityId, after: after as never, before: before as never },
  });
}

/** Missing-target writes surface as clean 404s, never P2025 → 500. */
function mapNotFound(err: unknown): never | void {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025")
    fail(404, "NOT_FOUND", "Not found");
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003")
    fail(404, "NOT_FOUND", "Referenced record not found");
}

async function requireRow<T>(row: T | null, label: string): Promise<T> {
  if (!row) fail(404, "NOT_FOUND", `${label} not found`);
  return row;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("product.update");
    const b = await req.json();
    const kind = b.kind as Kind;
    if (!KINDS.includes(kind)) fail(400, "VALIDATION", `kind must be one of ${KINDS.join("|")}`);

    if (kind === "categories") {
      const name = reqStr(b.name, "name", 255);
      let parentId: string | null = null;
      if (b.parentId) {
        await requireRow(await prisma.category.findUnique({ where: { id: b.parentId } }), "Parent category");
        parentId = b.parentId;
      }
      const cat = await prisma.category.create({ data: { name, parentId } });
      await audit("catalog.create", "Category", cat.id, auth.userId, { name: cat.name });
      return ok({ category: cat }, 201);
    }
    if (kind === "attributes") {
      await requireRow(await prisma.category.findUnique({ where: { id: b.categoryId } }), "Category");
      const code = reqStr(b.code, "code", 64);
      const label = reqStr(b.label, "label", 255);
      const type = reqStr(b.type, "type", 32);
      if (!ATTRIBUTE_TYPES.includes(type))
        fail(400, "VALIDATION", `type must be one of ${ATTRIBUTE_TYPES.join("|")}`);
      const dup = await prisma.attributeDefinition.findUnique({ where: { categoryId_code: { categoryId: b.categoryId, code } } });
      if (dup) fail(409, "DUPLICATE", "Attribute code exists for this category");
      const def = await prisma.attributeDefinition.create({
        data: { categoryId: b.categoryId, code, label, type, enumValues: Array.isArray(b.enumValues) ? b.enumValues.map(String).slice(0, 100) : [], required: !!b.required },
      });
      await audit("catalog.create", "AttributeDefinition", def.id, auth.userId, { code: def.code });
      return ok({ attribute: def }, 201);
    }
    if (kind === "brands" || kind === "authors" || kind === "publishers") {
      const name = reqStr(b.name, "name", 255);
      let row: { id: string; name: string };
      try {
        if (kind === "brands") row = await prisma.brand.create({ data: { name } });
        else if (kind === "authors") row = await prisma.author.create({ data: { name } });
        else row = await prisma.publisher.create({ data: { name } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
          fail(409, "DUPLICATE", `${kind.slice(0, -1)} name already exists`);
        throw err;
      }
      await audit("catalog.create", kind, row.id, auth.userId, { name: row.name });
      return ok({ [kind.slice(0, -1)]: row }, 201);
    }
    // barcodes
    const barcode = reqStr(b.barcode, "barcode", 128);
    const variantId = typeof b.variantId === "string" ? b.variantId : "";
    await requireRow(await prisma.productVariant.findUnique({ where: { id: variantId } }), "Variant");
    try {
      const bc = await prisma.productBarcode.create({ data: { barcode, variantId, type: ["EAN13", "ISBN", "INTERNAL", "SUPPLIER"].includes(b.type) ? b.type : "INTERNAL" } });
      await audit("catalog.create", "ProductBarcode", bc.barcode, auth.userId, { variantId: bc.variantId });
      return ok({ barcode: bc }, 201);
    } catch (err) {
      // Pre-check race or bad FK — map both to contract codes.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
        fail(409, "DUPLICATE", "Barcode already registered");
      mapNotFound(err);
      throw err;
    }
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requirePermission("product.update");
    const b = await req.json();
    const kind = b.kind as Kind;
    if (!KINDS.includes(kind) || !b.id) fail(400, "VALIDATION", "kind and id required");

    if (kind === "categories") {
      await requireRow(await prisma.category.findUnique({ where: { id: b.id } }), "Category");
      const data: { name?: string; parentId?: string | null } = {};
      if ("name" in b) data.name = reqStr(b.name, "name", 255);
      if ("parentId" in b) {
        if (!b.parentId) data.parentId = null;
        else {
          await requireRow(await prisma.category.findUnique({ where: { id: b.parentId } }), "Parent category");
          data.parentId = b.parentId;
        }
      }
      const cat = await prisma.category.update({ where: { id: b.id }, data });
      await audit("catalog.update", "Category", cat.id, auth.userId, { name: cat.name });
      return ok({ category: cat });
    }
    if (kind === "attributes") {
      await requireRow(await prisma.attributeDefinition.findUnique({ where: { id: b.id } }), "Attribute");
      const data: { label?: string; type?: string; enumValues?: string[]; required?: boolean } = {};
      if ("label" in b) data.label = reqStr(b.label, "label", 255);
      if ("type" in b) {
        const type = reqStr(b.type, "type", 32);
        if (!ATTRIBUTE_TYPES.includes(type)) fail(400, "VALIDATION", `type must be one of ${ATTRIBUTE_TYPES.join("|")}`);
        data.type = type;
      }
      if ("enumValues" in b) {
        if (!Array.isArray(b.enumValues)) fail(400, "VALIDATION", "enumValues must be an array");
        data.enumValues = b.enumValues.map(String).slice(0, 100);
      }
      if ("required" in b) data.required = !!b.required;
      const def = await prisma.attributeDefinition.update({ where: { id: b.id }, data });
      await audit("catalog.update", "AttributeDefinition", def.id, auth.userId, { label: def.label });
      return ok({ attribute: def });
    }
    if (kind === "brands" || kind === "authors" || kind === "publishers") {
      const name = reqStr(b.name, "name", 255);
      let row: { id: string; name: string };
      try {
        if (kind === "brands") row = await prisma.brand.update({ where: { id: b.id }, data: { name } });
        else if (kind === "authors") row = await prisma.author.update({ where: { id: b.id }, data: { name } });
        else row = await prisma.publisher.update({ where: { id: b.id }, data: { name } });
      } catch (err) {
        mapNotFound(err);
        throw err;
      }
      await audit("catalog.update", kind, row.id, auth.userId, { name: row.name });
      return ok({ row });
    }
    fail(400, "VALIDATION", "Barcodes are immutable — delete and re-add");
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requirePermission("product.update");
    const sp = req.nextUrl.searchParams;
    const kind = sp.get("kind") as Kind | null;
    const id = sp.get("id");
    if (!KINDS.includes(kind as Kind) || !id) fail(400, "VALIDATION", "kind and id required");

    const del = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        mapNotFound(err);
        throw err;
      }
    };

    if (kind === "categories") {
      const products = await prisma.product.count({ where: { categoryId: id } });
      const children = await prisma.category.count({ where: { parentId: id } });
      if (products || children) fail(409, "VALIDATION", "Category has products or subcategories — archive instead");
      await del(() => prisma.category.delete({ where: { id } }));
      await audit("catalog.delete", "Category", id, auth.userId);
      return ok({ deleted: true });
    }
    if (kind === "attributes") {
      const used = await prisma.attributeValue.count({ where: { definitionId: id } });
      if (used) fail(409, "VALIDATION", "Attribute has values in use");
      await del(() => prisma.attributeDefinition.delete({ where: { id } }));
      await audit("catalog.delete", "AttributeDefinition", id, auth.userId);
      return ok({ deleted: true });
    }
    if (kind === "brands") {
      const used = await prisma.product.count({ where: { brandId: id } });
      if (used) fail(409, "VALIDATION", "Brand in use by products");
      await del(() => prisma.brand.delete({ where: { id } }));
      await audit("catalog.delete", "Brand", id, auth.userId);
      return ok({ deleted: true });
    }
    if (kind === "authors") {
      const used = await prisma.product.count({ where: { authorId: id } });
      if (used) fail(409, "VALIDATION", "Author in use by products");
      await del(() => prisma.author.delete({ where: { id } }));
      await audit("catalog.delete", "Author", id, auth.userId);
      return ok({ deleted: true });
    }
    if (kind === "publishers") {
      const used = await prisma.product.count({ where: { publisherId: id } });
      if (used) fail(409, "VALIDATION", "Publisher in use by products");
      await del(() => prisma.publisher.delete({ where: { id } }));
      await audit("catalog.delete", "Publisher", id, auth.userId);
      return ok({ deleted: true });
    }
    // barcodes — delete by barcode value
    await del(() => prisma.productBarcode.delete({ where: { barcode: id } }));
    await audit("catalog.delete", "ProductBarcode", id, auth.userId);
    return ok({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
