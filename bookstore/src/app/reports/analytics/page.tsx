// Analytics tab for the BI-lite C2 reports. 4 tabs (revenue-by-store,
// revenue-by-category, top-sku, stock-on-hand) + date range + CSV
// download. Kept as a separate page so the existing operational
// /reports dashboard (jobs + loss prevention) keeps working.

"use client";
import { useEffect, useState } from "react";
import Nav from "../../nav";

type Tab = "revenue-by-store" | "revenue-by-category" | "top-sku" | "stock-on-hand";

const TABS: { id: Tab; label: string }[] = [
  { id: "revenue-by-store", label: "Doanh thu theo cửa hàng" },
  { id: "revenue-by-category", label: "Doanh thu theo danh mục" },
  { id: "top-sku", label: "Top SKU" },
  { id: "stock-on-hand", label: "Tồn kho" },
];

type ReportResponse = {
  columns: string[];
  rows: (string | number)[][];
  summary?: Record<string, string | number>;
};

function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function money(v: number) { return v.toLocaleString("vi-VN") + " đ"; }

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("revenue-by-store");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<ReportResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/reports/${tab}?from=${from}&to=${to}`);
      if (r.ok) setData(await r.json());
      else setErr((await r.json()).message ?? `Lỗi ${r.status}`);
    } catch { setErr("Lỗi mạng"); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-fetch; load() is not memoized, adding it would refetch every render
  useEffect(() => { void load(); }, [tab, from, to]);

  function downloadCsv() {
    const url = `/api/reports/${tab}?from=${from}&to=${to}&format=csv`;
    const a = document.createElement("a");
    a.href = url; a.download = `${tab}_${from}_${to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Báo Cáo Phân Tích</h1>
          <p className="text-xs text-slate-500 mt-1">Doanh thu, danh mục, top sản phẩm và tồn kho — xuất CSV mở bằng Excel.</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  tab === t.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Từ ngày</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Đến ngày</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs" />
            </div>
            <button onClick={downloadCsv} disabled={loading || !data}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold shadow-xs">
              Tải CSV
            </button>
          </div>
        </div>

        {err && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs">{err}</div>
        )}

        {data && (
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            {data.summary && (
              <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-6 text-xs">
                {Object.entries(data.summary).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-slate-500">{k}</div>
                    <div className="font-bold text-slate-900 text-sm">{typeof v === "number" && v > 1000 ? money(v) : v}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                  <tr>{data.columns.map((c) => <th key={c} className="p-4">{c}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.length === 0 ? (
                    <tr><td colSpan={data.columns.length} className="p-8 text-center text-slate-400">Không có dữ liệu trong khoảng này.</td></tr>
                  ) : data.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                      {row.map((cell, j) => (
                        <td key={j} className="p-4 text-slate-700 font-mono">
                          {typeof cell === "number" && cell > 1000 ? cell.toLocaleString("vi-VN") : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
