// Email templates for transactional emails (order confirmation, low stock).
// Plain-text versions are hand-built for full control; the HTML versions
// render the JSX components in ./emails via @react-email/render — author
// HTML changes in the components, subject/text stay here. Both builders are
// pure (async) functions — no side effects, easy to test.
import { render } from "@react-email/render";
import { OrderConfirmationEmail } from "./emails/order-confirmation";
import { LowStockAlertEmail } from "./emails/low-stock-alert";

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

function fmt(n: number) {
  return n.toLocaleString("vi-VN");
}

export async function orderConfirmationEmail(data: OrderEmailData) {
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

  const html = await render(<OrderConfirmationEmail data={data} />);

  return { subject, text, html };
}

export async function lowStockAlertEmail(data: LowStockEmailData) {
  const subject = `⚠️ Cảnh báo tồn thấp: ${data.productName} (${data.sku})`;

  const text = `Cảnh báo tồn kho thấp!

Sản phẩm: ${data.productName}
SKU: ${data.sku}
Tồn hiện tại: ${data.currentStock} sản phẩm
Vị trí: ${data.locationName}
Cửa hàng: ${data.storeName}

Vui lòng kiểm tra và nhập hàng bổ sung.

— Melio Bookstore Inventory System`;

  const html = await render(<LowStockAlertEmail data={data} />);

  return { subject, text, html };
}
