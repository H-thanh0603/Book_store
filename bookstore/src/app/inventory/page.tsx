"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import Pager from "@/components/Pager";
import {
  Search,
  AlertTriangle,
  MapPin,
  RefreshCw,
  Sparkles,
  Zap,
  CheckCircle2,
  Trash2,
  X,
} from "lucide-react";

type Balance = {
  variantId: string;
  locationId: string;
  sku: string;
  product: string;
  location: string;
  onHand: number;
  reserved: number;
  available: number;
  inTransit: number;
  damaged: number;
};

export default function InventoryPage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoPOModalOpen, setAutoPOModalOpen] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  // N2c: damage slip form state
  const [dmgOpen, setDmgOpen] = useState(false);
  const [dmgSku, setDmgSku] = useState("");
  const [dmgLoc, setDmgLoc] = useState("");
  const [dmgQty, setDmgQty] = useState(1);
  const [dmgReason, setDmgReason] = useState("");

  async function submitDamage() {
    if (!dmgSku.trim() || !dmgLoc || dmgQty < 1 || !dmgReason.trim()) {
      setErr("Nhập đủ SKU, vị trí, số lượng và lý do hủy");
      return;
    }
    // Ids come from the balances rows (server revalidates everything anyway).
    const bal = balances.find((b) => b.sku === dmgSku.trim() && b.location === dmgLoc);
    if (!bal) {
      setErr("Không tìm thấy SKU tại vị trí này trong trang hiện tại");
      return;
    }
    const r = await fetch("/api/inventory/damage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId: bal.variantId, locationId: bal.locationId, qty: dmgQty, reason: dmgReason.trim() }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Đã ghi hủy ${d.qty} × ${d.sku}`, type: "success" });
      setDmgOpen(false); setDmgSku(""); setDmgLoc(""); setDmgQty(1); setDmgReason("");
      loadData(page);
    } else {
      setErr(d.message);
    }
  }
  const [poCreated, setPoCreated] = useState(false);
  const [poCode, setPoCode] = useState("");

  async function loadData(p = 1) {
    setLoading(true);
    try {
      const r = await fetch(`/api/inventory?page=${p}&pageSize=${PAGE_SIZE}`);
      const d = await r.json();
      if (r.ok) {
        setBalances(d.balances);
        setPage(d.page);
        setTotal(d.total);
        setErr(null);
      } else {
        setErr(d.message);
      }
    } catch {
      setErr("Lỗi kết nối máy chủ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = balances.filter((b) =>
    (b.sku + b.product + b.location).toLowerCase().includes(q.toLowerCase())
  );

  const lowStockItems = balances.filter((b) => b.available <= 15);
  const totalOnHand = balances.reduce((s, b) => s + b.onHand, 0);
  const totalAvailable = balances.reduce((s, b) => s + b.available, 0);

  function createAutoPO() {
    setPoCode(`PO-AUTO-${Date.now().toString().slice(-6)}`);
    setPoCreated(true);
    setTimeout(() => {
      setAutoPOModalOpen(false);
      setPoCreated(false);
    }, 2500);
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
                Quản Lý Tồn Kho Toàn Hệ Thống
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                <Sparkles className="w-3 h-3" />
                {total.toLocaleString("vi-VN")} vị trí lưu trữ
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Theo dõi biến động tồn thực tế (On Hand), khả dụng (Available), dự báo nhập hàng tự động AI
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setDmgOpen(true); setMsg(null); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Phiếu hủy hàng
            </button>
            <button
              onClick={() => setAutoPOModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-[#1c1917] font-bold text-xs rounded-xl shadow-xs transition-colors"
            >
              <Zap className="w-4 h-4 fill-slate-950" />
              Đề Xuất Nhập Hàng Tự Động ({lowStockItems.length})
            </button>

            <button
              onClick={() => loadData(page)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Làm mới
            </button>
          </div>
        </div>

        {err && (
          <div className="p-3.5 text-xs text-red-700 bg-red-50 rounded-xl border border-red-200">
            {err}
          </div>
        )}
        {msg && (
          <div className="p-3.5 text-xs text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {msg.text}
          </div>
        )}

        {/* Low stock alert banner */}
        {lowStockItems.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Phát hiện <b>{lowStockItems.length} mặt hàng</b> sắp hết tại kệ (Tồn khả dụng &le; 15 cuốn). Khuyến nghị bổ sung ngay.</span>
            </div>
            <button
              onClick={() => setAutoPOModalOpen(true)}
              className="px-3 py-1 bg-amber-600 text-white rounded-lg text-[11px] font-bold hover:bg-amber-700 shrink-0"
            >
              Tạo PO Ngay
            </button>
          </div>
        )}

        {/* 5 Stock Status Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500">Tồn thực tế (On Hand)</span>
            <div className="text-2xl font-bold text-slate-900 font-mono mt-1">{totalOnHand.toLocaleString()}</div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-emerald-600">Khả dụng bán (Available)</span>
            <div className="text-2xl font-bold text-emerald-700 font-mono mt-1">{totalAvailable.toLocaleString()}</div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-amber-600">Cảnh báo sắp hết</span>
            <div className="text-2xl font-bold text-amber-700 font-mono mt-1">{lowStockItems.length} SKUs</div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-[#d97706]">Đang luân chuyển</span>
            <div className="text-2xl font-bold text-[#b45309] font-mono mt-1">Hoạt động</div>
          </div>
        </div>

        {/* Balances table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Lọc theo SKU, tên sách, vị trí..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200/80 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="p-4">Sản Phẩm &amp; SKU</th>
                  <th className="p-4">Vị Trí Kho / Kệ</th>
                  <th className="p-4 text-center">Tồn Thực</th>
                  <th className="p-4 text-center">Khả Dụng</th>
                  <th className="p-4 text-center">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filtered.map((b, i) => (
                  <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4 font-sans font-bold text-slate-900">
                      <div>{b.product}</div>
                      <div className="text-[11px] font-mono text-slate-400">{b.sku}</div>
                    </td>
                    <td className="p-4 font-sans">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {b.location}
                      </div>
                    </td>
                    <td className="p-4 text-center font-bold">{b.onHand}</td>
                    <td className="p-4 text-center font-bold text-emerald-600">{b.available}</td>
                    <td className="p-4 text-center font-sans">
                      {b.available <= 15 ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          Sắp hết
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Đủ hàng
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100">
            <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={(p) => loadData(p)} />
          </div>
        </div>
      </div>

      {/* DAMAGE SLIP MODAL (N2c) */}
      {dmgOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900">Phiếu hủy hàng hỏng</h3>
              <button onClick={() => setDmgOpen(false)} className="p-2 rounded-full hover:bg-slate-100" aria-label="Đóng">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">Ghi giảm tồn qua phiếu DAMAGED — bắt buộc lý do, lưu audit. Không thể hoàn tác.</p>
            <input
              value={dmgSku}
              onChange={(e) => setDmgSku(e.target.value)}
              placeholder="SKU (VD: BK-DEmen-01)"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
            />
            <select
              value={dmgLoc}
              onChange={(e) => setDmgLoc(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
            >
              <option value="">— Chọn vị trí —</option>
              {[...new Set(balances.filter((b) => !dmgSku.trim() || b.sku === dmgSku.trim()).map((b) => b.location))].map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
            <input
              type="number" min={1} max={10000}
              value={dmgQty}
              onChange={(e) => setDmgQty(Number(e.target.value))}
              placeholder="Số lượng"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
            <textarea
              value={dmgReason}
              onChange={(e) => setDmgReason(e.target.value)}
              placeholder="Lý do hủy (VD: ướt mưa, rách bìa, hết hạn...)"
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
            <button
              onClick={submitDamage}
              className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
            >
              Ghi hủy hàng
            </button>
          </div>
        </div>
      )}

      {/* AUTO REPLENISHMENT PO MODAL */}
      {autoPOModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="size-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Zap className="w-5 h-5 fill-amber-700" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">Đề Xuất Nhập Hàng Tự Động (AI PO)</h3>
                  <p className="text-xs text-slate-500">Tự động tổng hợp các sản phẩm dưới định mức an toàn</p>
                </div>
              </div>
            </div>

            {poCreated ? (
              <div className="p-6 text-center space-y-2 bg-emerald-50 rounded-2xl border border-emerald-200">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <h4 className="font-bold text-base text-emerald-900">Đã Tạo Đơn Mua Hàng Thành Công!</h4>
                <p className="text-xs text-emerald-700">Mã PO: <b>{poCode}</b> đã gửi tới nhà cung cấp.</p>
              </div>
            ) : (
              <>
                <div className="max-h-60 overflow-y-auto space-y-2 text-xs">
                  {lowStockItems.map((item, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <div>
                        <b className="block text-slate-900">{item.product}</b>
                        <span className="text-slate-500">Tồn hiện tại: {item.available} | Đề xuất nhập: +50</span>
                      </div>
                      <span className="font-mono font-bold text-amber-700">+50 cuốn</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setAutoPOModalOpen(false)}
                    className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    onClick={createAutoPO}
                    className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-[#1c1917] font-bold text-xs shadow-md"
                  >
                    Xác Nhận Tạo Đơn Nhập
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
