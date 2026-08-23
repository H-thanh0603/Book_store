"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "../nav";
import {
  TrendingUp,
  ShoppingBag,
  Users,
  DollarSign,
  AlertTriangle,
  Award,
  ArrowUpRight,
  RefreshCw,
  Boxes,
  Truck,
  Sparkles,
} from "lucide-react";

type Dash = {
  today: { revenue: number; transactions: number };
  month: { revenue: number; transactions: number };
  ordersMTD: number;
  customers: number;
  lowStock: { sku: string; name: string; loc: string; available: number }[];
  topProducts: { name: string; units: number; revenue: string }[];
};

export default function DashboardPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const r = await fetch("/api/dashboard");
      if (r.ok) {
        setD(await r.json());
        setErr(null);
      } else {
        setErr((await r.json()).message ?? "Lỗi tải dữ liệu");
      }
    } catch {
      setErr("Không thể kết nối đến máy chủ.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const vnd = (n: number) => n.toLocaleString("vi-VN") + " ₫";

  const maxUnits = d?.topProducts?.length
    ? Math.max(...d.topProducts.map((p) => Number(p.units) || 1))
    : 1;

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Tổng Quan Kinh Doanh
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                <Sparkles className="w-3 h-3" />
                Real-time
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Báo cáo hiệu suất bán hàng, biến động tồn kho và xu hướng sản phẩm
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Làm mới
            </button>
            <Link
              href="/pos"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Mở POS
            </Link>
          </div>
        </div>

        {err && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span>{err}</span>
          </div>
        )}

        {!d && loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-white rounded-2xl border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : !d ? null : (
          <>
            {/* 4 Metric KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Today Revenue */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Doanh thu hôm nay</span>
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">
                    {vnd(d.today.revenue)}
                  </p>
                  <p className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    Cập nhật theo hóa đơn POS &amp; Web
                  </p>
                </div>
              </div>

              {/* Today Transactions */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Giao dịch hôm nay</span>
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">
                    {d.today.transactions} <span className="text-sm font-normal text-slate-400">đơn</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Bao gồm bán tại quầy và online
                  </p>
                </div>
              </div>

              {/* Month Revenue */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Doanh thu tháng này</span>
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">
                    {vnd(d.month.revenue)}
                  </p>
                  <p className="text-[11px] text-indigo-600 font-medium mt-1">
                    {d.month.transactions} giao dịch luỹ kế
                  </p>
                </div>
              </div>

              {/* Total Customers */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Khách hàng thành viên</span>
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">
                    {d.customers.toLocaleString("vi-VN")} <span className="text-sm font-normal text-slate-400">thành viên</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Có tích điểm và phân hạng loyalty
                  </p>
                </div>
              </div>
            </div>

            {/* Split Section: Top Products & Low Stock Warning */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Top Products (7 cols) */}
              <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900 text-base">Top Sản Phẩm Bán Chạy</h2>
                      <p className="text-xs text-slate-500">Xếp hạng theo số lượng và doanh thu trong tháng</p>
                    </div>
                  </div>
                  <Link
                    href="/products"
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    Xem tất cả <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {d.topProducts.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <Boxes className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Chưa có dữ liệu bán hàng trong tháng này.
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    {d.topProducts.map((p, idx) => {
                      const units = Number(p.units) || 0;
                      const pct = Math.min(100, Math.round((units / maxUnits) * 100));
                      const isTop3 = idx < 3;
                      const medalColors = [
                        "bg-amber-500 text-white",
                        "bg-slate-400 text-white",
                        "bg-amber-700 text-white",
                      ];

                      return (
                        <div
                          key={p.name}
                          className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                                  isTop3 ? medalColors[idx] : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <span className="font-semibold text-slate-900 text-sm truncate">
                                {p.name}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-bold text-slate-900 text-sm">
                                {Number(BigInt(p.revenue)).toLocaleString("vi-VN")} ₫
                              </span>
                              <span className="block text-[11px] text-slate-500">
                                {units} sản phẩm
                              </span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Low Stock Warning (5 cols) */}
              <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-red-50 text-red-600">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900 text-base">Cảnh Báo Tồn Thấp</h2>
                      <p className="text-xs text-slate-500">Sản phẩm cần bổ sung nhập kho</p>
                    </div>
                  </div>
                  <Link
                    href="/purchase-orders"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    Tạo PO
                  </Link>
                </div>

                {d.lowStock.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <Boxes className="w-8 h-8 mx-auto mb-2 opacity-40 text-emerald-500" />
                    Tồn kho dồi dào! Không có sản phẩm nào chạm ngưỡng cảnh báo.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                    {d.lowStock.map((r) => {
                      const isOut = r.available <= 0;
                      return (
                        <div
                          key={r.sku + r.loc}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                            isOut
                              ? "bg-red-50/50 border-red-200/70"
                              : "bg-amber-50/40 border-amber-200/70"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {r.name}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">
                                {r.sku}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Kho: {r.loc}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span
                              className={`inline-block px-2 py-1 rounded-lg text-xs font-black ${
                                isOut
                                  ? "bg-red-600 text-white"
                                  : "bg-amber-500 text-white"
                              }`}
                            >
                              {r.available}
                            </span>
                            <span className="block text-[10px] text-slate-500 mt-0.5">
                              {isOut ? "Hết hàng" : "Sắp hết"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
