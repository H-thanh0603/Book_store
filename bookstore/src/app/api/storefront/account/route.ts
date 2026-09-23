import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireCustomerAuth } from "@/lib/customer-auth";
import { apiError, fail, ok } from "@/lib/api";

/** The signed-in shopper's loyalty balance; never accepts a customer id. */
export async function GET() {
  try {
    const auth = await requireCustomerAuth();
    const customer = await prisma.customer.findUnique({
      where: { id: auth.customerId },
      select: {
        code: true,
        birthday: true,
        loyalty: {
          select: {
            points: true,
            tier: true,
            transactions: {
              orderBy: { createdAt: "desc" },
              take: 20,
              select: { id: true, points: true, balanceAfter: true, type: true, createdAt: true },
            },
          },
        },
      },
    });
    if (!customer) fail(401, "FORBIDDEN", "Khách không tồn tại");

    return ok({
      member: {
        code: customer.code,
        birthday: customer.birthday ? customer.birthday.toISOString().slice(0, 10) : null,
        points: customer.loyalty?.points ?? 0,
        tier: customer.loyalty?.tier ?? "Member",
        transactions: customer.loyalty?.transactions ?? [],
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

/** PATCH { birthday: "YYYY-MM-DD" | null } — let members add it later. */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireCustomerAuth();
    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.birthday === "string" ? body.birthday.trim() : "";
    let birthday: Date | null = null;
    if (raw) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
      if (!m) fail(400, "VALIDATION", "birthday must be YYYY-MM-DD");
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
      if (Number.isNaN(d.getTime()) || d > new Date()) fail(400, "VALIDATION", "birthday invalid");
      birthday = d;
    }
    const customer = await prisma.customer.update({
      where: { id: auth.customerId },
      data: { birthday },
      select: { birthday: true },
    });
    return ok({ birthday: customer.birthday ? customer.birthday.toISOString().slice(0, 10) : null });
  } catch (error) {
    return apiError(error);
  }
}
