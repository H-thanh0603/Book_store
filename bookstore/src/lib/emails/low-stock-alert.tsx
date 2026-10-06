import { Html } from "@react-email/components";
import type { LowStockEmailData } from "../email-templates";
import { COLORS } from "./shared";

export function LowStockAlertEmail({ data }: { data: LowStockEmailData }) {
  return (
    <Html lang="vi">
      <body style={{ margin: 0, padding: 0, backgroundColor: COLORS.bg, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
        <div style={{ maxWidth: "480px", margin: "0 auto", padding: "32px 16px" }}>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "12px", padding: "20px", textAlign: "center", marginBottom: "24px" }}>
            <p style={{ fontSize: "24px", margin: 0 }}>⚠️</p>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#991b1b", margin: "8px 0 4px" }}>Cảnh báo tồn kho thấp</h2>
            <p style={{ fontSize: "12px", color: "#b91c1c", margin: 0 }}>Cần nhập hàng bổ sung</p>
          </div>

          <div style={{ background: "white", border: `1px solid ${COLORS.border}`, borderRadius: "12px", padding: "20px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tr>
                <td style={{ padding: "8px 0", fontSize: "12px", color: COLORS.muted }}>Sản phẩm</td>
                <td style={{ padding: "8px 0", fontSize: "13px", fontWeight: 600, color: COLORS.text, textAlign: "right" }}>{data.productName}</td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0", fontSize: "12px", color: COLORS.muted }}>SKU</td>
                <td style={{ padding: "8px 0", fontSize: "13px", fontFamily: "monospace", color: COLORS.text, textAlign: "right" }}>{data.sku}</td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0", fontSize: "12px", color: COLORS.muted }}>Tồn hiện tại</td>
                <td style={{ padding: "8px 0", fontSize: "16px", fontWeight: 800, color: "#dc2626", textAlign: "right" }}>{data.currentStock}</td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0", fontSize: "12px", color: COLORS.muted }}>Vị trí</td>
                <td style={{ padding: "8px 0", fontSize: "13px", color: COLORS.text, textAlign: "right" }}>{data.locationName}</td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0", fontSize: "12px", color: COLORS.muted }}>Cửa hàng</td>
                <td style={{ padding: "8px 0", fontSize: "13px", color: COLORS.text, textAlign: "right" }}>{data.storeName}</td>
              </tr>
            </table>
          </div>

          <p style={{ textAlign: "center", fontSize: "11px", color: COLORS.muted, marginTop: "16px" }}>
            — Melio Bookstore Inventory System
          </p>
        </div>
      </body>
    </Html>
  );
}
