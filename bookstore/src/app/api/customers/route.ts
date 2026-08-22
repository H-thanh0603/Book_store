import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";

// GET /api/customers?q=  — list + loyalty balance
export async function GET(req: NextRequest) {
  try {
    await requirePermission("customer.view");
    const q = req.nextUrl.searchParams.get("q");
    const customers = await prisma.customer.findMany({
      where: q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { code: { contains: q, mode: "insensitive" } }] }
        : {},
      include: { loyalty: true },
      orderBy: { code: "desc" },
      take: 50,
    });
    return ok({ customers });
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/customers { action:"create"|"history", ... }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "create") {
      await requirePermission("customer.update");
      if (!body.name || !body.phone) fail(400, "VALIDATION", "name and phone required");
      const count = await prisma.customer.count();
      const customer = await prisma.customer.create({
        data: {
          code: `CUS-${String(count + 1).padStart(6, "0")}`,
          name: body.name,
          phone: body.phone,
          email: body.email ?? null,
          birthday: body.birthday ? new Date(body.birthday) : null,
          address: body.address ?? null,
        },
        include: { loyalty: true },
      });
      return ok({ customer }, 201);
    }

    if (body.action === "history") {
      await requirePermission("customer.view");
      const acct = await prisma.loyaltyAccount.findUnique({
        where: { customerId: body.customerId },
        include: { transactions: { orderBy: { createdAt: "desc" }, take: 50 } },
      });
      if (!acct) return ok({ points: 0, tier: null, transactions: [] });
      return ok({ points: acct.points, tier: acct.tier, transactions: acct.transactions });
    }

    fail(400, "VALIDATION", "Unknown action");
  } catch (err) {
    return apiError(err);
  }
}
