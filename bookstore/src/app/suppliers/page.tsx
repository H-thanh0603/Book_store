"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import {
  Truck,
  Plus,
  Search,
  Edit2,
  Eye,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Building2,
  Phone,
  Mail,
} from "lucide-react";

type Supplier = {
  id: string;
  code: string;
  name: string;
  taxCode: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentTerms: string | null;
  leadTimeDays: number;
  active: boolean;
  isConsignment: boolean;
  productPrices: { id: string; unitCost: string; recordedAt: string; variant: { name: string; sku: string; product: { name: string } } }[];
  purchaseOrders: { id: string; number: string; status: string; createdAt: string }[];
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: "", taxCode: "", contactName: "", phone: "", email: "", address: "", paymentTerms: "", leadTimeDays: 7, isConsignment: false,
  });

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const r = await fetch(`/api/suppliers?${params}`);
      if (r.ok) setSuppliers((await r.json()).suppliers ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [q]);

  function openCreate() {
    setForm({ name: "", taxCode: "", contactName: "", phone: "", email: "", address: "", paymentTerms: "", leadTimeDays: 7, isConsignment: false });
    setEditSupplier(null);
    setShowForm(true);
  }

  function openEdit(s: Supplier) {
    setForm({
      name: s.name, taxCode: s.taxCode ?? "", contactName: s.contactName ?? "",
      phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "",
      paymentTerms: s.paymentTerms ?? "", leadTimeDays: s.leadTimeDays, isConsignment: s.isConsignment,
    });
    setEditSupplier(s);
    setShowForm(true);
  }

  async function saveSupplier() {
    const url = editSupplier ? `/api/suppliers/${editSupplier.id}` : "/api/suppliers";
    const method = editSupplier ? "PUT" : "POST";
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: editSupplier ? "Cập nhật thành công" : "Tạo nhà cung cấp thành công", type: "success" });
      setShowForm(false);
      void load();
    } else {
      setMsg({ text: d.message ?? "Lỗi", type: "error" });
    }
  }

  async function deactivateSupplier(id: string) {
    if (!window.confirm("Vô hiệu hóa nhà cung cấp này?")) return;
    const r = await fetch(`/api/suppliers/${id}`, {
      method: "DELETE",
      headers: { "x-csrf-check": "1" },
    });
    if (r.ok) {
      setMsg({ text: "Đã vô hiệu hóa", type: "success" });
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
                <Truck className="w-6 h-6 text-indigo-600" />
                Nhà Cung Cấp
              </h1>
              <p className="text-xs text-slate-500 mt-1">Quản lý thông tin nhà cung cấp và giá nhập</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs font-medium w-48"
                  placeholder="Tìm nhà cung cấp..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                <Plus className="w-3.5 h-3.5" />
                Thêm mới
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

        {/* Supplier Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {suppliers.map((s) => (
            <div key={s.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{s.name}</h3>
                  <p className="text-[10px] text-slate-500 font-mono">{s.code}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                    <Edit2 className="w-3 h-3" />
                  </button>
                  {s.active && (
                    <button onClick={() => deactivateSupplier(s.id)} className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600">
                      <XCircle className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                {s.contactName && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    {s.contactName}
                  </div>
                )}
                {s.phone && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="w-3 h-3 text-slate-400" />
                    {s.phone}
                  </div>
                )}
                {s.email && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="w-3 h-3 text-slate-400" />
                    {s.email}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {s.isConsignment && (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                    Ký gửi
                  </span>
                )}
                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                  lead {s.leadTimeDays} ngày
                </span>
                {s.paymentTerms && (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">
                    {s.paymentTerms}
                  </span>
                )}
              </div>

              {s.productPrices.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[10px] text-slate-500 font-semibold mb-1">Giá nhập gần nhất</p>
                  <div className="space-y-1">
                    {s.productPrices.slice(0, 3).map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-600 truncate">{p.variant.product.name}</span>
                        <span className="font-bold text-indigo-700">{Number(p.unitCost).toLocaleString("vi-VN")} ₫</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {suppliers.length === 0 && !loading && (
          <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center text-slate-400 text-xs">
            <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Chưa có nhà cung cấp nào
          </div>
        )}

        {/* Create/Edit Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <h3 className="font-bold text-slate-900">{editSupplier ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp mới"}</h3>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><XCircle className="w-5 h-5" /></button>
              </div>
              <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tên nhà cung cấp *</label>
                  <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Mã số thuế</label>
                    <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.taxCode} onChange={(e) => setForm({ ...form, taxCode: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Người liên hệ</label>
                    <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">SĐT</label>
                    <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                    <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Địa chỉ</label>
                  <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Điều khoản TT</label>
                    <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" placeholder="VD: NET30" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Lead time (ngày)</label>
                    <input type="number" min={0} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: Number(e.target.value) || 0 })} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input type="checkbox" checked={form.isConsignment} onChange={(e) => setForm({ ...form, isConsignment: e.target.checked })} className="rounded border-slate-300" />
                  Ký gửi
                </label>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Hủy</button>
                <button onClick={saveSupplier} disabled={!form.name.trim()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold">
                  {editSupplier ? "Cập nhật" : "Tạo mới"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
