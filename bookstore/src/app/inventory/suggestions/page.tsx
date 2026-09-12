"use client";
import { useEffect, useState } from "react";
import Nav from "../../nav";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
  ArrowLeftRight,
  Truck,
} from "lucide-react";

type Suggestion = {
  id: string;
  status: string;
  recommendedQty: number;
  availableQty: number;
  averageDailySales: number;
  rationale: { daysOfCover?: number; balancedFrom?: { locationId: string; qty: number }; unitCost?: number } | null;
  variant: { sku: string; product: { name: string } };
  location: { id: string; name: string };
};

type ChatMsg = { role: "user" | "assistant"; content: string };

export default function SuggestionsPage() {
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [pending, setPending] = useState<{ s: Suggestion; action: "ACCEPTED" | "DISMISSED" } | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestBusy, setDigestBusy] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/replenishment");
      if (r.ok) {
        const d = await r.json();
        setRows((d.suggestions ?? []).filter((s: Suggestion) => s.status === "OPEN" && s.recommendedQty > 0));
      } else {
        setMsg({ text: (await r.json()).message ?? "Lỗi tải gợi ý", type: "error" });
      }
    } catch {
      setMsg({ text: "Không thể kết nối đến máy chủ.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function generate() {
    setGenerating(true);
    try {
      const r = await fetch("/api/replenishment", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
        body: JSON.stringify({ action: "generate" }),
      });
      if (r.ok) {
        const d = await r.json();
        setRows((d.suggestions ?? []).filter((s: Suggestion) => s.status === "OPEN" && s.recommendedQty > 0));
        setMsg({ text: "Đã tạo mới gợi ý nhập hàng", type: "success" });
      } else {
        setMsg({ text: (await r.json()).message ?? "Lỗi tạo gợi ý", type: "error" });
      }
    } finally {
      setGenerating(false);
    }
  }

  async function applyAction() {
    if (!pending) return;
    const { s, action } = pending;
    setPending(null);
    const r = await fetch("/api/replenishment", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify({ suggestionId: s.id, status: action }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setMsg({
        text: action === "ACCEPTED"
          ? `Đã duyệt ${s.variant.product.name} — tạo ${d.created?.kind === "transfer" ? "phiếu điều chuyển" : "PO chờ duyệt"} ${d.created?.number ?? ""}`
          : `Đã bỏ qua gợi ý ${s.variant.product.name}`,
        type: "success",
      });
      void load();
    } else {
      setMsg({ text: d.message ?? "Thao tác thất bại (có thể gợi ý đã được xử lý)", type: "error" });
    }
  }

  async function summarize() {
    setDigestBusy(true);
    try {
      const r = await fetch("/api/merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: "digest", messages: [{ role: "user", content: "Tóm tắt tình hình nhập hàng sáng nay." }] }),
      });
      const d = await r.json();
      setDigest(r.ok ? d.text : `Lỗi: ${d.message ?? r.status}`);
    } catch {
      setDigest("Lỗi: không thể kết nối đến trợ lý.");
    } finally {
      setDigestBusy(false);
    }
  }

  async function sendChat() {
    if (!draft.trim() || chatBusy) return;
    const next = [...chat, { role: "user" as const, content: draft.trim() }].slice(-8);
    setChat(next);
    setDraft("");
    setChatBusy(true);
    try {
      const r = await fetch("/api/merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: "inventory", messages: next }),
      });
      const d = await r.json();
      setChat([...next, { role: "assistant" as const, content: r.ok ? d.text : `Lỗi: ${d.message ?? r.status}` }].slice(-8));
    } catch {
      setChat([...next, { role: "assistant" as const, content: "Lỗi: không thể kết nối đến trợ lý." }].slice(-8));
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#faf7f2] pb-16">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#ede5d8] shadow-xs">
          <div>
            <h1 className="font-serif text-2xl font-bold text-[#1c1917] tracking-tight flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-[#8c2d19]" aria-hidden="true" />
              Gợi Ý Nhập Hàng
            </h1>
            <p className="text-xs text-[#574431] mt-1">
              AI đề xuất theo sức bán — duyệt mới tạo phiếu điều chuyển hoặc PO chờ duyệt. Không có gì tự chạy.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={summarize}
              disabled={digestBusy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-[#8c2d19]/10 hover:bg-[#8c2d19]/15 text-[#8c2d19] transition-colors disabled:opacity-50"
            >
              {digestBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
              Tóm tắt AI
            </button>
            <button
              onClick={generate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-[#faf4ea] hover:bg-[#ede5d8] text-[#574431] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} aria-hidden="true" />
              Tính lại gợi ý
            </button>
          </div>
        </div>

        {msg && (
          <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-medium ${msg.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
            {msg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />}
            <span>{msg.text}</span>
          </div>
        )}

        {digest && (
          <div className="bg-white rounded-2xl border border-[#8c2d19]/20 p-5 shadow-xs" role="status">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#8c2d19] mb-2">Bản tin AI — chưa kiểm chứng, đối chiếu số trước khi duyệt</p>
            <p className="text-sm text-[#1c1917] leading-relaxed whitespace-pre-line">{digest}</p>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#ede5d8] shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[#ede5d8] flex items-center justify-between">
            <h2 className="font-bold text-[#1c1917] text-sm">Gợi ý đang mở ({rows.length})</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-[#574431] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Đang tải…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#574431]">
              Không có gợi ý mở. Bấm “Tính lại gợi ý” để chạy dự báo tồn kho.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#faf4ea] border-b border-[#ede5d8] text-[#574431] uppercase tracking-wider font-semibold text-[11px]">
                  <tr>
                    <th className="p-4">Sản phẩm</th>
                    <th className="p-4">Kho</th>
                    <th className="p-4 text-center">Tồn</th>
                    <th className="p-4 text-center">Nên nhập</th>
                    <th className="p-4 text-center">Ngày bao phủ</th>
                    <th className="p-4">Hướng xử lý</th>
                    <th className="p-4 text-right">Duyệt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ede5d8]/60">
                  {rows.map((s) => (
                    <tr key={s.id} className="hover:bg-[#faf4ea]/50 transition-colors">
                      <td className="p-4">
                        <p className="font-bold text-[#1c1917]">{s.variant.product.name}</p>
                        <p className="font-mono text-[10px] text-[#574431]">{s.variant.sku}</p>
                      </td>
                      <td className="p-4 text-[#574431]">{s.location.name}</td>
                      <td className="p-4 text-center font-bold text-[#1c1917]">{s.availableQty}</td>
                      <td className="p-4 text-center font-black text-[#8c2d19]">+{s.recommendedQty}</td>
                      <td className="p-4 text-center text-[#574431]">{s.rationale?.daysOfCover ?? "—"}</td>
                      <td className="p-4">
                        {s.rationale?.balancedFrom ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#14532d]">
                            <ArrowLeftRight className="w-3 h-3" aria-hidden="true" /> Điều chuyển nội bộ
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#574431]">
                            <Truck className="w-3 h-3" aria-hidden="true" /> Đặt NCC (PO chờ duyệt)
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap space-x-1.5">
                        <button
                          onClick={() => setPending({ s, action: "ACCEPTED" })}
                          aria-label={`Duyệt nhập ${s.variant.product.name} về ${s.location.name}`}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          Duyệt
                        </button>
                        <button
                          onClick={() => setPending({ s, action: "DISMISSED" })}
                          aria-label={`Bỏ qua gợi ý ${s.variant.product.name}`}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                        >
                          Bỏ qua
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[#ede5d8] shadow-xs p-5">
          <h2 className="font-bold text-[#1c1917] text-sm mb-3 flex items-center gap-2">
            <Send className="w-4 h-4 text-[#8c2d19]" aria-hidden="true" />
            Hỏi thủ kho AI
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto mb-3" aria-live="polite">
            {chat.length === 0 && (
              <p className="text-xs text-[#574431]">VD: “Sách nào sắp hết ở kho Nguyễn Huệ?” — AI chỉ đọc số liệu, duyệt vẫn do bạn bấm nút.</p>
            )}
            {chat.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "bg-[#8c2d19] text-white" : "bg-[#faf4ea] text-[#1c1917] border border-[#ede5d8]"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatBusy && <p className="text-xs text-[#574431]">Thủ kho đang tra số liệu…</p>}
          </div>
          <div className="flex gap-2">
            <label htmlFor="sugg-chat" className="sr-only">Hỏi thủ kho AI</label>
            <input
              id="sugg-chat"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendChat(); } }}
              placeholder="Hỏi về tồn kho, gợi ý nhập…"
              className="flex-1 bg-[#faf4ea] border border-[#e8dac5] rounded-xl px-3 py-2 text-sm text-[#1c1917] placeholder:text-[#574431]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20 focus:border-[#8c2d19]"
            />
            <button
              onClick={() => void sendChat()}
              disabled={chatBusy || !draft.trim()}
              aria-label="Gửi câu hỏi"
              className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#8c2d19] hover:bg-[#7a2816] disabled:opacity-50"
            >
              Gửi
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        request={pending ? {
          title: pending.action === "ACCEPTED" ? `Duyệt nhập ${pending.s.variant.product.name}?` : `Bỏ qua gợi ý ${pending.s.variant.product.name}?`,
          body: pending.action === "ACCEPTED"
            ? `Nhập +${pending.s.recommendedQty} về ${pending.s.location.name} — tạo ${pending.s.rationale?.balancedFrom ? "phiếu điều chuyển nội bộ" : "PO ở trạng thái chờ duyệt (cần duyệt thêm 1 bước)"}.`
            : "Gợi ý sẽ chuyển sang đã bỏ qua và không tạo chứng từ nào.",
          confirmLabel: pending.action === "ACCEPTED" ? "Duyệt nhập" : "Bỏ qua",
        } : null}
        onConfirm={() => void applyAction()}
        onCancel={() => setPending(null)}
      />
    </main>
  );
}
