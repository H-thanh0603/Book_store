// Machine-readable Merchant Agent manifest (staff-only).
// Separate from /.well-known/agent (public shopper discovery): these tools
// require a staff session and every write stays human-approved.

import { NextResponse } from "next/server";
import { SKILL_PERMISSION } from "@/lib/merchant-agent";

export async function GET() {
  return NextResponse.json({
    $comment: "Melio Merchant Agent v1 — staff session required. Read tools only; writes are staged changes a human applies.",
    name: "Melio Merchant Agent",
    version: "1.0.0",
    skills: [
      { name: "digest", description: "Bản tin điều hành: hết hàng, gợi ý nhập, PO chờ duyệt.", permission: SKILL_PERMISSION.digest, endpoint: "POST /api/merchant {skill:'digest'}" },
      { name: "explain", description: "Giải thích biến động kinh doanh, số liệu grounding từ client.", permission: SKILL_PERMISSION.explain, endpoint: "POST /api/merchant {skill:'explain'}" },
      { name: "inventory", description: "Hỏi đáp tồn kho/nhập hàng trên gợi ý mở.", permission: SKILL_PERMISSION.inventory, endpoint: "POST /api/merchant {skill:'inventory'}" },
      { name: "promo", description: "Đề xuất đợt giảm giá cho hàng chậm — luôn tạo nháp.", permission: SKILL_PERMISSION.promo, endpoint: "POST /api/merchant {skill:'promo'}" },
      { name: "catalog", description: "Sức khỏe listing: thiếu nhóm/tác giả/mã vạch/giá.", permission: SKILL_PERMISSION.catalog, endpoint: "POST /api/merchant {skill:'catalog'}" },
    ],
    guardrails: "Model không gọi mutation. Chấp nhận gợi ý nhập qua POST /api/replenishment, tạo nháp promo qua POST /api/promotions {active:false}, sửa listing qua PATCH /api/products — đều bởi con người bấm nút.",
  });
}
