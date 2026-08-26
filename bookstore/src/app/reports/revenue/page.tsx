"use client";
import { useEffect, useState } from "react";
import Nav from "../../nav";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  BarChart3,
  Store,
  Download,
  Calendar,
} from "lucide-react";

type RevenueData = {
  period: { from: string; to: string; group: string };
  summary: {
    totalRevenue: number;
    posRevenue: number;
    onlineRevenue: number;
    totalTransactions: number;
    avgOrderValue: number;
  };
  dailyRevenue: { date: string; revenue: number; transactions: number; avgOrder: number }[];
  onlineRevenue: { date: string; revenue: number; orders: number }[];
  topProducts: { name: string; sku: string; revenue: number; quantity: number }[];
  storeComparison: { name: string; code: string; revenue: number; transactions: number }[];
};

function fmt(n: number) {
  return n.toLocaleString("vi-VN");
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export default function RevenueReportPage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setTo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [group, setGroup] = useState<"day" | "month">("day");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to, group });
      const r = await fetch(`/api/reports/revenue?${params}`);
      if (r.ok) setData(await r.json());
      else setError((await r.json()).message ?? "Lỗi tải báo cáo");
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function exportCSV() {
    if (!data) return;
    const rows = [["Ngày", "Doanh thu POS", "Giao dịch", "DTB/đơn"]];
    for (const d of data.dailyRevenue) {
      rows.push([fmtDate(d.date), String(d.revenue), String(d.transactions), String(d.avgOrder)]);
    }
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doanh-thu-${from}-den-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const maxRevenue = data ? Math.max(...data.dailyRevenue.map((d) => d.revenue), 1) : 1;

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-indigo-600" />
                Báo Cáo Doanh Thu
              </h1>
              <p className="text-xs text-slate-500 mt-1">Theo dõi doanh thu POS và online theo ngày/tháng</p>
            </div>
            <button
              onClick={exportCSV}
              disabled={!data}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Xuất CSV
            </button>
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Từ ngày</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Đến ngày</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Nhóm</label>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value as "day" | "month")}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="day">Theo ngày</option>
                <option value="month">Theo tháng</option>
              </select>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all"
            >
              {loading ? "Đang tải..." : "Xem báo cáo"}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>
        )}

        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-indigo-600" /> Tổng doanh thu
                </span>
                <p className="text-xl font-black text-slate-900 mt-1">{fmt(data.summary.totalRevenue)} ₫</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                  <Store className="w-3 h-3" /> POS tại quầy
                </span>
                <p className="text-xl font-black text-emerald-700 mt-1">{fmt(data.summary.posRevenue)} ₫</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-[11px] font-semibold text-blue-600 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Online
                </span>
                <p className="text-xl font-black text-blue-700 mt-1">{fmt(data.summary.onlineRevenue)} ₫</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                  <ShoppingCart className="w-3 h-3 text-indigo-600" /> Giao dịch
                </span>
                <p className="text-xl font-black text-slate-900 mt-1">{data.summary.totalTransactions}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500">DTB/đơn</span>
                <p className="text-xl font-black text-slate-900 mt-1">{fmt(data.summary.avgOrderValue)} ₫</p>
              </div>
            </div>

            {/* Daily Revenue Chart (simple bar chart) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
              <h2 className="font-bold text-slate-900 text-sm mb-4">
                Doanh thu {group === "day" ? "hàng ngày" : "hàng tháng"}
              </h2>
              <div className="flex items-end gap-1 h-48">
                {data.dailyRevenue.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div
                      className="w-full bg-indigo-500 rounded-t-md hover:bg-indigo-600 transition-colors min-h-[2px]"
                      style={{ height: `${(d.revenue / maxRevenue) * 100}%` }}
                    />
                    <span className="text-[9px] text-slate-400 mt-1 rotate-45 origin-left">{fmtDate(d.date)}</span>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-900 text-white text-[10px] rounded-lg px-2 py-1 whitespace-nowrap z-10">
                      {fmt(d.revenue)} ₫ · {d.transactions} giao dịch
                    </div>
                  </div>
                ))}
              </div>
              {data.dailyRevenue.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-xs">Không có dữ liệu</div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Products */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900 text-sm">Top 10 sản phẩm bán chạy</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {data.topProducts.map((p, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{p.sku}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-indigo-700">{fmt(p.revenue)} ₫</p>
                        <p className="text-[10px] text-slate-500">{p.quantity} cuốn</p>
                      </div>
                    </div>
                  ))}
                  {data.topProducts.length === 0 && (
                    <div className="py-8 text-center text-slate-400 text-xs">Chưa có dữ liệu</div>
                  )}
                </div>
              </div>

              {/* Store Comparison */}
              {data.storeComparison.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-slate-100">
                    <h2 className="font-bold text-slate-900 text-sm">So sánh chi nhánh</h2>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {data.storeComparison.map((s, i) => (
                      <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{s.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{s.code}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-indigo-700">{fmt(s.revenue)} ₫</p>
                          <p className="text-[10px] text-slate-500">{s.transactions} giao dịch</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
