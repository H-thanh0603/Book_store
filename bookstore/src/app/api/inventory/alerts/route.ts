import { NextRequest } from "next/server";
import { prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { sendMail } from "@/lib/mail";
import { Prisma } from "@/generated/prisma/client";

// POST /api/inventory/alerts — Check for low stock items and send email alerts
// Called by cron job or manually triggered. Items with available <= threshold
// receive email notifications to the store manager.
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("inventory.manage");

    const body = await req.json().catch(() => ({}));
    const threshold = typeof body.threshold === "number" ? body.threshold : 5;
    const managerEmail = typeof body.email === "string" ? body.email.trim() : null;

    if (!managerEmail) return apiError({ status: 400, code: "VALIDATION", message: "Manager email is required" });

    const lowStockItems = await lowStockBalances(auth, threshold, 500);

  if (lowStockItems.length === 0) {
    return ok({ message: "No low stock items found", alertsSent: 0 });
  }

  // Send one consolidated email with all low stock items
  const itemsHtml = lowStockItems
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px">${item.productName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;font-family:monospace">${item.sku}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:700;color:${item.available === 0 ? "#dc2626" : "#d97706"};text-align:center">${item.available}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">${item.locationName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">${item.storeName ?? "—"}</td>
      </tr>`
    )
    .join("");

  const subject = `⚠️ ${lowStockItems.length} sản phẩm tồn kho thấp — Melio Bookstore`;
  const text = `Cảnh báo tồn kho thấp!\n\n${lowStockItems.map((item) => `- ${item.productName} (${item.sku}): còn ${item.available} tại ${item.locationName}`).join("\n")}\n\nVui lòng kiểm tra và nhập hàng bổ sung.\n\n— Melio Bookstore Inventory System`;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px">
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
      <h2 style="font-size:18px;font-weight:700;color:#991b1b;margin:0">⚠️ Cảnh báo tồn kho thấp</h2>
      <p style="font-size:13px;color:#b91c1c;margin:8px 0 0">${lowStockItems.length} sản phẩm cần nhập hàng bổ sung</p>
    </div>

    <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left">Sản phẩm</th>
            <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left">SKU</th>
            <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:center">Tồn</th>
            <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left">Vị trí</th>
            <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left">Cửa hàng</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>

    <p style="text-align:center;font-size:11px;color:#94a3b8">
      — Melio Bookstore Inventory System
    </p>
  </div>
</body>
</html>`;

  await sendMail({ to: managerEmail, subject, text, html });

  return ok({
    message: `Low stock alert email sent`,
    alertsSent: lowStockItems.length,
    items: lowStockItems.map((item) => ({
      name: item.productName,
      sku: item.sku,
      onHand: item.available,
      location: item.locationName,
      store: item.storeName,
    })),
  });
  } catch (err) {
    return apiError(err);
  }
}

// GET /api/inventory/alerts — List low stock items (no email sent)
export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("inventory.view");

    const url = new URL(req.url);
    const threshold = Number(url.searchParams.get("threshold") ?? 5);

    const lowStockItems = await lowStockBalances(auth, threshold, 200);

    return ok({ items: lowStockItems, threshold });
  } catch (err) {
    return apiError(err);
  }
}

// Shared low-stock scan: org + store scoped, available-based (onHand -
// reserved, not onHand alone), bounded. Balance has no direct orgId —
// scope through the variant's org and the location's store.
async function lowStockBalances(
  auth: { orgId: string | null; roles: { permissions: string[]; storeId: string | null }[] },
  threshold: number,
  take: number,
) {
  const storeIds = auth.roles
    .filter((r) => r.permissions.includes("inventory.view") && r.storeId)
    .map((r) => r.storeId as string);
  const hasGlobalScope = auth.roles.some(
    (r) => r.permissions.includes("inventory.view") && r.storeId === null,
  );
  const storeFilter = hasGlobalScope ? Prisma.empty : Prisma.sql`AND l."storeId" IN (${Prisma.join(storeIds)})`;
  const orgFilter = auth.orgId ? Prisma.sql`AND v."orgId" = ${auth.orgId}` : Prisma.empty;
  return prismaRead.$queryRaw<{
    id: string; onHand: number; reserved: number; available: number;
    sku: string; productName: string; locationName: string; storeName: string | null;
  }[]>`
    SELECT b.id, b."onHand", b.reserved, (b."onHand" - b.reserved)::int AS available,
           v.sku, pr.name AS "productName", l.name AS "locationName", s.name AS "storeName"
    FROM "InventoryBalance" b
    JOIN "ProductVariant" v ON v.id = b."variantId"
    JOIN "Product" pr ON pr.id = v."productId"
    JOIN "StockLocation" l ON l.id = b."locationId"
    LEFT JOIN "Store" s ON s.id = l."storeId"
    WHERE l.active AND v.active
      AND (b."onHand" - b.reserved) <= ${threshold}
      ${storeFilter} ${orgFilter}
    ORDER BY (b."onHand" - b.reserved) ASC
    LIMIT ${take}`;
}
