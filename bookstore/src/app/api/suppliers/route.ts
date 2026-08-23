// Agent 2: Supplier CRUD + supplier-product price history.
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, toMoney, reqStr, optStr, optBool, reqInt, requireRef } from "@/lib/api";

// GET /api/suppliers?q=&active=
export async function GET(req: NextRequest) {
  try {
    await requirePermission("purchase.create");
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q");
    const suppliers = await prisma.supplier.findMany({
      where: {
        AND: [
          sp.get("active") === "false" ? { active: false } : { active: true },
          q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }] } : {},
        ],
      },
      orderBy: { name: "asc" },
      take: 200,
    });
    return ok({ suppliers });
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/suppliers — create
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("purchase.create");
    const b = await req.json();
    const code = reqStr(b.code, "code", 32);
    const name = reqStr(b.name, "name");
    try {
      const supplier = await prisma.supplier.create({
        data: {
          code, name,
          taxCode: optStr(b.taxCode, "taxCode", 64),
          contactName: optStr(b.contactName, "contactName"),
          phone: optStr(b.phone, "phone", 32),
          email: optStr(b.email, "email", 254),
          address: optStr(b.address, "address", 500),
          paymentTerms: optStr(b.paymentTerms, "paymentTerms", 64),
          leadTimeDays: b.leadTimeDays === undefined ? 7 : reqInt(b.leadTimeDays, "leadTimeDays", 0, 365),
          isConsignment: !!b.isConsignment,
        },
      });
      await prisma.auditLog.create({
        data: { actorId: auth.userId, action: "supplier.create", entity: "Supplier", entityId: supplier.id, after: { code: supplier.code, name: supplier.name } },
      });
      return ok({ supplier }, 201);
    } catch (err) {
      // Unique-code race lost → clean 409 instead of a raw 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
        fail(409, "DUPLICATE", `Supplier code ${code} exists`);
      throw err;
    }
  } catch (err) {
    return apiError(err);
  }
}

// PATCH /api/suppliers { id, ...fields } — update
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requirePermission("purchase.create");
    const b = await req.json();
    if (!b.id) fail(400, "VALIDATION", "id required");
    const before = requireRef(await prisma.supplier.findUnique({ where: { id: b.id } }), "Supplier");
    // Whitelist with type validation — junk types get a 400, never a Prisma 500.
    const data: Record<string, unknown> = {};
    for (const k of ["name", "taxCode", "contactName", "phone", "email", "address", "paymentTerms"] as const) {
      if (k in b) data[k] = k === "name" ? reqStr(b[k], "name") : optStr(b[k], k);
    }
    const active = optBool(b.active, "active");
    if (active !== undefined) data.active = active;
    const isConsignment = optBool(b.isConsignment, "isConsignment");
    if (isConsignment !== undefined) data.isConsignment = isConsignment;
    if ("leadTimeDays" in b) data.leadTimeDays = reqInt(b.leadTimeDays, "leadTimeDays", 0, 365);
    const supplier = await prisma.supplier.update({ where: { id: b.id }, data });
    await prisma.auditLog.create({
      data: { actorId: auth.userId, action: "supplier.update", entity: "Supplier", entityId: supplier.id, before: { name: before.name, active: before.active }, after: { name: supplier.name, active: supplier.active } },
    });
    return ok({ supplier });
  } catch (err) {
    return apiError(err);
  }
}

// PUT /api/suppliers — record a supplier-product price (price history entry)
export async function PUT(req: NextRequest) {
  try {
    const auth = await requirePermission("purchase.create");
    const b = await req.json();
    if (!b.supplierId || !b.variantId) fail(400, "VALIDATION", "supplierId and variantId required");
    // FK targets must exist — clean 404s instead of raw P2003 500s.
    requireRef(await prisma.supplier.findUnique({ where: { id: String(b.supplierId) }, select: { id: true } }), "Supplier");
    requireRef(await prisma.productVariant.findUnique({ where: { id: String(b.variantId) }, select: { id: true } }), "Variant");
    const unitCost = toMoney(b.unitCost, "unitCost");
    const price = await prisma.supplierProductPrice.create({
      data: { supplierId: b.supplierId, variantId: b.variantId, unitCost },
    });
    await prisma.auditLog.create({
      data: { actorId: auth.userId, action: "supplier.price_record", entity: "SupplierProductPrice", entityId: price.id, after: { supplierId: b.supplierId, variantId: b.variantId, unitCost: unitCost.toString() } },
    });
    return ok({ price: { ...price, unitCost: Number(unitCost) } }, 201);
  } catch (err) {
    return apiError(err);
  }
}

// GET price history via /api/suppliers/prices?supplierId=&variantId= lives in prices/route.ts
export async function DELETE() {
  return fail(405, "VALIDATION", "Use PATCH with active=false to deactivate a supplier");
}
