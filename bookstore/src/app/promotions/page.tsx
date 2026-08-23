"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import {
  Tag,
  Plus,
  Percent,
  DollarSign,
  Gift,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";

type Promo = {
  id: string;
  name: string;
  code: string | null;
  type: string;
  value: number;
  buyQty: number | null;
  getQty: number | null;
  minQty: number;
  channel: string;
  stackable: boolean;
  usageLimit: number | null;
  usedCount: number;
  memberOnly: boolean;
  priority: number;
  active: boolean;
  category: { name: string } | null;
};

export default function PromotionsPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    type: "percentage",
    value: 10,
    minQty: 0,
    buyQty: 1,
    getQty: 1,
    categoryId: "",
    channel: "ALL",
    stackable: false,
    usageLimit: "",
    memberOnly: false,
    priority: 0,
    endAt: "",
  });

  async function load() {
    const r = await fetch("/api/promotions");
    if (r.ok) setPromos((await r.json()).promotions);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    fetch("/api/refs?kind=categories").then(async (r) => {
      if (r.ok) setCategories((await r.json()).categories);
    });
  }, []);

  async function create() {
    if (!form.name.trim()) {
      setMsg({ text: "Vui lòng nhập tên chương trình khuyến mãi", type: "error" });
      return;
    }
    const r = await fetch("/api/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        code: form.code || undefined,
        categoryId: form.categoryId || undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        endAt: form.endAt || undefined,
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: "Tạo chương trình khuyến mãi thành công!", type: "success" });
      setForm({
        name: "",
        code: "",
        type: "percentage",
        value: 10,
        minQty: 0,
        buyQty: 1,
        getQty: 1,
        categoryId: "",
        channel: "ALL",
        stackable: false,
        usageLimit: "",
        memberOnly: false,
        priority: 0,
        endAt: "",
      });
      load();
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  async function toggle(p: Promo) {
    const r = await fetch("/api/promotions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    if (r.ok) load();
    else setMsg({ text: (await r.json()).message, type: "error" });
  }

  function describe(p: Promo): string {
    if (p.type === "percentage") return `Giảm ${p.value}%`;
    if (p.type === "fixed") return `Giảm ${p.value.toLocaleString("vi-VN")} ₫`;
    return `Mua ${p.buyQty} tặng ${p.getQty}`;
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
                Khuyến Mãi &amp; Mã Giảm Giá (Promotions &amp; Coupons)
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                <Sparkles className="w-3 h-3" />
                {promos.length} quy tắc khuyến mãi
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Thiết lập chính sách giảm giá theo %, trừ tiền trực tiếp, combo Mua X tặng Y và phân bổ kênh POS / Web
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
          {/* Left Form: Create Promo (5 cols) */}
          <div className="lg:col-span-5 bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Tạo Khuyến Mãi Mới</h2>
                <p className="text-[11px] text-slate-400">Quy tắc chiết khấu và điều kiện áp dụng</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tên chương trình khuyến mãi</label>
                <input
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="VD: Hội sách mùa thu giảm 15%..."
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mã Coupon (Bỏ trống nếu áp dụng tự động)</label>
                <input
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono uppercase placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="VD: MELIO10, BOOKFEST..."
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Hình thức giảm giá</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: "percentage", label: "Giảm %", icon: Percent },
                    { id: "fixed", label: "Giảm tiền ₫", icon: DollarSign },
                    { id: "buy_x_get_y", label: "Mua X tặng Y", icon: Gift },
                  ].map((t) => {
                    const Icon = t.icon;
                    const active = form.type === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setForm({ ...form, type: t.id })}
                        className={`p-2 rounded-xl text-center text-[11px] font-semibold border flex flex-col items-center gap-1 transition-all ${
                          active
                            ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <div className="flex gap-2">
                  {form.type === "buy_x_get_y" ? (
                    <>
                      <div className="flex-1">
                        <span className="block text-[10px] text-slate-500 mb-0.5">Mua số lượng (X)</span>
                        <input
                          type="number"
                          min={1}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900"
                          value={form.buyQty ?? 1}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              buyQty: Number(e.target.value),
                              minQty: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="flex-1">
                        <span className="block text-[10px] text-slate-500 mb-0.5">Tặng số lượng (Y)</span>
                        <input
                          type="number"
                          min={1}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900"
                          value={form.getQty ?? 1}
                          onChange={(e) => setForm({ ...form, getQty: Number(e.target.value) })}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex-1">
                      <span className="block text-[10px] text-slate-500 mb-0.5">
                        {form.type === "percentage" ? "Mức giảm (%)" : "Số tiền giảm (₫)"}
                      </span>
                      <input
                        type="number"
                        min={0}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900"
                        value={form.value}
                        onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                      />
                    </div>
                  )}
                  <div className="w-28">
                    <span className="block text-[10px] text-slate-500 mb-0.5">SL tối thiểu</span>
                    <input
                      type="number"
                      min={0}
                      className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900"
                      value={form.minQty}
                      onChange={(e) => setForm({ ...form, minQty: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ngành hàng áp dụng</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                >
                  <option value="">Tất cả ngành hàng (Toàn bộ)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kênh bán hàng</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={form.channel}
                    onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  >
                    <option value="ALL">Tất cả kênh</option>
                    <option value="POS">Chỉ quầy POS</option>
                    <option value="WEB">Chỉ Web online</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Độ ưu tiên</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ngày hết hạn</label>
                  <input
                    type="datetime-local"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={form.endAt}
                    onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Giới hạn lượt dùng</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Không giới hạn"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={form.usageLimit}
                    onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.stackable}
                    onChange={(e) => setForm({ ...form, stackable: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  Cộng dồn khuyến mãi
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.memberOnly}
                    onChange={(e) => setForm({ ...form, memberOnly: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  Chỉ cho thành viên
                </label>
              </div>

              <button
                onClick={create}
                disabled={!form.name.trim()}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.01]"
              >
                Tạo Chương Trình Khuyến Mãi
              </button>
            </div>
          </div>

          {/* Right Section: Promo List (7 cols) */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Danh Sách Chương Trình Đang Thiết Lập</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                  <tr>
                    <th className="p-4">Tên &amp; Mã Coupon</th>
                    <th className="p-4">Quy tắc giảm</th>
                    <th className="p-4">Kênh</th>
                    <th className="p-4">Lượt dùng</th>
                    <th className="p-4">Trạng thái</th>
                    <th className="p-4 text-right">Bật / Tắt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {promos.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-4">
                        <p className="font-bold text-slate-900">{p.name}</p>
                        {p.code ? (
                          <span className="inline-block mt-0.5 font-mono text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">
                            {p.code}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Tự động áp dụng</span>
                        )}
                        {p.category && (
                          <span className="block text-[10px] text-indigo-600 mt-0.5">
                            Ngành: {p.category.name}
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-semibold text-slate-800">
                        {describe(p)}
                        {p.minQty > 0 && p.type !== "buy_x_get_y" && (
                          <span className="block text-[10px] text-slate-400">
                            (từ {p.minQty} món)
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {p.channel}
                        </span>
                      </td>
                      <td className="p-4 font-mono font-medium text-slate-700">
                        {p.usedCount}
                        {p.usageLimit != null ? ` / ${p.usageLimit}` : ""}
                      </td>
                      <td className="p-4">
                        {p.active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Đang chạy
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
                            Đã tắt
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => toggle(p)}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                            p.active
                              ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                              : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                          }`}
                        >
                          {p.active ? "Tắt" : "Kích hoạt"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {promos.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-xs">
                <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Chưa có chương trình khuyến mãi nào.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
