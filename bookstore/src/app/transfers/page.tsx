"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import {
  ArrowLeftRight,
  Plus,
  Eye,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Truck,
  Package,
} from "lucide-react";

type TransferItem = {
  id: string;
  variantId: string;
  quantity: number;
  receivedQty: number;
  variant: {
    name: string;
    sku: string;
    product: { name: string };
    barcodes: { barcode: string }[];
  };
};

type Transfer = {
  id: string;
  number: string;
  status: string;
  fromLocation: { id: string; name: string };
  toLocation: { id: string; name: string };
  requestedBy: string;
  approvedBy: string | null;
  createdAt: string;
  items: TransferItem[];
};

type Location = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  variants: { id: string; sku: string; name: string }[];
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Nháp", color: "bg-slate-100 text-slate-700" },
  REQUESTED: { label: "Chờ duyệt", color: "bg-blue-50 text-blue-700" },
  APPROVED: { label: "Đã duyệt", color: "bg-indigo-50 text-indigo-700" },
  PICKING: { label: "Đang lấy hàng", color: "bg-amber-50 text-amber-700" },
  IN_TRANSIT: { label: "Đang vận chuyển", color: "bg-purple-50 text-purple-700" },
  RECEIVED: { label: "Đã nhận", color: "bg-emerald-50 text-emerald-700" },
  COMPLETED: { label: "Hoàn thành", color: "bg-emerald-100 text-emerald-800" },
  CANCELLED: { label: "Đã hủy", color: "bg-red-50 text-red-700" },
};

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [viewTransfer, setViewTransfer] = useState<Transfer | null>(null);

  // Create form state
  const [fromLoc, setFromLoc] = useState("");
  const [toLoc, setToLoc] = useState("");
  const [trfItems, setTrfItems] = useState<{ variantId: string; quantity: number }[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [trfRes, locRes, prodRes] = await Promise.all([
        fetch("/api/transfers"),
        fetch("/api/stock-locations"),
        fetch("/api/products?limit=500"),
      ]);
      if (trfRes.ok) setTransfers((await trfRes.json()).transfers ?? []);
      if (locRes.ok) setLocations((await locRes.json()).locations ?? []);
      if (prodRes.ok) setProducts((await prodRes.json()).products ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createTransfer() {
    if (!fromLoc || !toLoc || trfItems.length === 0) return;
    const r = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify({ fromLocationId: fromLoc, toLocationId: toLoc, items: trfItems }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Tạo phiếu chuyển ${d.transfer.number} thành công`, type: "success" });
      setShowCreate(false);
      setTrfItems([]);
      void load();
    } else {
      setMsg({ text: d.message ?? "Lỗi", type: "error" });
    }
  }

  async function updateTransfer(id: string, action: string, items?: { id: string; receivedQty: number }[]) {
    const r = await fetch(`/api/transfers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify({ action, items }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: d.message, type: "success" });
      setViewTransfer(null);
      void load();
    } else {
      setMsg({ text: d.message ?? "Lỗi", type: "error" });
    }
  }

  function addItem() {
    setTrfItems((prev) => [...prev, { variantId: "", quantity: 1 }]);
  }

  function removeItem(idx: number) {
    setTrfItems((prev) => prev.filter((_, i) => i !== idx));
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
                <ArrowLeftRight className="w-6 h-6 text-indigo-600" />
                Điều Chuyển Kho
              </h1>
              <p className="text-xs text-slate-500 mt-1">Tạo và theo dõi phiếu chuyển hàng giữa các cửa hàng</p>
            </div>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Tạo phiếu mới
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

        {/* Create Form */}
        {showCreate && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md space-y-4">
            <h2 className="font-bold text-slate-900">Tạo phiếu điều chuyển</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Từ vị trí</label>
                <select value={fromLoc} onChange={(e) => setFromLoc(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium">
                  <option value="">Chọn...</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Đến vị trí</label>
                <select value={toLoc} onChange={(e) => setToLoc(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium">
                  <option value="">Chọn...</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Sản phẩm ({trfItems.length})</span>
                <button onClick={addItem} className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold">+ Thêm</button>
              </div>
              {trfItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={item.variantId}
                    onChange={(e) => {
                      const next = [...trfItems];
                      next[idx].variantId = e.target.value;
                      setTrfItems(next);
                    }}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium"
                  >
                    <option value="">Chọn sản phẩm...</option>
                    {products.flatMap((p) => p.variants.map((v) => (
                      <option key={v.id} value={v.id}>{p.name} ({v.sku})</option>
                    )))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => {
                      const next = [...trfItems];
                      next[idx].quantity = Number(e.target.value) || 1;
                      setTrfItems(next);
                    }}
                    className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-center font-medium"
                  />
                  <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Hủy</button>
              <button onClick={createTransfer} disabled={!fromLoc || !toLoc || trfItems.length === 0} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-white/50 text-white text-xs font-semibold">Tạo phiếu</button>
            </div>
          </div>
        )}

        {/* Transfer List */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                <tr>
                  <th className="p-4">Mã phiếu</th>
                  <th className="p-4">Từ</th>
                  <th className="p-4">Đến</th>
                  <th className="p-4">Trạng thái</th>
                  <th className="p-4">Sản phẩm</th>
                  <th className="p-4">Ngày tạo</th>
                  <th className="p-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((t) => {
                  const st = STATUS_LABELS[t.status] ?? { label: t.status, color: "bg-slate-100 text-slate-700" };
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/60">
                      <td className="p-4 font-bold text-slate-900">{t.number}</td>
                      <td className="p-4 text-slate-600">{t.fromLocation.name}</td>
                      <td className="p-4 text-slate-600">{t.toLocation.name}</td>
                      <td className="p-4"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.color}`}>{st.label}</span></td>
                      <td className="p-4 text-slate-600">{t.items.length} mặt hàng</td>
                      <td className="p-4 text-slate-500">{new Date(t.createdAt).toLocaleDateString("vi-VN")}</td>
                      <td className="p-4 text-right">
                        <button onClick={() => setViewTransfer(t)} className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {transfers.length === 0 && !loading && (
            <div className="py-12 text-center text-slate-400 text-xs">
              <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Chưa có phiếu điều chuyển
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {viewTransfer && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <div>
                  <h3 className="font-bold text-slate-900">{viewTransfer.number}</h3>
                  <p className="text-xs text-slate-500">{viewTransfer.fromLocation.name} → {viewTransfer.toLocation.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  {viewTransfer.status === "REQUESTED" && (
                    <button onClick={() => updateTransfer(viewTransfer.id, "approve")} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">Duyệt</button>
                  )}
                  {viewTransfer.status === "APPROVED" && (
                    <button onClick={() => updateTransfer(viewTransfer.id, "ship")} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1">
                      <Truck className="w-3 h-3" /> Gửi hàng
                    </button>
                  )}
                  {viewTransfer.status === "IN_TRANSIT" && (
                    <button onClick={() => updateTransfer(viewTransfer.id, "receive", viewTransfer.items.map((i) => ({ id: i.id, receivedQty: i.quantity })))} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1">
                      <Package className="w-3 h-3" /> Xác nhận nhận
                    </button>
                  )}
                  {viewTransfer.status === "RECEIVED" && (
                    <button onClick={() => updateTransfer(viewTransfer.id, "complete")} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold">Hoàn thành</button>
                  )}
                  {!["COMPLETED", "CANCELLED", "RECEIVED"].includes(viewTransfer.status) && (
                    <button onClick={() => updateTransfer(viewTransfer.id, "cancel")} className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold">Hủy</button>
                  )}
                  <button onClick={() => setViewTransfer(null)} className="text-slate-400 hover:text-slate-600"><XCircle className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="overflow-auto max-h-[60vh] p-4">
                <table className="w-full text-xs">
                  <thead className="border-b border-slate-200">
                    <tr>
                      <th className="p-2 text-left font-semibold text-slate-600">Sản phẩm</th>
                      <th className="p-2 text-left font-semibold text-slate-600">SKU</th>
                      <th className="p-2 text-center font-semibold text-slate-600">Số lượng</th>
                      <th className="p-2 text-center font-semibold text-slate-600">Đã nhận</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewTransfer.items.map((item) => (
                      <tr key={item.id}>
                        <td className="p-2 font-medium text-slate-900">{item.variant.product.name}</td>
                        <td className="p-2 font-mono text-slate-600">{item.variant.sku}</td>
                        <td className="p-2 text-center font-bold">{item.quantity}</td>
                        <td className="p-2 text-center">{item.receivedQty || "—"}</td>
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
