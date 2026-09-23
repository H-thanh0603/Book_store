// Newsletter subscribe (C retention): real persistence, not local state.
// POST { email } — validates, rate-limits, upserts a ShopperNotification
// preference row (kind=newsletter_optin) so ops can export the list.
// The welcome mail is best-effort via sendMail.
import { NextRequest } from "next/server";
import { apiError, fail, ok } from "@/lib/api";
import { prisma, prismaRead } from "@/lib/db";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { sendMail } from "@/lib/mail";

async function storefrontOrgId(): Promise<string> {
  const store = await prismaRead.store.findFirst({
    where: { active: true }, orderBy: { code: "asc" },
    select: { region: { select: { orgId: true } } },
  });
  if (!store) fail(503, "NO_STORE", "No active store configured");
  return store.region.orgId;
}

export async function POST(req: NextRequest) {
  try {
    await enforceRateLimit("newsletter", clientIp(req.headers), 5, 60_000);
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255)
      fail(400, "VALIDATION", "Email chưa đúng");
    const orgId = await storefrontOrgId();
    const existing = await prismaRead.shopperNotification.findFirst({
      where: { orgId, email, kind: "newsletter_optin" }, select: { id: true },
    });
    if (!existing) {
      await prisma.shopperNotification.create({
        data: {
          orgId, email, kind: "newsletter_optin",
          title: "Đăng ký bản tin Melio", body: email, status: "SENT",
        },
      });
      await sendMail({
        to: email,
        subject: "Chào mừng đến với bản tin Melio 📚",
        text: "Cảm ơn bạn đã đăng ký! Mỗi tuần: sách mới, mã giảm giá độc quyền, lịch giao lưu tác giả.",
        html: "<p>Cảm ơn bạn đã đăng ký! Mỗi tuần: <b>sách mới</b>, <b>mã giảm giá độc quyền</b>, lịch giao lưu tác giả.</p>",
      }).catch(() => {});
    }
    return ok({ subscribed: true }, 201);
  } catch (err) {
    return apiError(err);
  }
}
