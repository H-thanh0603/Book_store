import { Html } from "@react-email/components";
import type { OrderEmailData } from "../email-templates";
import { COLORS, fmt } from "./shared";

const cell = {
  padding: "10px 12px",
  borderBottom: `1px solid ${COLORS.border}`,
  fontSize: "13px",
  color: COLORS.text,
} as const;

export function OrderConfirmationEmail({ data }: { data: OrderEmailData }) {
  const fulfillmentLabel = data.fulfillment === "delivery" ? "Giao hàng tận nơi" : "Nhận tại cửa hàng";
  return (
    <Html lang="vi">
      <body style={{ margin: 0, padding: 0, backgroundColor: COLORS.bg, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
        <div style={{ maxWidth: "560px", margin: "0 auto", padding: "32px 16px" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 800, color: COLORS.text, margin: 0 }}>Melio Bookstore</h1>
            <p style={{ fontSize: "12px", color: COLORS.muted, marginTop: "4px" }}>Nhà sách &amp; Phong cách sống</p>
          </div>

          {/* Success Banner */}
          <div style={{ background: COLORS.success, color: "white", padding: "16px 20px", borderRadius: "12px", textAlign: "center", marginBottom: "24px" }}>
            <p style={{ fontSize: "14px", fontWeight: 700, margin: 0 }}>Đặt hàng thành công!</p>
            <p style={{ fontSize: "12px", margin: "4px 0 0", opacity: 0.9 }}>Cảm ơn bạn đã tin tưởng Melio</p>
          </div>

          {/* Order Info */}
          <div style={{ background: "white", border: `1px solid ${COLORS.border}`, borderRadius: "12px", padding: "20px", marginBottom: "16px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tr>
                <td style={{ padding: "6px 0", fontSize: "12px", color: COLORS.muted }}>Mã đơn hàng</td>
                <td style={{ padding: "6px 0", fontSize: "13px", fontWeight: 700, color: COLORS.text, textAlign: "right" }}>{data.orderNumber}</td>
              </tr>
              <tr>
                <td style={{ padding: "6px 0", fontSize: "12px", color: COLORS.muted }}>Phương thức nhận</td>
                <td style={{ padding: "6px 0", fontSize: "13px", fontWeight: 600, color: COLORS.text, textAlign: "right" }}>{fulfillmentLabel}</td>
              </tr>
              {data.address ? (
                <tr>
                  <td style={{ padding: "6px 0", fontSize: "12px", color: COLORS.muted }}>Địa chỉ</td>
                  <td style={{ padding: "6px 0", fontSize: "13px", color: COLORS.text, textAlign: "right" }}>{data.address}</td>
                </tr>
              ) : null}
            </table>
          </div>

          {/* Items */}
          <div style={{ background: "white", border: `1px solid ${COLORS.border}`, borderRadius: "12px", overflow: "hidden", marginBottom: "16px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: COLORS.bg }}>
                  <th style={{ padding: "10px 12px", fontSize: "11px", fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", textAlign: "left" }}>Sản phẩm</th>
                  <th style={{ padding: "10px 12px", fontSize: "11px", fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", textAlign: "center" }}>SL</th>
                  <th style={{ padding: "10px 12px", fontSize: "11px", fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", textAlign: "right" }}>Giá</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.name}>
                    <td style={cell}>{item.name}</td>
                    <td style={{ ...cell, textAlign: "center" }}>{item.quantity}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{fmt(item.unitPrice)} ₫</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div style={{ background: "white", border: `1px solid ${COLORS.border}`, borderRadius: "12px", padding: "16px 20px", marginBottom: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "12px", color: COLORS.muted }}>Tạm tính</span>
              <span style={{ fontSize: "13px", color: COLORS.text }}>{fmt(data.subtotal)} ₫</span>
            </div>
            {data.discountTotal > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", color: COLORS.success }}>Giảm giá</span>
                <span style={{ fontSize: "13px", color: COLORS.success }}>-{fmt(data.discountTotal)} ₫</span>
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", borderTop: `2px solid ${COLORS.border}` }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: COLORS.text }}>Tổng cộng</span>
              <span style={{ fontSize: "18px", fontWeight: 800, color: COLORS.primary }}>{fmt(data.total)} ₫</span>
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <p style={{ fontSize: "11px", color: COLORS.muted, margin: 0 }}>
              Nếu bạn có câu hỏi, vui lòng liên hệ support@melio.vn
            </p>
            <p style={{ fontSize: "11px", color: COLORS.muted, margin: "4px 0 0" }}>
              © {new Date().getFullYear()} Melio Bookstore
            </p>
          </div>
        </div>
      </body>
    </Html>
  );
}
