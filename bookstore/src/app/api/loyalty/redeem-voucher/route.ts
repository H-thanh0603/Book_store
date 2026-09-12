import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, getSystemConfig } from "@/lib/api";

// Tier benefits (N4c) — single source shared by the API response, the staff
// customers page and the shop account page. Thresholds mirror syncTier in
// customers/route.ts (Member 0 / Silver 300 / Gold 1000 / Platinum 3000).
export const TIER_BENEFITS: Record<string, string[]> = {
  Member: ["Tích 1 điểm cho mỗi 10.000 ₫ mua sắm", "Nhận voucher sinh nhật 20.000 ₫"],
  Silver: ["Mọi quyền lợi Member", "Đổi điểm lấy voucher (100 điểm = 10.000 ₫)", "Ưu đãi độc quyền mỗi tháng"],
  Gold: ["Mọi quyền lợi Silver", "Giảm thêm 5% toàn bộ đơn hàng", "Ưu tiên đặt trước ấn bản giới hạn"],
  Platinum: ["Mọi quyền lợi Gold", "Giảm thêm 10% toàn bộ đơn hàng", "Quà sinh nhật đặc biệt + giao hàng miễn phí"],
};

function randomCode(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) s += chars[b % chars.length];
  return `${prefix}-${s}`;
}

// POST /api/loyalty/redeem-voucher { customerId, points } — N4a: burn loyalty
// points into a single-use fixed-amount voucher (usable online + POS, same
// couponCode path). Atomic: decrement guarded by balance, ledger row, promo
// row — one transaction, no lost-update re-credit.
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("customer.update");
    const body = (await req.json().catch(() => ({}))) as { customerId?: string; points?: number };
    if (!body.customerId || !Number.isInteger(body.points) || (body.points as number) <= 0)
      throw Object.assign(new Error("customerId and positive integer points are required"), { status: 400, code: "VALIDATION" });
    const minPoints = await getSystemConfig<number>("loyalty.voucherMinPoints", 100);
    const vndPerPoint = await getSystemConfig<number>("loyalty.vndPerPoint", 100);
    if ((body.points as number) < minPoints)
      throw Object.assign(new Error(`Tối thiểu ${minPoints} điểm để đổi voucher`), { status: 400, code: "VALIDATION" });

    const customer = await prisma.customer.findFirst({
      where: { id: body.customerId, ...(auth.orgId ? { orgId: auth.orgId } : {}) },
      select: { id: true, orgId: true, name: true },
    });
    if (!customer)
      throw Object.assign(new Error("Customer not found"), { status: 404, code: "NOT_FOUND" });

    const value = BigInt(body.points as number) * BigInt(vndPerPoint);
    const result = await prisma.$transaction(async (tx) => {
      const acct = await tx.loyaltyAccount.upsert({
        where: { customerId: customer.id },
        create: { customerId: customer.id },
        update: {},
      });
      const debited = await tx.loyaltyAccount.updateMany({
        where: { id: acct.id, points: { gte: body.points as number } },
        data: { points: { decrement: body.points as number } },
      });
      if (debited.count !== 1)
        throw Object.assign(new Error("Không đủ điểm"), { status: 400, code: "VALIDATION" });
      const after = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: acct.id } });
      await tx.loyaltyTransaction.create({
        data: {
          accountId: acct.id,
          points: -(body.points as number),
          balanceAfter: after.points,
          type: "REDEEM",
          refType: "voucher",
          refId: customer.id,
        },
      });
      const promo = await tx.promotion.create({
        data: {
          name: `Voucher đổi điểm — ${customer.name}`,
          orgId: customer.orgId,
          code: randomCode("DOI"),
          type: "fixed",
          value,
          channel: "ALL",
          usageLimit: 1,
          perCustomerLimit: 1,
          startAt: new Date(),
          endAt: new Date(Date.now() + 90 * 86_400_000),
        },
      });
      return { promo, balanceAfter: after.points };
    });
    return NextResponse.json(
      { code: result.promo.code, value: Number(value), balanceAfter: result.balanceAfter },
      { status: 201 }
    );
  } catch (e) {
    return apiError(e);
  }
}

// GET /api/loyalty/redeem-voucher — tier benefits table for UIs.
export async function GET() {
  return NextResponse.json({ benefits: TIER_BENEFITS });
}
