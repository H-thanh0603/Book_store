import { prisma } from "./db";
import { nextBusinessNumber, getSystemConfig } from "./api";
import { sendMail } from "./mail";

// N2: scheduled inventory hygiene — cycle counts + low-stock mail.
// Both are idempotent by construction (open-count guard / send-only-on-items).

/**
 * Create a DRAFT cycle-count for every active store stockroom whose latest
 * POSTED count is older than `inventory.cycleCountDays` (default 7) and that
 * has no DRAFT count already open. Items snapshot current onHand as
 * expectedQty with countedQty 0 — staff fill real counts in
 * /inventory/counts, then post (which sets onHand := countedQty).
 */
export async function runCycleCounts(): Promise<{ created: number }> {
  const cycleDays = await getSystemConfig<number>("inventory.cycleCountDays", 7);
  const cutoff = new Date(Date.now() - cycleDays * 86_400_000);
  const locations = await prisma.stockLocation.findMany({
    where: { active: true, type: "STORE_STOCKROOM" },
    select: { id: true },
  });
  let created = 0;
  for (const loc of locations) {
    const open = await prisma.inventoryCount.findFirst({
      where: { locationId: loc.id, status: "DRAFT" },
      select: { id: true },
    });
    if (open) continue;
    const lastPosted = await prisma.inventoryCount.findFirst({
      where: { locationId: loc.id, status: "POSTED" },
      orderBy: { postedAt: "desc" },
      select: { postedAt: true },
    });
    if (lastPosted?.postedAt && lastPosted.postedAt > cutoff) continue;
    const balances = await prisma.inventoryBalance.findMany({
      where: { locationId: loc.id, onHand: { gt: 0 } },
      select: { variantId: true, onHand: true },
    });
    if (balances.length === 0) continue;
    await prisma.inventoryCount.create({
      data: {
        number: await nextBusinessNumber("IC"),
        locationId: loc.id,
        countedBy: "system:cycle-count",
        items: {
          create: balances.map((b) => ({
            variantId: b.variantId,
            expectedQty: b.onHand,
            countedQty: 0,
          })),
        },
      },
    });
    created++;
  }
  return { created };
}

/**
 * Nightly low-stock scan (NIGHTLY cadence): per store, mail every user whose
 * role grants inventory:manage at that store. Silent when nothing is low or
 * when SMTP is unconfigured (sendMail logs locally in that case).
 */
export async function scanLowStockMail(): Promise<{ storesNotified: number }> {
  const threshold = await getSystemConfig<number>("inventory.lowStockThreshold", 15);
  const balances = await prisma.inventoryBalance.findMany({
    where: {
      onHand: { lte: threshold },
      location: { active: true, storeId: { not: null } },
      variant: { active: true },
    },
    include: {
      variant: { include: { product: { select: { name: true } } } },
      location: { select: { name: true, storeId: true, store: { select: { name: true } } } },
    },
    orderBy: { onHand: "asc" },
    take: 500,
  });
  if (balances.length === 0) return { storesNotified: 0 };

  const byStore = new Map<string, { storeName: string; rows: typeof balances }>();
  for (const b of balances) {
    const sid = b.location.storeId!;
    const g = byStore.get(sid) ?? { storeName: b.location.store?.name ?? sid, rows: [] };
    g.rows.push(b);
    byStore.set(sid, g);
  }

  // Staff holding inventory.manage scoped to each store. Org-wide holders
  // (storeId null) get every store's mail — otherwise chains without
  // per-store managers would never notify anyone.
  const managers = await prisma.userRole.findMany({
    where: {
      OR: [{ storeId: { in: [...byStore.keys()] } }, { storeId: null }],
      role: { permissions: { some: { permission: { code: "inventory.manage" } } } },
      user: { active: true },
    },
    include: { user: { select: { email: true } } },
  });
  const mailByStore = new Map<string, Set<string>>();
  const orgWide: string[] = [];
  for (const m of managers) {
    if (!m.user.email) continue;
    if (!m.storeId) { orgWide.push(m.user.email); continue; }
    const set = mailByStore.get(m.storeId) ?? new Set<string>();
    set.add(m.user.email);
    mailByStore.set(m.storeId, set);
  }

  let storesNotified = 0;
  for (const [storeId, g] of byStore) {
    const recipients = [...new Set([...(mailByStore.get(storeId) ?? []), ...orgWide])];
    if (recipients.length === 0) continue;
    const rowsHtml = g.rows
      .slice(0, 100)
      .map(
        (b) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${b.variant.product.name}</td>` +
          `<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace">${b.variant.sku}</td>` +
          `<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700">${b.onHand}</td>` +
          `<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${b.location.name}</td></tr>`
      )
      .join("");
    await sendMail({
      to: recipients.join(", "),
      subject: `⚠️ Tồn thấp ${g.storeName}: ${g.rows.length} mặt hàng (≤ ${threshold})`,
      text: `Các mặt hàng sắp hết tại ${g.storeName} (tồn ≤ ${threshold}): ` +
        g.rows.slice(0, 100).map((b) => `${b.variant.product.name} (${b.variant.sku}): ${b.onHand}`).join("; "),
      html: `<p>Các mặt hàng sắp hết tại <b>${g.storeName}</b>:</p>` +
        `<table><thead><tr><th>Sản phẩm</th><th>SKU</th><th>Tồn</th><th>Kệ</th></tr></thead><tbody>${rowsHtml}</tbody></table>`,
    });
    storesNotified++;
  }
  return { storesNotified };
}
