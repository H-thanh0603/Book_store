"use client";

import { useState } from "react";
import { useEscapeClose } from "./useEscapeClose";
import {
  Bot,
  Send,
  ShoppingBag,
  X,
} from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";

type ProductSuggestion = {
  id: string;
  productId: string;
  name: string;
  price: number;
  category: string;
  reason: string;
};

type ComparedRow = {
  variantId: string; found: boolean; sku?: string; variantName?: string;
  productName?: string; description?: string; price?: number | null;
  available?: number; inStock?: boolean;
};

const quickPrompts = [
  "🎁 Gợi ý quà sinh nhật cho bé trai 6 tuổi",
  "✏️ Combo trọn bộ dụng cụ học tập cấp 2",
  "💼 Tủ sách kinh tế & quản trị cho CEO",
];

const mockRecommendations: Record<string, ProductSuggestion[]> = {
  default: [
    { id: "1", productId: "1", name: "Dế Mèn Phiêu Lưu Ký (Bản Bìa Cứng)", price: 89000, category: "Văn Học", reason: "Tác phẩm kinh điển nuôi dưỡng tâm hồn và lòng trắc ẩn qua nhiều thế hệ." },
    { id: "2", productId: "2", name: "LEGO Classic Creative Bricks 11002", price: 899000, category: "Đồ Chơi", reason: "Bộ lắp ráp 300+ chi tiết kích thích tư duy không gian và sáng tạo vô hạn." },
  ],
  healing: [
    { id: "3", productId: "3", name: "Tôi Thấy Hoa Vàng Trên Cỏ Xanh", price: 118000, category: "Văn Học", reason: "Những trang văn êm đềm đưa tâm trí trở về ký ức tuổi thơ thanh bình." },
    { id: "4", productId: "4", name: "Bộ Quà Tết: Sổ Tay Mộc + Bookmark Dập Nổi", price: 159000, category: "Quà Tặng", reason: "Món quà tinh tế giúp ghi chép nhật ký biết ơn và tĩnh tâm mỗi ngày." },
  ],
  kids: [
    { id: "5", productId: "5", name: "Gấu Bông Hello Kitty Sanrio 30cm", price: 259000, category: "Đồ Chơi", reason: "Chất liệu lông cừu mềm mại chuẩn an toàn cho bé ôm khi ngủ." },
    { id: "6", productId: "6", name: "Bộ Màu Nước Mỹ Thuật 12 Màu Cao Cấp", price: 78000, category: "Mỹ Thuật", reason: "Màu sắc tươi sáng, gốc nước an toàn không độc hại cho trẻ nhỏ." },
  ],
};

export default function AIConciergeModal({ onAddToCart }: { onAddToCart?: (item: ProductSuggestion) => void }) {
  const [open, setOpen] = useState(false);
  useEscapeClose(open, () => setOpen(false));
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  // Server-side conversation id (#13): the client sends only fresh turns;
  // history lives in AgentChatTurn rows. Kept in state (per page-load chat).
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<
    { sender: "user" | "ai"; text: string; items?: ProductSuggestion[]; comparison?: ComparedRow[]; plan?: { title: string; status: string }[] }[]
  >([
    {
      sender: "ai",
      text: "Xin chào bạn đọc! Mình là Thủ Thư AI của Melio Bookstore. Bạn đang tìm sách theo tâm trạng, tìm quà tặng hay cần chọn dụng cụ học tập gì hôm nay?",
    },
  ]);

  // Answer feedback — fire-and-forget POST /api/agent-feedback.
  async function sendFeedback(rating: "up" | "down", turnText: string) {
    setFeedbackSent(rating);
    fetch("/api/agent-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await csrfHeaders()) },
      body: JSON.stringify({ rating, agent: "concierge", turnText: turnText.slice(0, 400) }),
    }).catch(() => {});
  }

  async function handleSend(textToSend?: string) {
    const q = textToSend || input;
    if (!q.trim() || pending) return;

    const newMsgs = [...messages, { sender: "user" as const, text: q }];
    setMessages(newMsgs);
    setInput("");
    setPending(true);

    // AI response from /api/concierge (DeepSeek + real catalog search).
    // Falls back to the canned demo replies when the API is unconfigured
    // (no DEEPSEEK_API_KEY) or unreachable, so the demo never dead-ends.
    const chatHistory = newMsgs
      .filter((m) => m.sender === "user" || m.sender === "ai")
      .slice(-8)
      .map((m) => ({ role: m.sender === "user" ? ("user" as const) : ("assistant" as const), content: m.text }));

    fetch("/api/concierge", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await csrfHeaders()) },
      body: JSON.stringify({ messages: chatHistory, ...(chatId ? { chatId } : {}) }),
    })
      .then(async (res) => {
        if (!res.ok) throw Object.assign(new Error(String(res.status)), { status: res.status });
        const data = (await res.json()) as { text: string; items: ProductSuggestion[]; comparison?: ComparedRow[]; chatId?: string; plan?: { title: string; status: string }[]; cartUpdated?: boolean };
        if (typeof data.chatId === "string" && data.chatId) setChatId(data.chatId);
        setMessages((prev) => [...prev, { sender: "ai", text: data.text, items: data.items, comparison: data.comparison, plan: data.plan }]);
        // Shared cart: the agent rewrote server lines — refresh the visible
        // cart so the shopper sees the agent's hand without reloading.
        if (data.cartUpdated) window.dispatchEvent(new Event("melio:cart-refresh"));
      })
      .catch((err: Error & { status?: number }) => {
        // 429 rate-limited / 5xx configured-but-broken: honest message, no
        // fake demo suggestions (those are only for NOT_CONFIGURED 503).
        if (err.status && err.status !== 503) {
          setMessages((prev) => [
            ...prev,
            {
              sender: "ai",
              text: err.status === 429
                ? "Bạn gửi nhanh quá — chợ mình cần vài giây nghỉ, thử lại sau nhé!"
                : "Mình đang gặp sự cố kỹ thuật, thử lại sau nhé!",
            },
          ]);
          return;
        }
        let key = "default";
        const lower = q.toLowerCase();
        if (lower.includes("chữa lành") || lower.includes("tâm") || lower.includes("đi làm")) key = "healing";
        else if (lower.includes("bé") || lower.includes("trẻ") || lower.includes("quà") || lower.includes("đồ chơi")) key = "kids";
        setMessages((prev) => [
          ...prev,
          {
            sender: "ai",
            text: "Mình đang chế độ demo (chưa cấu hình AI). Đây là vài gợi ý mẫu:",
            items: mockRecommendations[key] || mockRecommendations.default,
          },
        ]);
      })
      .finally(() => setPending(false));
  }

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-40 px-4 py-3 rounded-full bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#334155] text-white font-bold text-xs shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2.5 border border-white/20 group"
      >
        <div className="size-6 rounded-full bg-amber-400 text-[#1c1917] flex items-center justify-center shadow">
          <Bot className="w-3.5 h-3.5" />
        </div>
        <span>Thủ Thư AI</span>
        <span className="bg-amber-400 text-[#1c1917] text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase">
          Tư Vấn
        </span>
      </button>

      {/* Modal Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div role="dialog" aria-modal="true" aria-label="Trợ lý AI" className="w-full max-w-lg bg-[#fbf9f5] rounded-3xl shadow-2xl border border-[#ede5d8] overflow-hidden flex flex-col h-[580px] animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-4 bg-[#1c1917] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-amber-400 text-[#1c1917] flex items-center justify-center shadow">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <b className="block text-sm font-serif">Thủ Thư AI · Melio Concierge</b>
                  <span className="text-[10px] text-amber-300 font-serif">Tư vấn sách &amp; Quà tặng cá nhân hóa 24/7</span>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="size-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chat message thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 font-serif">
              {pending && (
                <div className="flex justify-start">
                  <div className="bg-white border border-[#ede5d8] shadow-2xs rounded-2xl rounded-bl-none px-4 py-3 flex gap-1" aria-label="Thủ thư AI đang soạn tin">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="size-1.5 rounded-full bg-slate-400 animate-pulse"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                      m.sender === "user"
                        ? "bg-[#1c1917] text-white rounded-br-none"
                        : "bg-white text-slate-800 border border-[#ede5d8] shadow-2xs rounded-bl-none"
                    }`}
                  >
                    <p>{m.text}</p>

                    {/* Model-authored task plan (#2): progress the agent
                        declared via update_plan. Read-only render. */}
                    {m.plan && m.plan.length > 0 && (
                      <div className="mt-2 rounded-xl bg-[#faf4ea] border border-[#ede5d8] px-2.5 py-2 space-y-1">
                        {m.plan.map((step, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                            <span aria-hidden="true">
                              {step.status === "done" ? "✅" : step.status === "doing" ? "⏳" : "▫️"}
                            </span>
                            <span className={step.status === "done" ? "line-through text-slate-400" : ""}>
                              {step.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Answer feedback (thumbs): powers the weekly quality
                        review; best-effort identity, no PII stored. */}
                    {m.sender === "ai" && idx > 0 && (
                      <div className="mt-1.5 flex gap-1">
                        {(["up", "down"] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => sendFeedback(r, m.text)}
                            aria-label={r === "up" ? "Câu trả lời hữu ích" : "Câu trả lời chưa tốt"}
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-colors ${
                              feedbackSent === r
                                ? "bg-[#ede5d8] text-[#8c2d19]"
                                : "text-slate-400 hover:text-[#8c2d19] hover:bg-[#faf4ea]"
                            }`}
                          >
                            {r === "up" ? "👍 Hữu ích" : "👎 Chưa đúng"}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Product Suggestion Cards */}
                    {m.items && (
                      <div className="mt-3 space-y-2">
                        {m.items.map((item) => (
                          <div
                            key={item.id}
                            className="p-3 rounded-xl bg-[#faf6ef] border border-[#e8dac5] space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-[#8c2d19]">
                                {item.category}
                              </span>
                              <b className="font-bold text-[#8c2d19]">
                                {item.price.toLocaleString("vi-VN")} ₫
                              </b>
                            </div>
                            <h5 className="font-bold text-slate-900 text-xs">{item.name}</h5>
                            <p className="text-[11px] text-slate-600 italic">&ldquo;{item.reason}&rdquo;</p>
                            <button
                              onClick={() => {
                                if (onAddToCart) onAddToCart(item);
                                setOpen(false);
                              }}
                              className="mt-1 w-full py-1.5 bg-[#1c1917] hover:bg-[#8c2d19] text-white font-bold text-[11px] rounded-lg shadow flex items-center justify-center gap-1"
                            >
                              <ShoppingBag className="w-3 h-3" /> Thêm vào giỏ hàng
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Comparison table: side-by-side DB rows, not prose */}
                    {m.comparison && m.comparison.length >= 2 && (
                      <div className="mt-3 overflow-x-auto rounded-xl border border-[#e8dac5]">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="bg-[#faf6ef] text-slate-500">
                              <th className="text-left font-bold px-2.5 py-1.5">Món</th>
                              <th className="text-right font-bold px-2.5 py-1.5">Giá</th>
                              <th className="text-right font-bold px-2.5 py-1.5">Tồn</th>
                              <th className="px-2.5 py-1.5" />
                            </tr>
                          </thead>
                          <tbody>
                            {m.comparison.map((c) => (
                              <tr key={c.variantId} className="border-t border-[#ede5d8] bg-white">
                                <td className="px-2.5 py-1.5">
                                  <div className="font-bold text-slate-900">{c.productName}{c.variantName ? ` — ${c.variantName}` : ""}</div>
                                  {c.sku ? <div className="text-[10px] text-slate-400">{c.sku}</div> : null}
                                </td>
                                <td className="px-2.5 py-1.5 text-right font-bold text-[#8c2d19] whitespace-nowrap">
                                  {c.price != null ? `${c.price.toLocaleString("vi-VN")} ₫` : "—"}
                                </td>
                                <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
                                  {c.inStock ? <span className="text-[#14532d]">Còn {c.available}</span> : <span className="text-red-600">Hết</span>}
                                </td>
                                <td className="px-2.5 py-1.5">
                                  {c.inStock && onAddToCart ? (
                                    <button
                                      onClick={() => {
                                        onAddToCart({ id: c.variantId, productId: c.variantId, name: c.productName ?? "", price: c.price ?? 0, category: "", reason: "So sánh trong chat" });
                                      }}
                                      className="px-2 py-1 bg-[#1c1917] hover:bg-[#8c2d19] text-white font-bold text-[10px] rounded-lg whitespace-nowrap"
                                    >
                                      + Thêm
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Prompts */}
            <div className="p-2.5 bg-white border-t border-[#ede5d8] overflow-x-auto flex gap-1.5">
              {quickPrompts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(p)}
                  className="px-2.5 py-1 rounded-full bg-[#faf7f2] hover:bg-[#ede5d8] text-[10px] font-serif text-slate-700 whitespace-nowrap border border-[#ede5d8]"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Input bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="p-3 bg-white border-t border-[#ede5d8] flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={pending}
                placeholder="Hỏi thủ thư: Tìm sách kinh tế, quà sinh nhật..."
                className="flex-1 bg-[#faf7f2] border border-[#ede5d8] rounded-xl px-3 py-2 text-xs font-serif text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={pending}
                className="size-9 rounded-xl bg-[#1c1917] hover:bg-[#8c2d19] text-white flex items-center justify-center shadow disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
