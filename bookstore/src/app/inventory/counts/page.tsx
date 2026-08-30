"use client";
import { useEffect, useState } from "react";
import Nav from "../../nav";
import {
  ClipboardCheck,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
} from "lucide-react";

type CountItem = {
  id: string;
  variantId: string;
  expectedQty: number;
  countedQty: number;
  variant: {
    name: string;
    sku: string;
    product: { name: string };
    barcodes: { barcode: string }[];
  };
};

type Count = {
  id: string;
  number: string;
  status: string;
  location: { id: string; name: string };
  countedBy: string;
  createdAt: string;
  postedAt: string | null;
  items: CountItem[];
};

type Location = { id: string; name: string };

export default function InventoryCountPage() {
  const [counts, setCounts] = useState<Count[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [viewCount, setViewCount] = useState<Count | null>(null);
  const [editingItems, setEditingItems] = useState<Map<string, number>>(new Map());
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  // loading value unused in JSX; keep the setter for the fetch guard
  const [, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [countsRes, locsRes] = await Promise.all([
        fetch("/api/inventory/counts"),
        fetch("/api/stock-locations"),
      ]);
      if (countsRes.ok) setCounts((await countsRes.ok ? await countsRes.json() : { counts: [] }).counts ?? []);
      if (locsRes.ok) setLocations((await locsRes.json()).locations ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createCount() {
    if (!selectedLocation) return;
    const r = await fetch("/api/inventory/counts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify({ locationId: selectedLocation }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Tạo kiểm kê ${d.count.number} thành công`, type: "success" });
      void load();
    } else {
      setMsg({ text: d.message ?? "Lỗi tạo kiểm kê", type: "error" });
    }
  }

  async function viewCountDetail(count: Count) {
    const r = await fetch(`/api/inventory/counts/${count.id}`);
    if (r.ok) {
      const d = await r.json();
      setViewCount(d.count);
      setEditingItems(new Map());
    }
  }

  function updateItemCounted(itemId: string, qty: number) {
    setEditingItems((prev) => {
      const next = new Map(prev);
      next.set(itemId, qty);
      return next;
    });
  }

  async function saveCountItems() {
    if (!viewCount) return;
    const items = Array.from(editingItems.entries()).map(([id, countedQty]) => ({ id, countedQty }));
    if (items.length === 0) return;

    const r = await fetch(`/api/inventory/counts/${viewCount.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify({ action: "update_items", items }),
    });
    if (r.ok) {
      setMsg({ text: "Đã lưu kết quả đếm", type: "success" });
      void viewCountDetail(viewCount);
    } else {
      setMsg({ text: "Lỗi lưu", type: "error" });
    }
  }

  async function postCount() {
    if (!viewCount) return;
    if (!window.confirm("Xác nhận đăng kiểm kê? Hệ thống sẽ tự động điều chỉnh tồn kho.")) return;
    const r = await fetch(`/api/inventory/counts/${viewCount.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify({ action: "post" }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Đăng thành công! ${d.adjustments} mặt hàng cần điều chỉnh`, type: "success" });
      setViewCount(null);
      void load();
    } else {
      setMsg({ text: d.message ?? "Lỗi đăng", type: "error" });
    }
  }

  async function cancelCount(id: string) {
    if (!window.confirm("Hủy phiếu kiểm kê này?")) return;
    const r = await fetch(`/api/inventory/counts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (r.ok) {
      setMsg({ text: "Đã hủy", type: "success" });
      setViewCount(null);
      void load();
    }
  }

  const draftCounts = counts.filter((c) => c.status === "DRAFT");
  const postedCounts = counts.filter((c) => c.status === "POSTED");

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <ClipboardCheck className="w-6 h-6 text-indigo-600" />
                Kiểm Kê Kho
              </h1>
              <p className="text-xs text-slate-500 mt-1">Đếm thực tế, so sánh với hệ thống, tự động điều chỉnh</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">Chọn vị trí...</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <button
                onClick={createCount}
                disabled={!selectedLocation}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-white/50 text-white shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Tạo phiếu mới
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Draft Counts */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Phiếu chờ đếm ({draftCounts.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {draftCounts.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">Không có phiếu chờ</div>
              ) : (
                draftCounts.map((c) => {
                  const counted = c.items.filter((i) => i.countedQty > 0).length;
                  return (
                    <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/60">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{c.number}</p>
                        <p className="text-[10px] text-slate-500">{c.location.name} · {counted}/{c.items.length} đã đếm</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => viewCountDetail(c)} className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => cancelCount(c.id)} className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors">
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Posted Counts */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Phiếu đã đăng ({postedCounts.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {postedCounts.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">Chưa có phiếu đã đăng</div>
              ) : (
                postedCounts.map((c) => {
                  const adjustments = c.items.filter((i) => i.countedQty !== i.expectedQty).length;
                  return (
                    <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/60">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{c.number}</p>
                        <p className="text-[10px] text-slate-500">{c.location.name} · {adjustments} điều chỉnh · {c.postedAt ? new Date(c.postedAt).toLocaleString("vi-VN") : ""}</p>
                      </div>
                      <button onClick={() => viewCountDetail(c)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Count Detail Modal */}
        {viewCount && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <div>
                  <h3 className="font-bold text-slate-900">{viewCount.number}</h3>
                  <p className="text-xs text-slate-500">{viewCount.location.name} · {viewCount.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  {viewCount.status === "DRAFT" && (
                    <>
                      <button onClick={saveCountItems} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">
                        Lưu kết quả
                      </button>
                      <button onClick={postCount} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">
                        Đăng (điều chỉnh kho)
                      </button>
                    </>
                  )}
                  <button onClick={() => setViewCount(null)} className="text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="overflow-auto max-h-[70vh]">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left font-semibold text-slate-600">Sản phẩm</th>
                      <th className="p-3 text-left font-semibold text-slate-600">SKU</th>
                      <th className="p-3 text-center font-semibold text-slate-600">Hệ thống</th>
                      <th className="p-3 text-center font-semibold text-slate-600">Đếm</th>
                      <th className="p-3 text-center font-semibold text-slate-600">Chênh lệch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewCount.items.map((item) => {
                      const counted = editingItems.get(item.id) ?? item.countedQty;
                      const diff = counted - item.expectedQty;
                      return (
                        <tr key={item.id} className={diff !== 0 ? "bg-amber-50/50" : ""}>
                          <td className="p-3 font-medium text-slate-900">{item.variant.product.name}</td>
                          <td className="p-3 font-mono text-slate-600">{item.variant.sku}</td>
                          <td className="p-3 text-center font-bold text-slate-900">{item.expectedQty}</td>
                          <td className="p-3 text-center">
                            {viewCount.status === "DRAFT" ? (
                              <input
                                type="number"
                                min={0}
                                value={counted}
                                onChange={(e) => updateItemCounted(item.id, Number(e.target.value))}
                                className="w-20 text-center border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                              />
                            ) : (
                              <span className="font-bold">{counted}</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {diff !== 0 ? (
                              <span className={`inline-flex items-center gap-0.5 font-bold ${diff > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {diff > 0 ? "+" : ""}{diff}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
