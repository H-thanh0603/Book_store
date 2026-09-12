import { NextResponse } from "next/server";

// llms.txt — human-readable entry point cho AI crawlers/agents.
// Quy ước cộng đồng (llmstxt.org), phục vụ cả AI browser hiện tại.
const LLMS_TXT = `# Melio Bookstore — llms.txt (Agent layer v1)

> Melio là nhà sách omnichannel Việt Nam (sách, VPP, đồ chơi, quà tặng).
> Web có 2 lớp: Human UI tại /shop cho con người; Agent layer read-only dưới đây cho AI.

## Machine manifest (JSON)
- /.well-known/agent

## Agent tools (read-only — không cần auth)
- [search_products] GET /api/storefront?q=<tu-khoa>&storeId=<optional>
  Catalogue công khai, giá + tồn kho theo chi nhánh. Cache 30s.
- [quote_order] GET /api/storefront/quote?storeId=<id>&items=<variantId:qty,...>&couponCode=<optional>
  Xem trước tổng tiền/giảm giá, KHÔNG tạo đơn.
- [track_order] GET /api/storefront/track?number=<ma-don>&phone=<sdt>
  Trạng thái giao hàng. Cần cả 2 tham số. Không lộ PII.
- [ask_concierge] POST /api/concierge {"messages":[{"role":"user","content":"..."}]}
  Trợ lý Thủ thư AI, đã grounding vào catalogue thật. Read-only.

## Human-in-the-loop (BẮT BUỘC)
- Agent KHÔNG BAO GIỜ tự gọi POST /api/storefront (checkout/thanh toán).
- Luồng đúng: search -> quote -> hiển thị giá cuối -> con người bấm Thanh toán.
- Hành động nhạy cảm (thanh toán, hoàn tiền) luôn chuyển quyền cho người dùng.

## Grounding & provenance
- Chỉ giới thiệu sản phẩm có trong kết quả search_products.
- Không bịa tên sách, giá, tác giả. Giá/tồn kho theo chi nhánh đang chọn.
- Nội dung do AI tạo phải ghi rõ nguồn từ catalogue Melio.

## Rate limits (per IP)
- catalog 60/phút, quote 60/phút, track 20/phút, concierge 20/phút.

## Human entry
- Mua sắm: /shop — Theo dõi đơn: /track — Quà tặng: /gift-finder
`;

export function GET() {
  return new NextResponse(LLMS_TXT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
