// Agent 2: Catalog taxonomy CRUD (categories, attributes, brands, authors, publishers, barcodes).
// POST /api/catalog { kind, ...data } / PATCH { kind, id, ...data } / DELETE ?kind=&id=
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";

const KINDS = ["categories", "attributes", "brands", "authors", "publishers", "barcodes"] as const;
type Kind = (typeof KINDS)[number];

function audit(action: string, entity: string, entityId: string, userId: string, after?: unknown, before?: unknown) {
  return prisma.auditLog.create({
    data: { actorId: userId, action, entity, entityId, after: after as never, before: before as never },
  });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("product.update");
    const b = await req.json();
    const kind = b.kind as Kind;
    if (!KINDS.includes(kind)) fail(400, "VALIDATION", `kind must be one of ${KINDS.join("|")}`);

    if (kind === "categories") {
      if (!b.name) fail(400, "VALIDATION", "name required");
      const cat = await prisma.category.create({ data: { name: b.name, parentId: b.parentId ?? null } });
      await audit("catalog.create", "Category", cat.id, auth.userId, { name: cat.name });
      return ok({ category: cat }, 201);
    }
    if (kind === "attributes") {
      if (!b.categoryId || !b.code || !b.label || !b.type) fail(400, "VALIDATION", "categoryId, code, label, type required");
      const dup = await prisma.attributeDefinition.findUnique({ where: { categoryId_code: { categoryId: b.categoryId, code: b.code } } });
      if (dup) fail(409, "DUPLICATE", "Attribute code exists for this category");
      const def = await prisma.attributeDefinition.create({
        data: { categoryId: b.categoryId, code: b.code, label: b.label, type: b.type, enumValues: Array.isArray(b.enumValues) ? b.enumValues : [], required: !!b.required },
      });
      await audit("catalog.create", "AttributeDefinition", def.id, auth.userId, { code: def.code });
      return ok({ attribute: def }, 201);
    }
    if (kind === "brands" || kind === "authors" || kind === "publishers") {
      if (!b.name) fail(400, "VALIDATION", "name required");
      let row: { id: string; name: string };
      if (kind === "brands") row = await prisma.brand.create({ data: { name: b.name } });
      else if (kind === "authors") row = await prisma.author.create({ data: { name: b.name } });
      else row = await prisma.publisher.create({ data: { name: b.name } });
      await audit("catalog.create", kind, row.id, auth.userId, { name: row.name });
      return ok({ [kind.slice(0, -1)]: row }, 201);
    }
    // barcodes
    if (!b.barcode || !b.variantId) fail(400, "VALIDATION", "barcode and variantId required");
    if (await prisma.productBarcode.findUnique({ where: { barcode: b.barcode } })) fail(409, "DUPLICATE", "Barcode already registered");
    const bc = await prisma.productBarcode.create({ data: { barcode: b.barcode, variantId: b.variantId, type: b.type ?? "INTERNAL" } });
    await audit("catalog.create", "ProductBarcode", bc.barcode, auth.userId, { variantId: bc.variantId });
    return ok({ barcode: bc }, 201);
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
      const cat = await prisma.category.update({ where: { id: b.id }, data: { name: b.name, parentId: b.parentId } });
      await audit("catalog.update", "Category", cat.id, auth.userId, { name: cat.name });
      return ok({ category: cat });
    }
    if (kind === "attributes") {
      const def = await prisma.attributeDefinition.update({
        where: { id: b.id },
        data: { label: b.label, type: b.type, enumValues: b.enumValues, required: b.required },
      });
      await audit("catalog.update", "AttributeDefinition", def.id, auth.userId, { label: def.label });
      return ok({ attribute: def });
    }
    if (kind === "brands" || kind === "authors" || kind === "publishers") {
      let row: { id: string; name: string };
      if (kind === "brands") row = await prisma.brand.update({ where: { id: b.id }, data: { name: b.name } });
      else if (kind === "authors") row = await prisma.author.update({ where: { id: b.id }, data: { name: b.name } });
      else row = await prisma.publisher.update({ where: { id: b.id }, data: { name: b.name } });
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

    if (kind === "categories") {
      const products = await prisma.product.count({ where: { categoryId: id } });
      const children = await prisma.category.count({ where: { parentId: id } });
      if (products || children) fail(409, "VALIDATION", "Category has products or subcategories — archive instead");
      await prisma.category.delete({ where: { id } });
      await audit("catalog.delete", "Category", id, auth.userId);
      return ok({ deleted: true });
    }
    if (kind === "attributes") {
      const used = await prisma.attributeValue.count({ where: { definitionId: id } });
      if (used) fail(409, "VALIDATION", "Attribute has values in use");
      await prisma.attributeDefinition.delete({ where: { id } });
      await audit("catalog.delete", "AttributeDefinition", id, auth.userId);
      return ok({ deleted: true });
    }
    if (kind === "brands") {
      const used = await prisma.product.count({ where: { brandId: id } });
      if (used) fail(409, "VALIDATION", "Brand in use by products");
      await prisma.brand.delete({ where: { id } });
      await audit("catalog.delete", "Brand", id, auth.userId);
      return ok({ deleted: true });
    }
    if (kind === "authors") {
      const used = await prisma.product.count({ where: { authorId: id } });
      if (used) fail(409, "VALIDATION", "Author in use by products");
      await prisma.author.delete({ where: { id } });
      await audit("catalog.delete", "Author", id, auth.userId);
      return ok({ deleted: true });
    }
    if (kind === "publishers") {
      const used = await prisma.product.count({ where: { publisherId: id } });
      if (used) fail(409, "VALIDATION", "Publisher in use by products");
      await prisma.publisher.delete({ where: { id } });
      await audit("catalog.delete", "Publisher", id, auth.userId);
      return ok({ deleted: true });
    }
    // barcodes — delete by barcode value
    await prisma.productBarcode.delete({ where: { barcode: id } });
    await audit("catalog.delete", "ProductBarcode", id, auth.userId);
    return ok({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
