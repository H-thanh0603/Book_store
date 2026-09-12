// Single source of truth for the machine-readable Agent layer.
// The /.well-known/agent route serves this; unit tests import it too.
// Design: read-only discovery + quote. Consequential actions (checkout,
// payment, refund) REQUIRE human approval — agents must hand control back
// to the shopper instead of calling them directly.
export const AGENT_MANIFEST_VERSION = "1.0.0";

export type AgentTool = {
  name: string;
  description: string;
  method: string;
  path: string;
  readOnly: boolean;
  requiresHumanApproval: boolean;
  params?: Record<string, string>;
};

export function buildAgentManifest(baseUrl: string) {
  const tools: AgentTool[] = [
    {
      name: "search_products",
      description:
        "Tìm kiếm catalogue công khai (sách, VPP, đồ chơi, quà tặng). Trả về sản phẩm thật đang bán kèm giá và tồn kho theo chi nhánh.",
      method: "GET",
      path: "/api/storefront",
      readOnly: true,
      requiresHumanApproval: false,
      params: {
        q: "Từ khóa (tên sách/tác giả/thể loại), tối đa 80 ký tự",
        categoryId: "Lọc theo nhóm hàng (tùy chọn)",
        storeId: "ID chi nhánh (tùy chọn, mặc định chi nhánh đầu tiên)",
      },
    },
    {
      name: "quote_order",
      description:
        "Xem trước tổng tiền, giảm giá và coupon mà KHÔNG tạo đơn. Luôn gọi trước khi hiển thị giá cuối cho khách.",
      method: "GET",
      path: "/api/storefront/quote",
      readOnly: true,
      requiresHumanApproval: false,
      params: {
        storeId: "ID chi nhánh",
        couponCode: "Mã giảm giá (tùy chọn)",
        items: "Danh sách variantId:quantity, cách nhau bởi dấu phẩy",
      },
    },
    {
      name: "track_order",
      description:
        "Tra cứu trạng thái giao hàng. Cần CẢ mã đơn và số điện thoại đặt hàng (two-factor); chỉ trả về trạng thái vận chuyển, không lộ thông tin cá nhân.",
      method: "GET",
      path: "/api/storefront/track",
      readOnly: true,
      requiresHumanApproval: false,
      params: {
        number: "Mã đơn hàng (VD: MB-XXXXXX)",
        phone: "Số điện thoại đặt hàng",
      },
    },
    {
      name: "ask_concierge",
      description:
        "Trợ lý 'Thủ thư AI': gợi ý sản phẩm đã được grounding vào catalogue thật. Read-only — không bao giờ tự thêm vào giỏ thay khách.",
      method: "POST",
      path: "/api/concierge",
      readOnly: true,
      requiresHumanApproval: false,
      params: {
        messages: "Lịch sử chat ngắn (tối đa 8 turns), mỗi message {role, content}",
      },
    },
  ];

  return {
    $comment:
      "Melio Bookstore Agent layer v1 — read-only discovery. WebMCP vẫn là draft W3C nên manifest này mô tả REST hiện có dưới dạng agent tools, không tự nhận là WebMCP standard.",
    name: "Melio Bookstore",
    version: AGENT_MANIFEST_VERSION,
    humanEntry: "/shop",
    machineEntry: "/llms.txt",
    policies: {
      consequentialActions:
        "CHECKOUT, PAYMENT và REFUND là consequential actions: agent TUYỆT ĐỐI KHÔNG tự gọi POST /api/storefront. Hiển thị quote + chuyển quyền điều khiển cho con người bấm Thanh toán.",
      grounding:
        "Mọi tên sách/giá/tác giả agent nhắc tới PHẢI đến từ search_products hoặc ask_concierge. Không bịa catalogue.",
      provenance: "Dữ liệu tồn kho/giá phản ánh đúng chi nhánh đang chọn, cache tối đa 30s.",
      rateLimits:
        "storefront-catalog 60 req/phút/IP, quote 60 req/phút/IP, track 20 req/phút/IP, concierge 20 req/phút/IP.",
      privacy:
        "track_order không bao giờ trả về tên/SĐT/địa chỉ khách. Không thu thập dữ liệu không cần thiết.",
    },
    tools,
    docs: `${baseUrl}/llms.txt`,
  };
}
