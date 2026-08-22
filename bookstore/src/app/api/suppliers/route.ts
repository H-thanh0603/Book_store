// Agent 2: Supplier CRUD + supplier-product price history.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, toMoney } from "@/lib/api";

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
    if (!b.code || !b.name) fail(400, "VALIDATION", "code and name required");
    const existing = await prisma.supplier.findUnique({ where: { code: b.code } });
    if (existing) fail(409, "DUPLICATE", `Supplier code ${b.code} exists`);
    const supplier = await prisma.supplier.create({
      data: {
        code: b.code, name: b.name, taxCode: b.taxCode ?? null,
        contactName: b.contactName ?? null, phone: b.phone ?? null,
        email: b.email ?? null, address: b.address ?? null,
        paymentTerms: b.paymentTerms ?? null,
        leadTimeDays: Number.isInteger(b.leadTimeDays) ? b.leadTimeDays : 7,
        isConsignment: !!b.isConsignment,
      },
    });
    await prisma.auditLog.create({
      data: { actorId: auth.userId, action: "supplier.create", entity: "Supplier", entityId: supplier.id, after: { code: supplier.code, name: supplier.name } },
    });
    return ok({ supplier }, 201);
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
    const before = await prisma.supplier.findUnique({ where: { id: b.id } });
    if (!before) fail(404, "NOT_FOUND", "Supplier not found");
    const data: Record<string, unknown> = {};
    for (const k of ["name", "taxCode", "contactName", "phone", "email", "address", "paymentTerms", "active", "isConsignment"]) {
      if (k in b) data[k] = b[k];
    }
    if ("leadTimeDays" in b) data.leadTimeDays = Number(b.leadTimeDays) || 0;
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
