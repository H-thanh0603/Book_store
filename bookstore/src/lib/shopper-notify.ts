// Proactive shopper pings (P3): back-in-stock alerts and abandoned-cart
// nudges. Runs as the "shopper.notify" job — workers poll PENDING StockAlerts
// whose variant is back in stock, and carts idle > 24h with no reminder yet.
// Every ping lands in ShopperNotification; email is best-effort via sendMail
// (logs when SMTP unconfigured — still onsite-visible via the API).

import { prisma, prismaRead } from "./db";
import { sendMail } from "./mail";

const CART_IDLE_MS = 24 * 60 * 60_000;

export async function scanBackInStock() {
  const pending = await prismaRead.stockAlert.findMany({
    where: { status: "PENDING" },
    include: { customer: { select: { email: true, phone: true, name: true } } },
    take: 200,
  });
  if (pending.length === 0) return { alerts: 0, notified: 0 };

  const variantIds = [...new Set(pending.map((a) => a.variantId))];
  // Available = onHand - reserved > 0 at ANY active location.
  const stocked = await prismaRead.$queryRaw<{ variantId: string }[]>`
    SELECT DISTINCT b."variantId" AS variantId
    FROM "InventoryBalance" b
    JOIN "StockLocation" l ON l.id = b."locationId"
    WHERE l.active AND (b."onHand" - b.reserved) > 0
      AND b."variantId" = ANY(${variantIds}::text[])`;
  const inStock = new Set(stocked.map((r) => r.variantId));
  if (inStock.size === 0) return { alerts: pending.length, notified: 0 };

  const products = await prismaRead.productVariant.findMany({
    where: { id: { in: [...inStock] } },
    select: { id: true, product: { select: { name: true } } },
  });
  const nameById = new Map(products.map((v) => [v.id, v.product.name]));

  let notified = 0;
  for (const alert of pending) {
    if (!inStock.has(alert.variantId)) continue;
    const name = nameById.get(alert.variantId) ?? "món hàng bạn quan tâm";
    await prisma.shopperNotification.create({
      data: {
        orgId: alert.orgId,
        ...(alert.customerId ? { customerId: alert.customerId } : {}),
        ...(alert.phone ? { phone: alert.phone } : {}),
        ...(alert.email ?? alert.customer?.email ? { email: alert.email ?? alert.customer!.email } : {}),
        kind: "back_in_stock",
        title: "Món bạn chờ đã có hàng trở lại!",
        body: `"${name}" đã trở lại kệ sách. Ghé /shop để đặt ngay trước khi hết nhé.`,
        refId: alert.variantId,
      },
    });
    const email = alert.email ?? alert.customer?.email;
    if (email) {
      const body = `"${name}" đã trở lại kệ sách. Ghé /shop để đặt ngay trước khi hết nhé.`;
      await sendMail({ to: email, subject: "Melio: món bạn chờ đã có hàng trở lại", text: body, html: `<p>${body}</p>` }).catch(() => {});
    }
    await prisma.stockAlert.update({
      where: { id: alert.id },
      data: { status: "NOTIFIED", notifiedAt: new Date() },
    });
    notified++;
  }
  return { alerts: pending.length, notified };
}

export async function scanAbandonedCarts() {
  const cutoff = new Date(Date.now() - CART_IDLE_MS);
  // Carts touched since the last reminder (or never reminded) and idle for a
  // day. `remindedAt` dedupes: one nudge per cart lifetime.
  const stale = await prismaRead.serverCart.findMany({
    where: {
      OR: [{ remindedAt: null }, { remindedAt: { lt: cutoff } }],
      updatedAt: { lt: cutoff },
    },
    include: { customer: { select: { email: true, name: true } } },
    take: 100,
  });
  let nudged = 0;
  for (const cart of stale) {
    const lines = cart.items as { variantId: string; quantity: number }[];
    if (!Array.isArray(lines) || lines.length === 0) continue;
    await prisma.shopperNotification.create({
      data: {
        orgId: cart.orgId,
        ...(cart.customerId ? { customerId: cart.customerId } : {}),
        ...(cart.phone ? { phone: cart.phone } : {}),
        ...(cart.customer?.email ? { email: cart.customer.email } : {}),
        kind: "abandoned_cart",
        title: "Giỏ sách của bạn vẫn đang chờ",
        body: `Bạn còn ${lines.length} món trong giỏ ở Melio. Quay lại /shop để hoàn tất nhé — hàng chỉ giữ khi bạn đặt.`,
      },
    });
    if (cart.customer?.email) {
      const body = `Bạn còn ${lines.length} món trong giỏ ở Melio. Quay lại /shop để hoàn tất nhé — hàng chỉ giữ khi bạn đặt.`;
      await sendMail({ to: cart.customer.email, subject: "Melio: giỏ của bạn vẫn đang chờ", text: body, html: `<p>${body}</p>` }).catch(() => {});
    }
    await prisma.serverCart.update({
      where: { id: cart.id },
      data: { remindedAt: new Date() },
    });
    nudged++;
  }
  return { carts: stale.length, nudged };
}

export async function runShopperNotify() {
  const [stock, carts, wishlist, birthday] = await Promise.all([
    scanBackInStock(), scanAbandonedCarts(), scanWishlistPriceDrops(), scanBirthdayReminders(),
  ]);
  return { backInStock: stock, abandonedCarts: carts, wishlistPriceDrops: wishlist, birthday: birthday };
}

/**
 * Wishlist price drops: a wished variant whose current online/retail price
 * fell below its 30-day average. One ping per variant per 7 days (dedup via
 * refId + kind + recent createdAt) so a long sale doesn't spam.
 */
export async function scanWishlistPriceDrops(): Promise<{ checked: number; notified: number }> {
  const wishes = await prismaRead.wishlistItem.findMany({
    include: {
      customer: { select: { email: true, name: true } },
      variant: {
        select: {
          id: true, orgId: true,
          product: { select: { name: true } },
          prices: {
            where: { priceList: { kind: { in: ["online", "retail"] } } },
            select: { amount: true, validFrom: true, priceList: { select: { kind: true } } },
            orderBy: { validFrom: "desc" },
            take: 10,
          },
        },
      },
    },
    take: 500,
  });
  if (wishes.length === 0) return { checked: 0, notified: 0 };
  let notified = 0;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  for (const w of wishes) {
    const online = w.variant.prices.filter((p) => p.priceList.kind === "online");
    const pool = online.length > 0 ? online : w.variant.prices;
    if (pool.length < 2) continue;
    const current = pool[0].amount;
    const older = pool.slice(1);
    const avg = older.reduce((s, p) => s + p.amount, 0n) / BigInt(older.length);
    if (avg <= 0n || current >= avg) continue;
    const recent = await prismaRead.shopperNotification.findFirst({
      where: { kind: "wishlist_price_drop", refId: w.variantId, customerId: w.customerId, createdAt: { gte: weekAgo } },
      select: { id: true },
    });
    if (recent) continue;
    const name = w.variant.product.name;
    const dropPct = Math.round(Number((avg - current) * 100n / avg));
    await prisma.shopperNotification.create({
      data: {
        orgId: w.variant.orgId,
        customerId: w.customerId,
        ...(w.customer?.email ? { email: w.customer.email } : {}),
        kind: "wishlist_price_drop",
        title: "Sách yêu thích đang giảm giá!",
        body: `"${name}" giảm còn ${Number(current).toLocaleString("vi-VN")}₫ (−${dropPct}%). Ghé /shop trước khi hết đợt nhé.`,
        refId: w.variantId,
      },
    });
    if (w.customer?.email) {
      const body = `"${name}" trong wishlist của bạn giảm còn ${Number(current).toLocaleString("vi-VN")}₫ (−${dropPct}%).`;
      await sendMail({ to: w.customer.email, subject: "Melio: sách yêu thích đang giảm giá", text: body, html: `<p>${body}</p>` }).catch(() => {});
    }
    notified++;
  }
  return { checked: wishes.length, notified };
}

/**
 * Birthday reminders: customers whose birthday is today get an onsite ping
 * pointing at the auto-issued BDAY voucher (issueBirthdayVouchers job).
 * Dedup: one per customer per year via refId = BDAY code.
 */
export async function scanBirthdayReminders(): Promise<{ checked: number; notified: number }> {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const year = today.getFullYear();
  const customers = await prismaRead.$queryRaw<{ id: string; orgId: string; name: string; email: string | null }[]>`
    SELECT id, "orgId", name, email FROM "Customer"
    WHERE EXTRACT(MONTH FROM birthday) = ${month}
      AND EXTRACT(DAY FROM birthday) = ${day}`;
  if (customers.length === 0) return { checked: 0, notified: 0 };
  let notified = 0;
  for (const c of customers) {
    const code = `BDAY-${year}-${c.id.slice(0, 8).toUpperCase()}`;
    const recent = await prismaRead.shopperNotification.findFirst({
      where: { kind: "birthday_voucher", refId: code, customerId: c.id },
      select: { id: true },
    });
    if (recent) continue;
    await prisma.shopperNotification.create({
      data: {
        orgId: c.orgId,
        customerId: c.id,
        ...(c.email ? { email: c.email } : {}),
        kind: "birthday_voucher",
        title: "Chúc mừng sinh nhật!",
        body: `Melio tặng bạn mã ${code} — dùng khi thanh toán trong 30 ngày nhé.`,
        refId: code,
      },
    });
    if (c.email) {
      const body = `Chúc mừng sinh nhật ${c.name}! Mã quà của bạn: ${code} (hiệu lực 30 ngày).`;
      await sendMail({ to: c.email, subject: "Melio chúc mừng sinh nhật bạn!", text: body, html: `<p>${body}</p>` }).catch(() => {});
    }
    notified++;
  }
  return { checked: customers.length, notified };
}
