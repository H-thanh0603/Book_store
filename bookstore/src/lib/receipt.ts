// Thermal receipt generation using ESC/POS commands.
// Generates a printable receipt for 80mm thermal printers.
// The receipt is rendered as a hidden iframe and triggered via window.print().

export type ReceiptLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type ReceiptData = {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  receiptNumber: string;
  date: string;
  cashier?: string;
  items: ReceiptLine[];
  subtotal: number;
  discountTotal: number;
  total: number;
  paymentMethod: string;
  amountPaid?: number;
  change?: number;
  loyaltyPoints?: number;
  customerName?: string;
  customerPhone?: string;
  footer?: string;
};

function fmt(n: number) {
  return n.toLocaleString("vi-VN");
}

function padRight(s: string, len: number) {
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}

function padLeft(s: string, len: number) {
  return s.length >= len ? s : " ".repeat(len - s.length) + s;
}

function centered(s: string, len: number) {
  const pad = Math.max(0, len - s.length);
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + s + " ".repeat(pad - left);
}

function divider(len: number) {
  return "-".repeat(len);
}

function lineItem(line: ReceiptLine, width: number): string {
  const nameWidth = width - 22;
  const nameLabel = line.name.length > nameWidth ? line.name.slice(0, nameWidth) : line.name;
  const qty = `x${line.quantity}`;
  const price = fmt(line.total);
  return padRight(nameLabel, nameWidth) + padLeft(qty, 6) + padLeft(price, 16);
}

export function generateReceiptHtml(data: ReceiptData): string {
  const W = 48; // 80mm ≈ 48 chars at standard font

  const lines: string[] = [];
  lines.push(centered(data.storeName, W));
  if (data.storeAddress) lines.push(centered(data.storeAddress, W));
  if (data.storePhone) lines.push(centered(data.storePhone, W));
  lines.push("");
  lines.push(centered("HÓA ĐƠN BÁN HÀNG", W));
  lines.push(divider(W));
  lines.push(`Số: ${data.receiptNumber}`);
  lines.push(`Ngày: ${data.date}`);
  if (data.cashier) lines.push(`Thu ngân: ${data.cashier}`);
  if (data.customerName) lines.push(`Khách: ${data.customerName}`);
  if (data.customerPhone) lines.push(`SĐT KH: ${data.customerPhone}`);
  lines.push(divider(W));
  lines.push(padRight("Sản phẩm", 28) + padLeft("SL", 6) + padLeft("Thành tiền", 14));
  lines.push(divider(W));
  for (const item of data.items) {
    lines.push(lineItem(item, W));
  }
  lines.push(divider(W));
  lines.push(padRight("Tạm tính:", 34) + padLeft(fmt(data.subtotal) + "đ", 14));
  if (data.discountTotal > 0) {
    lines.push(padRight("Giảm giá:", 34) + padLeft("-" + fmt(data.discountTotal) + "đ", 14));
  }
  lines.push(centered("=", W));
  lines.push(padRight("TỔNG CỘNG:", 34) + padLeft(fmt(data.total) + "đ", 14));
  lines.push(centered("=", W));
  lines.push("");
  lines.push(`Thanh toán: ${data.paymentMethod}`);
  if (data.amountPaid != null) lines.push(`Đã nhận:   ${fmt(data.amountPaid)}đ`);
  if (data.change != null && data.change > 0) lines.push(`Trả lại:   ${fmt(data.change)}đ`);
  if (data.loyaltyPoints != null && data.loyaltyPoints > 0) {
    lines.push(`Tích điểm: +${data.loyaltyPoints} pts`);
  }
  lines.push(divider(W));
  lines.push(centered("Cảm ơn quý khách!", W));
  lines.push(centered("Hẹn gặp lại!", W));
  if (data.footer) {
    lines.push("");
    lines.push(centered(data.footer, W));
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>In hóa đơn</title>
<style>
  @page { size: 80mm auto; margin: 2mm; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    line-height: 1.3;
    margin: 0;
    padding: 4mm;
    color: #000;
    width: 72mm;
  }
  pre { margin: 0; white-space: pre; }
  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
<pre>${lines.join("\n")}</pre>
<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 300);
  };
</script>
</body>
</html>`;
}

export function printReceipt(data: ReceiptData) {
  const html = generateReceiptHtml(data);
  const win = window.open("", "_blank", "width=320,height=600");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}
