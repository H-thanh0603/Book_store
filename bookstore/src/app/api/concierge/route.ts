// AI Concierge — shopping assistant for the storefront, adapted from
// anthropics/commerce-agents shopping-agent skill prompts (search-discovery,
// purchase-research, customer-care) onto DeepSeek's OpenAI-compatible API.
// Reads only: it searches the catalog and answers. It never writes the cart —
// the customer adds items themselves (staged by design, like the reference).
// ponytail: no streaming, no server-side chat history — the client sends the
// whole (short) conversation each turn; add server sessions if chats grow.

import { NextRequest, NextResponse } from "next/server";
import { listStorefrontProducts } from "@/lib/storefront";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api";

// Base URL overridable for local mock testing (OpenAI-compatible convention).
const DEEPSEEK_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com") + "/chat/completions";
// Global daily spend cap — per-IP limits can't stop a distributed botnet
// burning credits; one shared bucket does. Counts only turns that reach
// DeepSeek, so demo-mode (no key) costs nothing.
const DAILY_LIMIT = Number(process.env.DEEPSEEK_DAILY_LIMIT) || 2000;
// ponytail: model name pinned; swap when DeepSeek ships a better chat model
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

function conciergeConfigured() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

// Tool contract: search the real catalog only. The model must ground every
// product it mentions in tool results — never from its own knowledge.
const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_products",
      description:
        "Tìm kiếm sản phẩm trong catalogue nhà sách (sách, đồ chơi, văn phòng phẩm, quà tặng). " +
        "Trả về sản phẩm thật đang bán kèm giá và tồn kho. Luôn dùng tool này trước khi giới thiệu bất kỳ sản phẩm nào. " +
        "Dùng từ khóa ngắn theo tên sản phẩm/tác giả/thể loại, ví dụ 'trinh thám', 'murakami', 'balo'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Từ khóa tìm kiếm tiếng Việt" },
        },
        required: ["query"],
      },
    },
  },
];

const SYSTEM_PROMPT = `Bạn là "Thư Thủ AI" của Melio Bookstore — nhà sách trực tuyến Việt Nam. Trả lời NGẮN GỌN, tiếng Việt, thân thiện ấm áp.

## Tìm kiếm và gợi ý (luôn áp dụng)
- Rút ngân sách, người nhận, mục đích, độ tuổi, thể loại khỏi tin nhắn và ÁP DỤNG luôn vào tìm kiếm — đừng hỏi lại điều khách đã nói.
- Diễn đạt từ khóa theo ngôn ngữ catalogue (tên sách/tác giả/thể loại), bỏ cách diễn đạt của khách.
- Chỉ hỏi lại khi KHÔNG THỂ tìm nếu thiếu thông tin đó (VD: quà cho bé mà không biết độ tuổi) — và hỏi đúng MỘT câu, kèm gợi ý đáp án.
- Gọi search_products TRƯỚC khi nói về bất kỳ sản phẩm nào. Chỉ giới thiệu sản phẩm có trong kết quả tool. Không bao giờ bịa tên sách, giá, tác giả.
- Khi gợi ý: 3-4 lựa chọn, món ĐÁNG TIN CẬY NHẤT xếp đầu. Mỗi món một lý do ngắn nêu đúng ràng buộc của khách (VD: "dưới 100k", "cho bé 6 tuổi").
- Sắp xếp tổng giá trước khi nói "combo này dưới X₫". Tổng vượt ngân sách thì nói rõ tổng.
- Món hết/không có: nói "hiện chưa có", gợi ý món thay thế gần nhất.
- Câu trả lời chỉ 1-3 câu dẫn nhập trước danh sách — sản phẩm nằm trong JSON items, không lặp lại trong text.

## Khi khách chưa biết chọn gì (nghiên cứu trước khi mua)
- Khách hỏi "loại nào tốt", "khác nhau thế nào": trình bày 3-4 tiêu chí chọn (gạch đầu dòng ngắn), RỒI mới search_products và áp tiêu chí vào sản phẩm thật có bán.
- Nêu assumption còn thiếu (VD: "giả sử cho bé trai 6-8 tuổi").

## Sau khi mua (chăm sóc khách)
- Câu hỏi trạng thái đơn: chỉ nói "bạn có thể xem tại trang Theo dõi đơn hàng (/track) với mã đơn", KHÔNG bịa trạng thái, KHÔNG giả vờ tra được đơn.
- Đổi trả/hư hỏng: trả lời theo quy định chung, hướng dẫn liên hệ hỗ trợ. Không hứa hoàn tiền hay bồi thường.

## Định dạng trả lời (BẮT BUỘC)
Trả về DUY NHẤT một JSON object, không markdown, không text bọc ngoài:
{"text": "<1-3 câu trả lời tiếng Việt>", "items": [{"id": "<variantId hoặc productId từ kết quả search>", "name": "<tên>", "price": <số nguyên VND>, "category": "<tên nhóm>", "reason": "<một mệnh đề lý do>"}]}
- items: [] nếu không có sản phẩm phù hợp. Tối đa 4 items.
- price là SỐ (đơn vị VND, không phân tách hàng nghìn).
- Nếu cần hỏi lại khách, đặt câu hỏi trong "text", items để [].`;

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

async function searchProducts(query: string) {
  try {
    const result = await listStorefrontProducts({ q: query });
    // Compact the catalog for the model: name, price, stock, category.
    const products = result.products.slice(0, 12).map((p) => {
      const variants = p.variants as {
        id: string; name: string;
        prices: { amount: number }[];
        balances: { onHand: number; reserved: number }[];
      }[];
      const first = variants[0];
      const price = first?.prices?.[0]?.amount ?? null;
      const stock = (first?.balances ?? []).reduce((s, b) => s + b.onHand - b.reserved, 0);
      return {
        id: first?.id ?? p.id,
        name: p.name,
        category: (p as { category?: { name?: string } }).category?.name ?? "Sách",
        price,
        inStock: stock > 0,
        author: (p as { author?: { name?: string } }).author?.name ?? null,
      };
    });
    return JSON.stringify({ products });
  } catch {
    // Search must never crash the chat — an empty result the model can phrase.
    return JSON.stringify({ products: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Public, per-IP: cheap enough to be generous, tight enough to cap cost.
    await enforceRateLimit("concierge", clientIp(req.headers), 20, 60_000);

    if (!conciergeConfigured()) {
      return NextResponse.json(
        { code: "NOT_CONFIGURED", message: "DEEPSEEK_API_KEY chưa cấu hình — thủ thư AI đang chạy chế độ demo." },
        { status: 503 },
      );
    }

    const body = (await req.json().catch(() => null)) as {
      messages?: { role: "user" | "assistant"; content: string }[];
    } | null;
    const history = body?.messages?.filter((m) => typeof m.content === "string" && m.content.trim()).slice(-8) ?? [];
    if (history.length === 0) {
      return NextResponse.json({ code: "VALIDATION", message: "Thiếu nội dung tin nhắn" }, { status: 400 });
    }

    // Shared daily bucket across ALL IPs: hard ceiling on credit burn.
    await enforceRateLimit("concierge-daily", "global", DAILY_LIMIT, 24 * 60 * 60_000);

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
    ];

    // Up to 2 tool rounds: search → answer. Enough for every skill flow.
    for (let round = 0; round < 2; round++) {
      const res = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, max_tokens: 800, temperature: 0.3 }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(JSON.stringify({ level: "error", event: "concierge_upstream", status: res.status, message: errText.slice(0, 300) }));
        return NextResponse.json(
          { code: "UPSTREAM", message: "Thủ thư AI tạm thời không phản hồi, thử lại sau nhé." },
          { status: 502 },
        );
      }
      const data = (await res.json()) as {
        choices: { message: ChatMessage & { tool_calls?: ChatMessage["tool_calls"] } }[];
      };
      const msg = data.choices[0]?.message;
      if (!msg) throw new Error("empty response");

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        // Parse the JSON the system prompt demands; degrade to raw text if the
        // model strayed, so the UI still shows something useful.
        let parsed: { text?: string; items?: { id: string; name: string; price: number; category: string; reason: string }[] };
        try {
          const raw = msg.content ?? "";
          const start = raw.indexOf("{");
          const end = raw.lastIndexOf("}");
          parsed = start >= 0 && end > start ? JSON.parse(raw.slice(start, end + 1)) : { text: raw };
        } catch {
          parsed = { text: msg.content ?? "" };
        }
        return NextResponse.json({
          text: parsed.text?.slice(0, 1500) ?? "Mình chưa hiểu ý bạn, thử diễn đạt khác nhé!",
          items: Array.isArray(parsed.items)
            ? parsed.items
                .filter((i) => i && typeof i.id === "string" && typeof i.name === "string")
                .slice(0, 4)
                .map((i) => ({
                  id: i.id,
                  name: i.name,
                  price: Number(i.price) || 0,
                  category: typeof i.category === "string" ? i.category : "Sách",
                  reason: typeof i.reason === "string" ? i.reason : "",
                }))
            : [],
        });
      }

      // Execute tool calls, append results, loop for the final answer.
      messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
      for (const call of toolCalls) {
        let result: string;
        try {
          const args = JSON.parse(call.function.arguments || "{}") as { query?: string };
          result = await searchProducts(String(args.query ?? "").slice(0, 80));
        } catch {
          result = JSON.stringify({ products: [] });
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }

    return NextResponse.json({ text: "Mình cần thêm thông tin nhé — bạn mô tả cụ thể hơn được không?", items: [] });
  } catch (error) {
    return apiError(error);
  }
}
