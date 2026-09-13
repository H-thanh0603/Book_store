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
  const [stock, carts] = await Promise.all([scanBackInStock(), scanAbandonedCarts()]);
  return { backInStock: stock, abandonedCarts: carts };
}
