"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import {
  Users,
  UserPlus,
  Search,
  Gift,
  SlidersHorizontal,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Crown,
} from "lucide-react";

type Customer = {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string | null;
  loyalty: { points: number; tier: string } | null;
};
type LoyaltyTx = {
  id: string;
  points: number;
  balanceAfter: number;
  type: string;
  createdAt: string;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [history, setHistory] = useState<{
    points: number;
    tier: string | null;
    transactions: LoyaltyTx[];
  } | null>(null);

  async function load(query: string) {
    const r = await fetch(`/api/customers?q=${encodeURIComponent(query)}`);
    if (r.ok) setCustomers((await r.json()).customers);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(""), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function create() {
    if (!name.trim() || !phone.trim()) {
      setMsg({ text: "Vui lòng nhập họ tên và số điện thoại", type: "error" });
      return;
    }
    const r = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name, phone }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Đã thêm khách hàng ${d.customer.code} — ${d.customer.name}`, type: "success" });
      setName("");
      setPhone("");
      load(q);
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  async function showHistory(c: Customer) {
    setSelected(c);
    const r = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "history", customerId: c.id }),
    });
    if (r.ok) setHistory(await r.json());
  }

  async function adjustPoints() {
    if (!selected) return;
    const raw = window.prompt("Nhập số điểm muốn cộng (+) hoặc trừ (-):", "50");
    const points = Number(raw);
    if (!raw || !Number.isInteger(points) || points === 0) return;
    const r = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "adjust", customerId: selected.id, points }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Đã điều chỉnh điểm thành công! Số dư mới: ${d.points} điểm`, type: "success" });
      load(q);
      showHistory(selected);
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  async function birthdayReward() {
    if (!selected) return;
    const r = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "birthday_reward", customerId: selected.id }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Đã tặng quà sinh nhật +${d.granted} điểm thưởng!`, type: "success" });
      load(q);
      showHistory(selected);
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Header bar */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Khách Hàng &amp; Chương Trình Thành Viên (Loyalty)
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                <Sparkles className="w-3 h-3" />
                {customers.length} thành viên
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Quản lý hồ sơ hội viên, điểm thưởng tích luỹ, phân hạng thành viên và chăm sóc khách hàng
            </p>
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Search & Table & Add Customer (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Add customer card */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Thêm Khách Hàng Nhanh</h3>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Họ và tên khách..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="sm:w-44 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Số điện thoại..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <button
                  onClick={create}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors shrink-0"
                >
                  Thêm thành viên
                </button>
              </div>
            </div>

            {/* Customers table */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="Tìm theo tên, SĐT, mã hội viên..."
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      load(e.target.value);
                    }}
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                    <tr>
                      <th className="p-4">Mã TV</th>
                      <th className="p-4">Khách hàng</th>
                      <th className="p-4">Số điện thoại</th>
                      <th className="p-4">Hạng</th>
                      <th className="p-4 text-right">Điểm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customers.map((c) => {
                      const isSelected = selected?.id === c.id;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => showHistory(c)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? "bg-indigo-50/80" : "hover:bg-slate-50/60"
                          }`}
                        >
                          <td className="p-4 font-mono font-semibold text-slate-700">{c.code}</td>
                          <td className="p-4 font-bold text-slate-900">{c.name}</td>
                          <td className="p-4 text-slate-600 font-medium">{c.phone}</td>
                          <td className="p-4">
                            <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700">
                              <Crown className="w-3 h-3 text-amber-500" />
                              {c.loyalty?.tier ?? "Standard"}
                            </span>
                          </td>
                          <td className="p-4 text-right font-black text-indigo-700">
                            {c.loyalty?.points ?? 0} đ
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {customers.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Không tìm thấy khách hàng nào.
                </div>
              )}
            </div>
          </div>

          {/* Right: Digital Loyalty Card & Points Ledger (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-900 text-sm">Thẻ Hội Viên &amp; Lịch Sử Điểm</h3>

              {!selected || !history ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  Chọn một khách hàng ở danh sách bên trái để xem thẻ thành viên và lịch sử giao dịch điểm.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Digital VIP Member Card */}
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-tr from-slate-900 via-indigo-950 to-indigo-900 p-5 text-white shadow-lg shadow-indigo-950/20">
                    <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-indigo-500/20 rounded-full blur-xl" />
                    <div className="relative z-10 flex justify-between items-start mb-6">
                      <div>
                        <span className="text-[10px] font-semibold tracking-wider uppercase text-indigo-300">
                          Melio Member Card
                        </span>
                        <h4 className="text-lg font-bold text-white mt-0.5">{selected.name}</h4>
                        <p className="text-xs text-slate-400 font-mono">{selected.phone}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                        <Crown className="w-3 h-3" />
                        {history.tier ?? "Standard"}
                      </span>
                    </div>

                    <div className="relative z-10 flex justify-between items-end pt-2 border-t border-white/10">
                      <div>
                        <span className="text-[10px] text-slate-400">Mã thành viên</span>
                        <p className="text-xs font-mono font-bold text-slate-200">{selected.code}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-indigo-300">Điểm khả dụng</span>
                        <p className="text-2xl font-black text-amber-300">{history.points} <span className="text-xs font-normal">điểm</span></p>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={adjustPoints}
                      className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      ± Cộng / Trừ điểm
                    </button>
                    <button
                      onClick={birthdayReward}
                      className="flex-1 py-2 px-3 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Gift className="w-3.5 h-3.5" />
                      🎁 Quà sinh nhật (+100đ)
                    </button>
                  </div>

                  {/* Transaction Ledger Table */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <h5 className="font-bold text-slate-800 text-xs">Biến Động Điểm Gần Đây</h5>
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {history.transactions.map((t) => {
                        const isGain = t.points >= 0;
                        return (
                          <div
                            key={t.id}
                            className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-semibold text-slate-800 block">{t.type}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(t.createdAt).toLocaleString("vi-VN")}
                              </span>
                            </div>
                            <div className="text-right">
                              <span
                                className={`font-black ${
                                  isGain ? "text-emerald-600" : "text-rose-600"
                                }`}
                              >
                                {isGain ? "+" : ""}
                                {t.points} đ
                              </span>
                              <span className="block text-[10px] text-slate-500">
                                Dư: {t.balanceAfter}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {history.transactions.length === 0 && (
                        <p className="text-xs text-slate-400 py-4 text-center">
                          Chưa có lịch sử giao dịch điểm.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
