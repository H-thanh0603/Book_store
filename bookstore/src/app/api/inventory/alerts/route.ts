import { NextRequest } from "next/server";
import { prismaRead } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { sendMail } from "@/lib/mail";
import { lowStockAlertEmail } from "@/lib/email-templates";

// POST /api/inventory/alerts — Check for low stock items and send email alerts
// Called by cron job or manually triggered. Items with onHand <= threshold
// receive email notifications to the store manager.
export async function POST(req: NextRequest) {
  try {
    await requirePermission("inventory:manage");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const body = await req.json().catch(() => ({}));
  const threshold = typeof body.threshold === "number" ? body.threshold : 5;
  const managerEmail = typeof body.email === "string" ? body.email.trim() : null;

  if (!managerEmail) return apiError({ status: 400, code: "VALIDATION", message: "Manager email is required" });

  // Find all variants with low stock across all locations
  const lowStockItems = await prismaRead.inventoryBalance.findMany({
    where: {
      onHand: { lte: threshold },
      location: { active: true },
      variant: { active: true },
    },
    include: {
      variant: {
        include: {
          product: { select: { name: true } },
          barcodes: { select: { barcode: true }, take: 1 },
        },
      },
      location: {
        include: {
          store: { select: { name: true } },
        },
      },
    },
    orderBy: { onHand: "asc" },
  });

  if (lowStockItems.length === 0) {
    return ok({ message: "No low stock items found", alertsSent: 0 });
  }

  // Send one consolidated email with all low stock items
  const itemsHtml = lowStockItems
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px">${item.variant.product.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;font-family:monospace">${item.variant.sku}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:700;color:${item.onHand === 0 ? "#dc2626" : "#d97706"};text-align:center">${item.onHand}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">${item.location.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">${item.location.store?.name ?? "—"}</td>
      </tr>`
    )
    .join("");

  const subject = `⚠️ ${lowStockItems.length} sản phẩm tồn kho thấp — Melio Bookstore`;
  const text = `Cảnh báo tồn kho thấp!\n\n${lowStockItems.map((item) => `- ${item.variant.product.name} (${item.variant.sku}): còn ${item.onHand} tại ${item.location.name}`).join("\n")}\n\nVui lòng kiểm tra và nhập hàng bổ sung.\n\n— Melio Bookstore Inventory System`;
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
      name: item.variant.product.name,
      sku: item.variant.sku,
      onHand: item.onHand,
      location: item.location.name,
      store: item.location.store?.name,
    })),
  });
}

// GET /api/inventory/alerts — List low stock items (no email sent)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("inventory:read");
  } catch (e: unknown) {
    const status = (e && typeof e === "object" && "status" in e) ? (e as { status: number }).status : 401;
    return apiError({ status, code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: (e as Error).message });
  }

  const url = new URL(req.url);
  const threshold = Number(url.searchParams.get("threshold") ?? 5);

  const lowStockItems = await prismaRead.inventoryBalance.findMany({
    where: {
      onHand: { lte: threshold },
      location: { active: true },
      variant: { active: true },
    },
    include: {
      variant: {
        include: {
          product: { select: { name: true } },
          barcodes: { select: { barcode: true }, take: 1 },
        },
      },
      location: {
        include: {
          store: { select: { name: true } },
        },
      },
    },
    orderBy: { onHand: "asc" },
  });

  return ok({ items: lowStockItems, threshold });
}
