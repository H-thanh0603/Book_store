"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import {
  Gift,
  Plus,
  ClipboardCheck,
  Undo2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";

type Card = {
  id: string;
  code: string;
  initialValue: number;
  balance: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
};
type Count = {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  items: { id: string; variantId: string; expectedQty: number; countedQty: number }[];
};
type SupplierReturn = {
  id: string;
  number: string;
  status: string;
  supplier: { name: string };
  items: { id: string; quantity: number; variant: { sku: string } }[];
};

export default function GiftCardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [counts, setCounts] = useState<Count[]>([]);
  const [sreturns, setSreturns] = useState<SupplierReturn[]>([]);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [issue, setIssue] = useState({ amount: "", code: "" });
  const [op, setOp] = useState({ code: "", amount: "" });
  const [activeTab, setActiveTab] = useState<"cards" | "counts" | "returns">("cards");

  async function load() {
    const g = await fetch("/api/gift-cards");
    if (g.ok) setCards((await g.json()).cards);
    const c = await fetch("/api/inventory-counts");
    if (c.ok) setCounts((await c.json()).counts);
    const s = await fetch("/api/supplier-returns");
    if (s.ok) setSreturns((await s.json()).returns);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function createCard() {
    if (!Number(issue.amount)) {
      setMsg({ text: "Vui lòng nhập mệnh giá thẻ quà tặng", type: "error" });
      return;
    }
    const r = await fetch("/api/gift-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(issue.amount), code: issue.code || undefined }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Đã phát hành thẻ quà tặng ${d.code}!`, type: "success" });
      setIssue({ amount: "", code: "" });
      load();
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  async function patch(action: "adjust" | "deactivate") {
    if (!op.code) {
      setMsg({ text: "Vui lòng nhập mã Gift Card", type: "error" });
      return;
    }
    const r = await fetch("/api/gift-cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: op.code,
        action,
        ...(action === "adjust" ? { amount: Number(op.amount) } : {}),
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({
        text:
          action === "adjust"
            ? `Cập nhật số dư thẻ ${d.code} thành: ${d.balance.toLocaleString("vi-VN")} ₫`
            : `Đã vô hiệu hoá thẻ ${d.code}`,
        type: "success",
      });
      load();
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  async function postCount(c: Count) {
    if (!window.confirm(`Xác nhận phê duyệt kiểm kê ${c.number}? Số lượng tồn kho hệ thống sẽ được cân đối theo thực tế kiểm đếm.`))
      return;
    const r = await fetch("/api/inventory-counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inventoryCountId: c.id }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Đã hoàn tất cân đối kiểm kê ${c.number}!`, type: "success" });
      load();
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  const vnd = (n: number) => n.toLocaleString("vi-VN") + " ₫";

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Header bar */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Gift Cards, Kiểm Kê &amp; Trả Hàng NCC
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                <Sparkles className="w-3 h-3" />
                Quản trị nâng cao
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Phát hành thẻ quà tặng, phê duyệt biên bản kiểm kê cân đối kho và quản lý phiếu trả nhà cung cấp
            </p>
          </div>

          {/* Navigation Pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => setActiveTab("cards")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "cards" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Gift className="w-3.5 h-3.5" />
              Gift Cards ({cards.length})
            </button>
            <button
              onClick={() => setActiveTab("counts")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "counts" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              Kiểm kê ({counts.length})
            </button>
            <button
              onClick={() => setActiveTab("returns")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "returns" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Undo2 className="w-3.5 h-3.5" />
              Trả NCC ({sreturns.length})
            </button>
          </div>
        </div>

        {/* Global Toast */}
        {msg && (
          <div
            className={`p-4 rounded-2xl flex items-center justify-between gap-2 text-xs font-semibold ${
              msg.type === "success"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            <div className="flex items-center gap-2">
              {msg.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
              <span>{msg.text}</span>
            </div>
            <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
          </div>
        )}

        {/* TAB 1: GIFT CARDS */}
        {activeTab === "cards" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 space-y-4">
              {/* Issue card */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">Phát Hành Gift Card Mới</h3>
                </div>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Mệnh giá nạp (₫)</label>
                    <input
                      type="number"
                      step={10000}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="VD: 200000, 500000..."
                      value={issue.amount}
                      onChange={(e) => setIssue({ ...issue, amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Mã thẻ (Tự sinh nếu bỏ trống)</label>
                    <input
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="VD: GC-MELIO-8888"
                      value={issue.code}
                      onChange={(e) => setIssue({ ...issue, code: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <button
                    onClick={createCard}
                    disabled={!Number(issue.amount)}
                    className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-semibold shadow-md shadow-pink-600/20 transition-all hover:scale-[1.01]"
                  >
                    Phát hành thẻ
                  </button>
                </div>
              </div>

              {/* Adjust / Deactivate card */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
                <h3 className="font-bold text-slate-900 text-sm">Điều Chỉnh Hoặc Khoá Thẻ</h3>
                <div className="space-y-2.5">
                  <input
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="Mã thẻ Gift Card..."
                    value={op.code}
                    onChange={(e) => setOp({ ...op, code: e.target.value.toUpperCase() })}
                  />
                  <input
                    type="number"
                    step={10000}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="Số tiền (+ để cộng, - để trừ)..."
                    value={op.amount}
                    onChange={(e) => setOp({ ...op, amount: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => patch("adjust")}
                      disabled={!op.code || op.amount === ""}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-semibold transition-colors"
                    >
                      ± Điều chỉnh số dư
                    </button>
                    <button
                      onClick={() => patch("deactivate")}
                      disabled={!op.code}
                      className="flex-1 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 disabled:opacity-40 rounded-xl text-xs font-semibold transition-colors"
                    >
                      Khoá vô hiệu
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Cards Table */}
            <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm">Danh Sách Thẻ Quà Tặng Đang Quản Lý</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                    <tr>
                      <th className="p-4">Mã Voucher</th>
                      <th className="p-4 text-right">Mệnh giá gốc</th>
                      <th className="p-4 text-right">Số dư khả dụng</th>
                      <th className="p-4 text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cards.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-4">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {c.code}
                          </span>
                        </td>
                        <td className="p-4 text-right font-medium text-slate-600">{vnd(c.initialValue)}</td>
                        <td className="p-4 text-right font-black text-pink-600">{vnd(c.balance)}</td>
                        <td className="p-4 text-right">
                          {c.active ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Khả dụng
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
                              Đã vô hiệu
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {cards.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <Gift className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Chưa có thẻ quà tặng nào.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: INVENTORY AUDIT COUNTS */}
        {activeTab === "counts" && (
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Biên Bản Kiểm Kê Tồn Kho Thực Tế</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                  <tr>
                    <th className="p-4">Mã biên bản</th>
                    <th className="p-4">Ngày tạo</th>
                    <th className="p-4">Chi tiết chênh lệch kiểm đếm</th>
                    <th className="p-4">Trạng thái</th>
                    <th className="p-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {counts.map((c) => {
                    const diffs = c.items.filter((i) => i.expectedQty !== i.countedQty);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-4 font-bold text-indigo-700">{c.number}</td>
                        <td className="p-4 text-slate-600 font-medium">
                          {new Date(c.createdAt).toLocaleDateString("vi-VN")}
                        </td>
                        <td className="p-4">
                          {diffs.length === 0 ? (
                            <span className="text-emerald-700 font-semibold">Khớp 100% không lệch</span>
                          ) : (
                            <div className="space-y-1">
                              {diffs.map((d, k) => (
                                <div key={k} className="text-[11px]">
                                  <span className="font-mono text-slate-600">{d.variantId.slice(0, 8)}...</span>: Sách hệ thống: <b className="text-slate-800">{d.expectedQty}</b> ➔ Thực đếm: <b className="text-rose-700">{d.countedQty}</b>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${c.status === "DRAFT" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                            {c.status === "DRAFT" ? "Dự thảo chờ duyệt" : "Đã cân đối"}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {c.status === "DRAFT" && (
                            <button
                              onClick={() => postCount(c)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs shadow-xs transition-colors"
                            >
                              Duyệt &amp; Cân đối kho
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {counts.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-xs">
                <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Không có đợt kiểm kê nào.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SUPPLIER RETURNS */}
        {activeTab === "returns" && (
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Phiếu Trả Hàng Cho Nhà Cung Cấp (Credit Notes)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                  <tr>
                    <th className="p-4">Mã Phiếu Trả</th>
                    <th className="p-4">Nhà cung cấp</th>
                    <th className="p-4">Chi tiết mặt hàng hoàn trả</th>
                    <th className="p-4">Tổng số lượng</th>
                    <th className="p-4 text-right">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sreturns.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-4 font-bold text-indigo-700">{s.number}</td>
                      <td className="p-4 font-semibold text-slate-800">{s.supplier?.name}</td>
                      <td className="p-4 space-y-1">
                        {s.items.map((i, k) => (
                          <div key={k} className="text-[11px]">
                            <span className="font-mono font-semibold text-slate-700">{i.variant?.sku}</span>: {i.quantity} sp
                          </div>
                        ))}
                      </td>
                      <td className="p-4 font-bold text-slate-900">
                        {s.items.reduce((sum, i) => sum + i.quantity, 0)} sp
                      </td>
                      <td className="p-4 text-right">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sreturns.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-xs">
                <Undo2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Chưa có phiếu trả hàng nhà cung cấp nào.
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
