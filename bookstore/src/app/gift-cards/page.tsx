"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import {
  Gift,
  Plus,
  Search,
  XCircle,
  CheckCircle2,
  AlertCircle,
  CreditCard,
} from "lucide-react";

type GiftCard = {
  id: string;
  code: string;
  initialValue: string;
  balance: string;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  transactions: { id: string; amount: string; balanceAfter: string; refType: string | null; refId: string | null; createdAt: string }[];
};

export default function GiftCardsPage() {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [viewCard, setViewCard] = useState<GiftCard | null>(null);
  const [newAmount, setNewAmount] = useState(100000);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const r = await fetch(`/api/gift-cards?${params}`);
      if (r.ok) setCards((await r.json()).giftCards ?? []);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-fetch; load() is not memoized, adding it would refetch every render
  useEffect(() => { void load(); }, [q]);

  async function issueCard() {
    const r = await fetch("/api/gift-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify({ initialValue: newAmount }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Tạo gift card ${d.giftCard.code} thành công`, type: "success" });
      setShowCreate(false);
      void load();
    } else {
      setMsg({ text: d.message ?? "Lỗi", type: "error" });
    }
  }

  async function adjustBalance() {
    if (!viewCard || !adjustReason.trim()) return;
    const r = await fetch(`/api/gift-cards/${viewCard.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify({ action: "adjust", amount: adjustAmount, reason: adjustReason }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: "Điều chỉnh thành công", type: "success" });
      setAdjustAmount(0);
      setAdjustReason("");
      void load();
    } else {
      setMsg({ text: d.message ?? "Lỗi", type: "error" });
    }
  }

  async function toggleCard(card: GiftCard) {
    const action = card.active ? "deactivate" : "activate";
    const r = await fetch(`/api/gift-cards/${card.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify({ action }),
    });
    if (r.ok) {
      setMsg({ text: card.active ? "Đã khóa" : "Đã kích hoạt", type: "success" });
      void load();
    }
  }

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Gift className="w-6 h-6 text-indigo-600" />
                Gift Card
              </h1>
              <p className="text-xs text-slate-500 mt-1">Phát hành và quản lý gift card</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input className="bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs font-medium w-48" placeholder="Tìm mã..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                <Plus className="w-3.5 h-3.5" />
                Phát hành
              </button>
            </div>
          </div>
        </div>

        {msg && (
          <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-medium ${msg.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
            {msg.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {msg.text}
            <button onClick={() => setMsg(null)} className="ml-auto"><XCircle className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Gift Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map((card) => (
            <div key={card.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden hover:shadow-md transition-shadow">
              <div className="bg-gradient-to-r from-[#8c2d19] to-[#c83f49] p-4 text-white">
                <div className="flex items-center justify-between mb-4">
                  <CreditCard className="w-6 h-6 opacity-80" />
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${card.active ? "bg-white/20" : "bg-red-500/50"}`}>
                    {card.active ? "Hoạt động" : "Đã khóa"}
                  </span>
                </div>
                <p className="font-mono font-bold text-lg tracking-wider">{card.code}</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Số dư</span>
                  <span className="text-lg font-black text-indigo-700">{Number(card.balance).toLocaleString("vi-VN")} ₫</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Giá trị phát hành</span>
                  <span className="font-semibold text-slate-700">{Number(card.initialValue).toLocaleString("vi-VN")} ₫</span>
                </div>
                {card.expiresAt && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Hết hạn</span>
                    <span className="font-semibold text-slate-700">{new Date(card.expiresAt).toLocaleDateString("vi-VN")}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button onClick={() => setViewCard(card)} className="flex-1 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold text-center">
                    Chi tiết
                  </button>
                  <button onClick={() => toggleCard(card)} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center ${card.active ? "bg-red-50 hover:bg-red-100 text-red-700" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700"}`}>
                    {card.active ? "Khóa" : "Kích hoạt"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {cards.length === 0 && !loading && (
          <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center text-slate-400 text-xs">
            <Gift className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Chưa có gift card nào
          </div>
        )}

        {/* Issue Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <h3 className="font-bold text-slate-900">Phát hành Gift Card</h3>
                <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><XCircle className="w-5 h-5" /></button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Giá trị (₫)</label>
                  <input type="number" min={10000} step={10000} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-lg" value={newAmount} onChange={(e) => setNewAmount(Number(e.target.value) || 0)} />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[100000, 200000, 500000, 1000000].map((amt) => (
                    <button key={amt} onClick={() => setNewAmount(amt)} className="py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-xs font-semibold transition-colors">
                      {(amt / 1000).toFixed(0)}k
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">Hủy</button>
                <button onClick={issueCard} disabled={newAmount <= 0} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white text-xs font-semibold">Phát hành</button>
              </div>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {viewCard && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <div>
                  <h3 className="font-bold text-slate-900 font-mono">{viewCard.code}</h3>
                  <p className="text-xs text-slate-500">Số dư: {Number(viewCard.balance).toLocaleString("vi-VN")} ₫</p>
                </div>
                <button onClick={() => setViewCard(null)} className="text-slate-400 hover:text-slate-600"><XCircle className="w-5 h-5" /></button>
              </div>
              <div className="p-4 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-700 mb-2">Điều chỉnh số dư</h4>
                <div className="flex gap-2">
                  <input type="number" className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" placeholder="+/- số tiền" value={adjustAmount || ""} onChange={(e) => setAdjustAmount(Number(e.target.value) || 0)} />
                  <input className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" placeholder="Lý do" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
                  <button onClick={adjustBalance} disabled={!adjustReason.trim() || adjustAmount === 0} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white text-xs font-semibold">Lưu</button>
                </div>
              </div>
              <div className="overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-2 text-left font-semibold text-slate-600">Thời gian</th>
                      <th className="p-2 text-right font-semibold text-slate-600">Số tiền</th>
                      <th className="p-2 text-right font-semibold text-slate-600">Số dư</th>
                      <th className="p-2 text-left font-semibold text-slate-600">Loại</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewCard.transactions.map((t) => (
                      <tr key={t.id}>
                        <td className="p-2 text-slate-500">{new Date(t.createdAt).toLocaleString("vi-VN")}</td>
                        <td className={`p-2 text-right font-bold ${Number(t.amount) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {Number(t.amount) >= 0 ? "+" : ""}{Number(t.amount).toLocaleString("vi-VN")}
                        </td>
                        <td className="p-2 text-right font-semibold">{Number(t.balanceAfter).toLocaleString("vi-VN")}</td>
                        <td className="p-2 text-slate-600">{t.refType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
