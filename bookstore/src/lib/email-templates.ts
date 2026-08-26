// Email templates for transactional emails (order confirmation, low stock, etc.)
// All templates are pure functions — no side effects, easy to test.

export type OrderEmailData = {
  orderNumber: string;
  customerName: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  discountTotal: number;
  total: number;
  fulfillment: string; // "delivery" | "pickup"
  address?: string;
  phone?: string;
};

export type LowStockEmailData = {
  productName: string;
  sku: string;
  currentStock: number;
  locationName: string;
  storeName: string;
};

const COLORS = {
  primary: "#4f46e5", // indigo-600
  success: "#059669", // emerald-600
  text: "#1e293b",    // slate-800
  muted: "#64748b",   // slate-500
  bg: "#f8fafc",      // slate-50
  border: "#e2e8f0",  // slate-200
};

function fmt(n: number) {
  return n.toLocaleString("vi-VN");
}

export function orderConfirmationEmail(data: OrderEmailData) {
  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid ${COLORS.border};font-size:13px;color:${COLORS.text}">
          ${item.name}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid ${COLORS.border};font-size:13px;color:${COLORS.text};text-align:center">
          ${item.quantity}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid ${COLORS.border};font-size:13px;color:${COLORS.text};text-align:right">
          ${fmt(item.unitPrice)} ₫
        </td>
      </tr>`
    )
    .join("");

  const subject = `Xác nhận đơn hàng ${data.orderNumber} — Melio Bookstore`;

  const text = `Xin chào ${data.customerName},

Cảm ơn bạn đã mua hàng tại Melio Bookstore!

Mã đơn hàng: ${data.orderNumber}
Phương thức nhận: ${data.fulfillment === "delivery" ? "Giao hàng tận nơi" : "Nhận tại cửa hàng"}
${data.address ? `Địa chỉ: ${data.address}` : ""}
${data.phone ? `SĐT: ${data.phone}` : ""}

Chi tiết đơn hàng:
${data.items.map((i) => `- ${i.name} x${i.quantity}: ${fmt(i.unitPrice * i.quantity)} ₫`).join("\n")}

Tạm tính: ${fmt(data.subtotal)} ₫
Giảm giá: ${fmt(data.discountTotal)} ₫
Tổng cộng: ${fmt(data.total)} ₫

Trân trọng,
Melio Bookstore`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px">
      <h1 style="font-size:24px;font-weight:800;color:${COLORS.text};margin:0">Melio Bookstore</h1>
      <p style="font-size:12px;color:${COLORS.muted};margin-top:4px">Nhà sách & Phong cách sống</p>
    </div>

    <!-- Success Banner -->
    <div style="background:${COLORS.success};color:white;padding:16px 20px;border-radius:12px;text-align:center;margin-bottom:24px">
      <p style="font-size:14px;font-weight:700;margin:0">Đặt hàng thành công!</p>
      <p style="font-size:12px;margin:4px 0 0;opacity:0.9">Cảm ơn bạn đã tin tưởng Melio</p>
    </div>

    <!-- Order Info -->
    <div style="background:white;border:1px solid ${COLORS.border};border-radius:12px;padding:20px;margin-bottom:16px">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:6px 0;font-size:12px;color:${COLORS.muted}">Mã đơn hàng</td>
          <td style="padding:6px 0;font-size:13px;font-weight:700;color:${COLORS.text};text-align:right">${data.orderNumber}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:12px;color:${COLORS.muted}">Phương thức nhận</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;color:${COLORS.text};text-align:right">
            ${data.fulfillment === "delivery" ? "Giao hàng tận nơi" : "Nhận tại cửa hàng"}
          </td>
        </tr>
        ${data.address ? `
        <tr>
          <td style="padding:6px 0;font-size:12px;color:${COLORS.muted}">Địa chỉ</td>
          <td style="padding:6px 0;font-size:13px;color:${COLORS.text};text-align:right">${data.address}</td>
        </tr>` : ""}
      </table>
    </div>

    <!-- Items -->
    <div style="background:white;border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden;margin-bottom:16px">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:${COLORS.bg}">
            <th style="padding:10px 12px;font-size:11px;font-weight:700;color:${COLORS.muted};text-transform:uppercase;text-align:left">Sản phẩm</th>
            <th style="padding:10px 12px;font-size:11px;font-weight:700;color:${COLORS.muted};text-transform:uppercase;text-align:center">SL</th>
            <th style="padding:10px 12px;font-size:11px;font-weight:700;color:${COLORS.muted};text-transform:uppercase;text-align:right">Giá</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>

    <!-- Total -->
    <div style="background:white;border:1px solid ${COLORS.border};border-radius:12px;padding:16px 20px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:12px;color:${COLORS.muted}">Tạm tính</span>
        <span style="font-size:13px;color:${COLORS.text}">${fmt(data.subtotal)} ₫</span>
      </div>
      ${data.discountTotal > 0 ? `
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:12px;color:${COLORS.success}">Giảm giá</span>
        <span style="font-size:13px;color:${COLORS.success}">-${fmt(data.discountTotal)} ₫</span>
      </div>` : ""}
      <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:2px solid ${COLORS.border}">
        <span style="font-size:14px;font-weight:700;color:${COLORS.text}">Tổng cộng</span>
        <span style="font-size:18px;font-weight:800;color:${COLORS.primary}">${fmt(data.total)} ₫</span>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:16px 0">
      <p style="font-size:11px;color:${COLORS.muted};margin:0">
        Nếu bạn có câu hỏi, vui lòng liên hệ support@melio.vn
      </p>
      <p style="font-size:11px;color:${COLORS.muted};margin:4px 0 0">
        © ${new Date().getFullYear()} Melio Bookstore
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

export function lowStockAlertEmail(data: LowStockEmailData) {
  const subject = `⚠️ Cảnh báo tồn thấp: ${data.productName} (${data.sku})`;

  const text = `Cảnh báo tồn kho thấp!

Sản phẩm: ${data.productName}
SKU: ${data.sku}
Tồn hiện tại: ${data.currentStock} sản phẩm
Vị trí: ${data.locationName}
Cửa hàng: ${data.storeName}

Vui lòng kiểm tra và nhập hàng bổ sung.

— Melio Bookstore Inventory System`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:32px 16px">
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
      <p style="font-size:24px;margin:0">⚠️</p>
      <h2 style="font-size:16px;font-weight:700;color:#991b1b;margin:8px 0 4px">Cảnh báo tồn kho thấp</h2>
      <p style="font-size:12px;color:#b91c1c;margin:0">Cần nhập hàng bổ sung</p>
    </div>

    <div style="background:white;border:1px solid ${COLORS.border};border-radius:12px;padding:20px">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:8px 0;font-size:12px;color:${COLORS.muted}">Sản phẩm</td>
          <td style="padding:8px 0;font-size:13px;font-weight:600;color:${COLORS.text};text-align:right">${data.productName}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:12px;color:${COLORS.muted}">SKU</td>
          <td style="padding:8px 0;font-size:13px;font-family:monospace;color:${COLORS.text};text-align:right">${data.sku}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:12px;color:${COLORS.muted}">Tồn hiện tại</td>
          <td style="padding:8px 0;font-size:16px;font-weight:800;color:#dc2626;text-align:right">${data.currentStock}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:12px;color:${COLORS.muted}">Vị trí</td>
          <td style="padding:8px 0;font-size:13px;color:${COLORS.text};text-align:right">${data.locationName}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:12px;color:${COLORS.muted}">Cửa hàng</td>
          <td style="padding:8px 0;font-size:13px;color:${COLORS.text};text-align:right">${data.storeName}</td>
        </tr>
      </table>
    </div>

    <p style="text-align:center;font-size:11px;color:${COLORS.muted};margin-top:16px">
      — Melio Bookstore Inventory System
    </p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}
