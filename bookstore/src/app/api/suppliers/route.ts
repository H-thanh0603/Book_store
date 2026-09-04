import { NextRequest } from "next/server";
import { prisma, prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, nextBusinessNumber } from "@/lib/api";
import { withOrg } from "@/lib/org-scope";
import { Prisma } from "@/generated/prisma/client";

// GET /api/suppliers — List suppliers
export async function GET(req: NextRequest) {
  let auth;
  try {
    auth = await requirePermission("purchasing:read");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const activeOnly = url.searchParams.get("active") !== "false";

  const where: Prisma.SupplierWhereInput = withOrg(auth, {});
  if (activeOnly) where.active = true;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { contactName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ];
  }

  const suppliers = await prismaRead.supplier.findMany({
    where,
    orderBy: { name: "asc" },
    take: 200,
  });

  return ok({ suppliers });
}

// POST /api/suppliers — Create supplier
export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await requirePermission("purchasing:manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const body = await req.json().catch(() => ({}));
  const { name, taxCode, contactName, phone, email, address, paymentTerms, leadTimeDays, isConsignment } = body;

  if (!name?.trim()) return apiError({ status: 400, code: "VALIDATION", message: "Name is required" });
  if (phone && !/^\+?\d{9,15}$/.test(phone.replace(/[\s().-]/g, ""))) {
    return apiError({ status: 400, code: "VALIDATION", message: "Invalid phone number" });
  }
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return apiError({ status: 400, code: "VALIDATION", message: "Invalid email" });
  }

  const code = await nextBusinessNumber("SUP");
  const supplier = await prisma.supplier.create({
    data: {
      code,
      orgId: auth.orgId ?? (await prisma.organization.findFirstOrThrow({ orderBy: { createdAt: "asc" } })).id,
      name: name.trim(),
      taxCode: taxCode?.trim() || null,
      contactName: contactName?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      address: address?.trim() || null,
      paymentTerms: paymentTerms?.trim() || null,
      leadTimeDays: typeof leadTimeDays === "number" ? leadTimeDays : 7,
      isConsignment: Boolean(isConsignment),
    },
  });

  return ok({ supplier });
}
