import { NextRequest } from "next/server";
import { prisma, prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";

// PUT /api/suppliers/[id] — Update supplier
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("purchasing:manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const existing = await prismaRead.supplier.findUnique({ where: { id } });
  if (!existing) return apiError({ status: 404, code: "NOT_FOUND", message: "Supplier not found" });

  const supplier = await prisma.supplier.update({
    where: { id },
    data: {
      name: body.name?.trim() || existing.name,
      taxCode: body.taxCode !== undefined ? (body.taxCode?.trim() || null) : existing.taxCode,
      contactName: body.contactName !== undefined ? (body.contactName?.trim() || null) : existing.contactName,
      phone: body.phone !== undefined ? (body.phone?.trim() || null) : existing.phone,
      email: body.email !== undefined ? (body.email?.trim() || null) : existing.email,
      address: body.address !== undefined ? (body.address?.trim() || null) : existing.address,
      paymentTerms: body.paymentTerms !== undefined ? (body.paymentTerms?.trim() || null) : existing.paymentTerms,
      leadTimeDays: typeof body.leadTimeDays === "number" ? body.leadTimeDays : existing.leadTimeDays,
      isConsignment: typeof body.isConsignment === "boolean" ? body.isConsignment : existing.isConsignment,
      active: typeof body.active === "boolean" ? body.active : existing.active,
    },
  });

  return ok({ supplier });
}

// DELETE /api/suppliers/[id] — Soft delete (deactivate) supplier
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("purchasing:manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const existing = await prismaRead.supplier.findUnique({ where: { id } });
  if (!existing) return apiError({ status: 404, code: "NOT_FOUND", message: "Supplier not found" });

  await prisma.supplier.update({ where: { id }, data: { active: false } });
  return ok({ message: "Supplier deactivated" });
}

// GET /api/suppliers/[id] — Get single supplier with product prices
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("purchasing:read");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const { id } = await params;
  const supplier = await prismaRead.supplier.findUnique({
    where: { id },
    include: {
      productPrices: {
        include: {
          variant: { include: { product: { select: { name: true } } } },
        },
        orderBy: { recordedAt: "desc" },
        take: 100,
      },
      purchaseOrders: {
        select: { id: true, number: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!supplier) return apiError({ status: 404, code: "NOT_FOUND", message: "Not found" });
  return ok({ supplier });
}
