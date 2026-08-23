"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import {
  ArrowLeftRight,
  Plus,
  CheckCircle2,
  Clock,
  Truck,
  Boxes,
  PackageCheck,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from "lucide-react";

type Variant = { id: string; sku: string; product: { name: string } };
type Location = { id: string; name: string; type: string };
type Transfer = {
  id: string;
  number: string;
  status: string;
  fromLocation: { name: string } | null;
  toLocation: { name: string } | null;
  items: { variant: { sku: string } | null; quantity: number }[];
};

const NEXT: Record<string, string> = {
  REQUESTED: "APPROVED",
  APPROVED: "PICKING",
  PICKING: "IN_TRANSIT",
  IN_TRANSIT: "RECEIVED",
  RECEIVED: "COMPLETED",
};
const LABEL: Record<string, string> = {
  APPROVED: "Duyệt điều chuyển",
  PICKING: "Bắt đầu soạn hàng",
  IN_TRANSIT: "Xác nhận xuất kho",
  RECEIVED: "Xác nhận đã nhận",
  COMPLETED: "Hoàn tất điều chuyển",
};

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState(5);
  const [items, setItems] = useState<{ variantId: string; quantity: number }[]>([]);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function load() {
    const r = await fetch("/api/transfers");
    if (r.ok) setTransfers((await r.json()).transfers);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    fetch("/api/refs?kind=locations").then(async (r) => r.ok && setLocations((await r.json()).locations));
    fetch("/api/refs?kind=variants").then(async (r) => r.ok && setVariants((await r.json()).variants));
  }, []);

  async function post(body: object) {
    const r = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Cập nhật thành công: ${d.number} → ${d.status}`, type: "success" });
      load();
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  const getStatusStep = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3" /> Hoàn tất</span>;
      case "IN_TRANSIT":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"><Truck className="w-3 h-3" /> Đang vận chuyển</span>;
      case "PICKING":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"><Boxes className="w-3 h-3" /> Đang soạn hàng</span>;
      case "RECEIVED":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200"><PackageCheck className="w-3 h-3" /> Đã nhận hàng</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3 h-3" /> {status}</span>;
    }
  };

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Header bar */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Điều Chuyển Hàng Hoá Liên Kho
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                <Sparkles className="w-3 h-3" />
                {transfers.length} phiếu chuyển
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Quy trình điều phối sách giữa tổng kho và các chi nhánh bán lẻ: Yêu cầu → Phê duyệt → Soạn hàng → Xuất chuyển → Nhận kho
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
          {/* Left Form: Create Transfer (5 cols) */}
          <div className="lg:col-span-5 bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Tạo Phiếu Điều Chuyển</h2>
                <p className="text-[11px] text-slate-400">Chọn kho nguồn và kho đích</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kho xuất (Nguồn)</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                >
                  <option value="">— Chọn kho nguồn —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kho nhận (Đích)</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                >
                  <option value="">— Chọn kho tiếp nhận —</option>
                  {locations
                    .filter((l) => l.id !== fromId)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
                <label className="block text-xs font-semibold text-slate-700">Mặt hàng cần điều chuyển</label>
                <select
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                >
                  <option value="">— Chọn sản phẩm / SKU —</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.sku} · {v.product.name}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <div className="w-28">
                    <span className="block text-[10px] text-slate-500 mb-0.5">Số lượng</span>
                    <input
                      type="number"
                      min={1}
                      className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900"
                      value={qty}
                      onChange={(e) => setQty(Number(e.target.value))}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!variantId) return;
                      setItems((xs) => [...xs, { variantId, quantity: qty }]);
                    }}
                    className="self-end px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors"
                  >
                    Thêm vào phiếu
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-1.5 pt-1">
                {items.map((i, idx) => {
                  const v = variants.find((x) => x.id === i.variantId);
                  return (
                    <div key={idx} className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded-xl border border-slate-100">
                      <div>
                        <span className="font-semibold text-slate-900 font-mono">{v?.sku}</span>
                        <span className="text-[11px] text-slate-500 block truncate max-w-[200px]">{v?.product.name}</span>
                      </div>
                      <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                        ×{i.quantity} sp
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                disabled={!fromId || !toId || items.length === 0}
                onClick={() => {
                  post({ action: "create", fromLocationId: fromId, toLocationId: toId, items });
                  setItems([]);
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.01]"
              >
                Tạo Yêu Cầu Điều Chuyển
              </button>
            </div>
          </div>

          {/* Right Section: Transfer Pipeline List (7 cols) */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Danh Sách Phiếu Điều Chuyển Kho</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                  <tr>
                    <th className="p-4">Mã Phiếu</th>
                    <th className="p-4">Tuyến kho</th>
                    <th className="p-4">Mặt hàng chuyển</th>
                    <th className="p-4">Trạng thái</th>
                    <th className="p-4 text-right">Chuyển bước</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-4 font-bold text-indigo-700">{t.number}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 font-medium text-slate-800">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-semibold">{t.fromLocation?.name}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span className="bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded text-[11px] font-semibold border border-indigo-100">{t.toLocation?.name}</span>
                        </div>
                      </td>
                      <td className="p-4 space-y-1">
                        {t.items.map((i, k) => (
                          <div key={k} className="text-[11px] text-slate-700">
                            <span className="font-mono font-semibold">{i.variant?.sku}</span>: <b>{i.quantity}</b> sản phẩm
                          </div>
                        ))}
                      </td>
                      <td className="p-4">
                        {getStatusStep(t.status)}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        {NEXT[t.status] && (
                          <button
                            onClick={() => post({ action: "transition", transferId: t.id, to: NEXT[t.status] })}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors"
                          >
                            {LABEL[NEXT[t.status]] ?? NEXT[t.status]}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {transfers.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-xs">
                <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Chưa có phiếu điều chuyển kho nào.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
