// Agent 2: Store CRUD. GET is a lookup (existing behavior preserved), POST/PATCH add management.
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission, requireAuth, resolveStoreScope } from "@/lib/auth";
import { apiError, ok, fail, reqStr, optBool, requireRef } from "@/lib/api";

export async function GET() {
  try {
    const auth = await requireAuth();
    const scope = resolveStoreScope(auth);
    const stores = await prisma.store.findMany({
      where: scope ? { id: { in: scope } } : undefined,
      select: { id: true, name: true, code: true },
    });
    return ok({ stores });
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/stores { code, name, regionId? } — creates store + default stockroom location
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("admin.config");
    const b = await req.json();
    const code = reqStr(b.code, "code", 16);
    const name = reqStr(b.name, "name");
    if (await prisma.store.findUnique({ where: { code } })) fail(409, "DUPLICATE", `Store code ${code} exists`);
    let regionId = b.regionId ?? null;
    if (regionId) requireRef(await prisma.region.findUnique({ where: { id: String(regionId) }, select: { id: true } }), "Region");
    regionId ??= (await prisma.region.findFirst())?.id;
    try {
      const store = await prisma.store.create({
        data: {
          code, name, regionId,
          stockLocations: { create: { name: `${name} — Kho sau`, type: "STORE_STOCKROOM" } },
        },
        include: { stockLocations: true },
      });
      await prisma.auditLog.create({
        data: { actorId: auth.userId, action: "store.create", entity: "Store", entityId: store.id, after: { code: store.code, name: store.name } },
      });
      return ok({ store }, 201);
    } catch (err) {
      // Unique-code race lost → clean 409 instead of a raw 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
        fail(409, "DUPLICATE", `Store code ${code} exists`);
      throw err;
    }
  } catch (err) {
    return apiError(err);
  }
}

// PATCH /api/stores { id, name?, active?, opensAt?, closesAt? }
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requirePermission("admin.config");
    const b = await req.json();
    if (!b.id) fail(400, "VALIDATION", "id required");
    const before = requireRef(await prisma.store.findUnique({ where: { id: b.id } }), "Store");
    const data: Record<string, unknown> = {};
    if ("name" in b) data.name = reqStr(b.name, "name");
    const active = optBool(b.active, "active");
    if (active !== undefined) data.active = active;
    const store = await prisma.store.update({ where: { id: b.id }, data });
    await prisma.auditLog.create({
      data: { actorId: auth.userId, action: "store.update", entity: "Store", entityId: store.id, before: { name: before.name, active: before.active }, after: { name: store.name, active: store.active } },
    });
    return ok({ store });
  } catch (err) {
    return apiError(err);
  }
}
