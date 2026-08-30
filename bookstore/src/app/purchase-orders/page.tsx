"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import {
  Truck,
  Plus,
  CheckCircle2,
  Clock,
  Boxes,
  AlertCircle,
  Sparkles,
} from "lucide-react";

type Variant = { id: string; sku: string; product: { name: string } };
type PO = {
  id: string;
  number: string;
  status: string;
  supplier: { name: string } | null;
  items: {
    variant: { id: string; sku: string; product?: { name: string } } | null;
    quantity: number;
    unitCost: string;
    receivedQty: number;
  }[];
};

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState(10);
  const [cost, setCost] = useState(50000);
  const [items, setItems] = useState<{ variantId: string; quantity: number; unitCost: number }[]>([]);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function load() {
    const r = await fetch("/api/purchase-orders");
    if (r.ok) setPos((await r.json()).purchaseOrders);
  }

  useEffect(() => {
    load();
    fetch("/api/refs?kind=suppliers").then(async (r) => r.ok && setSuppliers((await r.json()).suppliers));
    fetch("/api/refs?kind=warehouses").then(async (r) => r.ok && setWarehouses((await r.json()).warehouses));
    fetch("/api/refs?kind=variants").then(async (r) => r.ok && setVariants((await r.json()).variants));
  }, []);

  async function post(body: object) {
    const r = await fetch("/api/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Thao tác thành công: ${d.number ?? ""} (${d.status ?? ""})`, type: "success" });
      load();
    } else {
      setMsg({ text: d.message, type: "error" });
    }
  }

  const vnd = (n: number) => n.toLocaleString("vi-VN") + " ₫";

  const getPoStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3" /> Đã nhận đủ</span>;
      case "approved":
      case "sent":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"><Truck className="w-3 h-3" /> Đã duyệt / Chờ giao</span>;
      case "partially_received":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"><Boxes className="w-3 h-3" /> Nhận một phần</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3 h-3" /> Chờ phê duyệt</span>;
    }
  };

  const currentPoTotal = items.reduce((s, i) => s + i.unitCost * i.quantity, 0);

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Header Bar */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Nhập Hàng Nhà Cung Cấp (Purchase Orders)
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                <Sparkles className="w-3 h-3" />
                {pos.length} đơn PO
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Quy trình tạo đơn đặt hàng NCC, kiểm duyệt giá vốn và nhập kho hàng loạt
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
          {/* Left Form: Create PO (4 cols) */}
          <div className="lg:col-span-5 bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Lập Đơn Đặt Hàng (PO) Mới</h2>
                <p className="text-[11px] text-slate-400">Chọn NCC và kho tiếp nhận</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nhà cung cấp (NCC)</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">— Chọn nhà cung cấp —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kho nhận hàng</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  <option value="">— Chọn kho tiếp nhận —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
                <label className="block text-xs font-semibold text-slate-700">Thêm mặt hàng vào PO</label>
                <select
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                >
                  <option value="">— Chọn sách / sản phẩm —</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.sku} · {v.product.name}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <div className="w-24">
                    <span className="block text-[10px] text-slate-500 mb-0.5">Số lượng</span>
                    <input
                      type="number"
                      min={1}
                      className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900"
                      value={qty}
                      onChange={(e) => setQty(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex-1">
                    <span className="block text-[10px] text-slate-500 mb-0.5">Đơn giá nhập (₫)</span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900"
                      value={cost}
                      onChange={(e) => setCost(Number(e.target.value))}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!variantId) return;
                      setItems((xs) => [...xs, { variantId, quantity: qty, unitCost: cost }]);
                    }}
                    className="self-end px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors"
                  >
                    Thêm
                  </button>
                </div>
              </div>

              {/* Added PO items list */}
              <div className="space-y-1.5 pt-1">
                {items.map((i, idx) => {
                  const v = variants.find((x) => x.id === i.variantId);
                  return (
                    <div key={idx} className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded-xl border border-slate-100">
                      <div>
                        <span className="font-semibold text-slate-900 font-mono">{v?.sku}</span>
                        <span className="text-[11px] text-slate-500 block truncate max-w-[180px]">{v?.product.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900">{vnd(i.unitCost * i.quantity)}</span>
                        <span className="block text-[10px] text-slate-500">×{i.quantity} ({vnd(i.unitCost)})</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Tổng giá trị PO:</span>
                <span className="text-base font-black text-slate-900">
                  {vnd(currentPoTotal)}
                </span>
              </div>

              <button
                disabled={!supplierId || !warehouseId || items.length === 0}
                onClick={() => {
                  post({ action: "create", supplierId, warehouseId, items });
                  setItems([]);
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-white/50 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.01]"
              >
                Tạo Đơn Hàng PO
              </button>
            </div>
          </div>

          {/* Right Section: PO List (7 cols) */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Danh Sách Đơn Hàng Nhà Cung Cấp</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                  <tr>
                    <th className="p-4">Mã PO</th>
                    <th className="p-4">Nhà cung cấp</th>
                    <th className="p-4">Chi tiết mặt hàng</th>
                    <th className="p-4">Trạng thái</th>
                    <th className="p-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pos.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-4 font-bold text-indigo-700">{po.number}</td>
                      <td className="p-4 font-semibold text-slate-800">{po.supplier?.name ?? "—"}</td>
                      <td className="p-4 space-y-1">
                        {po.items.map((i, k) => (
                          <div key={k} className="text-[11px] text-slate-700">
                            <span className="font-mono font-semibold">{i.variant?.sku}</span>: {i.quantity} sp (Đã nhận: <b className="text-emerald-700">{i.receivedQty}</b>) · {vnd(Number(i.unitCost))}
                          </div>
                        ))}
                      </td>
                      <td className="p-4">
                        {getPoStatusBadge(po.status)}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap space-x-1.5">
                        {po.status === "pending_approval" && (
                          <button
                            onClick={() => post({ action: "approve", poId: po.id })}
                            className="px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                          >
                            Phê duyệt
                          </button>
                        )}
                        {["approved", "sent", "partially_received"].includes(po.status) && (
                          <button
                            onClick={() =>
                              post({
                                action: "receive",
                                poId: po.id,
                                items: po.items
                                  .filter((i) => i.variant && i.receivedQty < i.quantity)
                                  .map((i) => ({ variantId: i.variant!.id, quantity: i.quantity - i.receivedQty })),
                              })
                            }
                            className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                          >
                            Nhận đủ hàng
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pos.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-xs">
                <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Chưa có đơn nhập hàng PO nào được tạo.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
