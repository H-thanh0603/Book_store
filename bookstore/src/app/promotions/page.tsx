"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import {
  Tag,
  Plus,
  Edit2,
  Eye,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Percent,
  DollarSign,
  Gift,
} from "lucide-react";

type Promotion = {
  id: string;
  name: string;
  code: string | null;
  type: string;
  value: string;
  buyQty: number | null;
  getQty: number | null;
  categoryId: string | null;
  category: { name: string } | null;
  minQty: number;
  channel: string;
  stackable: boolean;
  usageLimit: number | null;
  usedCount: number;
  memberOnly: boolean;
  priority: number;
  active: boolean;
  startAt: string;
  endAt: string | null;
  stores: { store: { name: string } }[];
};

type Category = { id: string; name: string };
type Store = { id: string; name: string };

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editPromo, setEditPromo] = useState<Promotion | null>(null);

  const [form, setForm] = useState({
    name: "", code: "", type: "percentage", value: 10, buyQty: 2, getQty: 1,
    categoryId: "", minQty: 0, channel: "ALL", stackable: false,
    usageLimit: 0, memberOnly: false, priority: 0, startAt: "", endAt: "",
    storeIds: [] as string[],
  });

  async function load() {
    setLoading(true);
    try {
      const [promoRes, catRes, storeRes] = await Promise.all([
        fetch("/api/promotions?active=false"),
        fetch("/api/categories"),
        fetch("/api/stores"),
      ]);
      if (promoRes.ok) setPromotions((await promoRes.json()).promotions ?? []);
      if (catRes.ok) setCategories((await catRes.json()).categories ?? []);
      if (storeRes.ok) setStores((await storeRes.json()).stores ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function openCreate() {
    setForm({
      name: "", code: "", type: "percentage", value: 10, buyQty: 2, getQty: 1,
      categoryId: "", minQty: 0, channel: "ALL", stackable: false,
      usageLimit: 0, memberOnly: false, priority: 0, startAt: "", endAt: "",
      storeIds: [],
    });
    setEditPromo(null);
    setShowForm(true);
  }

  function openEdit(p: Promotion) {
    setForm({
      name: p.name, code: p.code ?? "", type: p.type,
      value: Number(p.value), buyQty: p.buyQty ?? 2, getQty: p.getQty ?? 1,
      categoryId: p.categoryId ?? "", minQty: p.minQty, channel: p.channel,
      stackable: p.stackable, usageLimit: p.usageLimit ?? 0,
      memberOnly: p.memberOnly, priority: p.priority,
      startAt: p.startAt.split("T")[0], endAt: p.endAt?.split("T")[0] ?? "",
      storeIds: p.stores.map((s) => s.store.name),
    });
    setEditPromo(p);
    setShowForm(true);
  }

  async function savePromo() {
    const url = editPromo ? `/api/promotions/${editPromo.id}` : "/api/promotions";
    const method = editPromo ? "PUT" : "POST";
    const body = { ...form, value: Number(form.value) };
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: editPromo ? "Cập nhật thành công" : "Tạo khuyến mãi thành công", type: "success" });
      setShowForm(false);
      void load();
    } else {
      setMsg({ text: d.message ?? "Lỗi", type: "error" });
    }
  }

  async function deactivatePromo(id: string) {
    if (!window.confirm("Tắt khuyến mãi này?")) return;
    const r = await fetch(`/api/promotions/${id}`, {
      method: "DELETE",
      headers: { "x-csrf-check": "1" },
    });
    if (r.ok) {
      setMsg({ text: "Đã tắt", type: "success" });
      void load();
    }
  }

  function formatValue(type: string, value: string) {
    if (type === "percentage") return `${value}%`;
    if (type === "fixed") return `${Number(value).toLocaleString("vi-VN")} ₫`;
    return "BOGO";
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
                <Tag className="w-6 h-6 text-indigo-600" />
                Khuyến Mãi
              </h1>
              <p className="text-xs text-slate-500 mt-1">Quản lý mã giảm giá, chương trình khuyến mãi</p>
            </div>
            <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
              <Plus className="w-3.5 h-3.5" />
              Thêm mới
            </button>
          </div>
        </div>

        {msg && (
          <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-medium ${msg.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
            {msg.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {msg.text}
            <button onClick={() => setMsg(null)} className="ml-auto"><XCircle className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Promo List */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                <tr>
                  <th className="p-4">Tên</th>
                  <th className="p-4">Mã code</th>
                  <th className="p-4">Loại</th>
                  <th className="p-4">Giá trị</th>
                  <th className="p-4">Kênh</th>
                  <th className="p-4">Sử dụng</th>
                  <th className="p-4">Trạng thái</th>
                  <th className="p-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {promotions.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="p-4">
                      <p className="font-bold text-slate-900">{p.name}</p>
                      {p.category && <p className="text-[10px] text-slate-500">{p.category.name}</p>}
                    </td>
                    <td className="p-4 font-mono text-indigo-700 font-bold">{p.code || "—"}</td>
                    <td className="p-4">
                      <span className="inline-flex items-center gap-1">
                        {p.type === "percentage" && <Percent className="w-3 h-3 text-blue-600" />}
                        {p.type === "fixed" && <DollarSign className="w-3 h-3 text-emerald-600" />}
                        {p.type === "buy_x_get_y" && <Gift className="w-3 h-3 text-purple-600" />}
                        {p.type === "buy_x_get_y" ? `Mua ${p.buyQty} tặng ${p.getQty}` : p.type}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-900">{formatValue(p.type, p.value)}</td>
                    <td className="p-4"><span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">{p.channel}</span></td>
                    <td className="p-4 text-slate-600">{p.usedCount}{p.usageLimit ? `/${p.usageLimit}` : ""}</td>
                    <td className="p-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {p.active ? "Hoạt động" : "Tắt"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                          <Edit2 className="w-3 h-3" />
                        </button>
                        {p.active && (
                          <button onClick={() => deactivatePromo(p.id)} className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600">
                            <XCircle className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {promotions.length === 0 && !loading && (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Chưa có khuyến mãi nào
            </div>
          )}
        </div>

        {/* Create/Edit Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <h3 className="font-bold text-slate-900">{editPromo ? "Sửa khuyến mãi" : "Tạo khuyến mãi mới"}</h3>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><XCircle className="w-5 h-5" /></button>
              </div>
              <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tên khuyến mãi *</label>
                  <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Mã code (để trống = tự động)</label>
                    <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Loại</label>
                    <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                      <option value="percentage">% Giảm giá</option>
                      <option value="fixed">Số tiền cố định</option>
                      <option value="buy_x_get_y">Mua X tặng Y</option>
                    </select>
                  </div>
                </div>
                {form.type === "buy_x_get_y" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Mua (SL)</label>
                      <input type="number" min={1} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.buyQty} onChange={(e) => setForm({ ...form, buyQty: Number(e.target.value) || 1 })} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Tặng (SL)</label>
                      <input type="number" min={1} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.getQty} onChange={(e) => setForm({ ...form, getQty: Number(e.target.value) || 1 })} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Giá trị {form.type === "percentage" ? "(%)" : "(₫)"}</label>
                    <input type="number" min={0} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) || 0 })} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Danh mục</label>
                    <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                      <option value="">Tất cả</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Kênh</label>
                    <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                      <option value="ALL">Tất cả</option>
                      <option value="POS">POS</option>
                      <option value="WEB">Web</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">SL tối thiểu</label>
                    <input type="number" min={0} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.minQty} onChange={(e) => setForm({ ...form, minQty: Number(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Giới hạn sử dụng</label>
                    <input type="number" min={0} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: Number(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Ngày bắt đầu</label>
                    <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Ngày kết thúc</label>
                    <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <input type="checkbox" checked={form.stackable} onChange={(e) => setForm({ ...form, stackable: e.target.checked })} className="rounded border-slate-300" />
                    Gộp được
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <input type="checkbox" checked={form.memberOnly} onChange={(e) => setForm({ ...form, memberOnly: e.target.checked })} className="rounded border-slate-300" />
                    Chỉ thành viên
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Hủy</button>
                <button onClick={savePromo} disabled={!form.name.trim()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold">
                  {editPromo ? "Cập nhật" : "Tạo mới"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
