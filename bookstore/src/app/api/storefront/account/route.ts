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
        points: customer.loyalty?.points ?? 0,
        tier: customer.loyalty?.tier ?? "Member",
        transactions: customer.loyalty?.transactions ?? [],
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
