// Agent 2: Store CRUD. GET is a lookup (existing behavior preserved), POST/PATCH add management.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, requireAuth } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";

export async function GET() {
  try {
    await requireAuth();
    const stores = await prisma.store.findMany({ select: { id: true, name: true, code: true } });
    return ok({ stores });
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/stores { code, name } — creates store + default stockroom location
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("admin.config");
    const b = await req.json();
    if (!b.code || !b.name) fail(400, "VALIDATION", "code and name required");
    if (await prisma.store.findUnique({ where: { code: b.code } })) fail(409, "DUPLICATE", `Store code ${b.code} exists`);
    const store = await prisma.store.create({
      data: {
        code: b.code, name: b.name,
        regionId: b.regionId ?? (await prisma.region.findFirst())?.id,
        stockLocations: { create: { name: `${b.name} — Kho sau`, type: "STORE_STOCKROOM" } },
      },
      include: { stockLocations: true },
    });
    await prisma.auditLog.create({
      data: { actorId: auth.userId, action: "store.create", entity: "Store", entityId: store.id, after: { code: store.code, name: store.name } },
    });
    return ok({ store }, 201);
  } catch (err) {
    return apiError(err);
  }
}

// PATCH /api/stores { id, name?, active? }
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requirePermission("admin.config");
    const b = await req.json();
    if (!b.id) fail(400, "VALIDATION", "id required");
    const before = await prisma.store.findUnique({ where: { id: b.id } });
    if (!before) fail(404, "NOT_FOUND", "Store not found");
    const store = await prisma.store.update({
      where: { id: b.id },
      data: { name: b.name ?? before.name },
    });
    await prisma.auditLog.create({
      data: { actorId: auth.userId, action: "store.update", entity: "Store", entityId: store.id, before: { name: before.name }, after: { name: store.name } },
    });
    return ok({ store });
  } catch (err) {
    return apiError(err);
  }
}
