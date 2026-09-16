// AI Business Action Center: Observe → Recommend → Act.
// Opens on the morning briefing (anomalies + digest), each card linking to
// the surface that resolves it (replenishment, approvals, why-funnel).
// Read-only page — actions happen on the linked pages, never here.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "../nav";
import { AlertTriangle, Info, Siren, ArrowRight, RefreshCw, FlaskConical } from "lucide-react";

type Anomaly = {
  kind: string;
  severity: "urgent" | "warning" | "info";
  title: string;
  detail: string;
  evidence: Record<string, number | string>;
};

type Briefing = {
  generatedAt: string;
  anomalies: Anomaly[];
  digest: { openSuggestions: number; outOfStockLines: number; pendingPO: number; openTransfers: number };
  urgentCount: number;
};

type Why = {
  periodDays: number;
  revenue: { current: number; baseline: number; pct: number | null };
  orders: { current: number; baseline: number; pct: number | null };
  topDecliners: { variantId: string; sku: string; name: string; soldNow: number; soldBase: number; outOfStockDays: number }[];
  hypothesis: string;
};

const SEV_ICON = { urgent: Siren, warning: AlertTriangle, info: Info } as const;
const SEV_STYLE = {
  urgent: "border-rose-200 bg-rose-50/60",
  warning: "border-amber-200 bg-amber-50/60",
  info: "border-slate-200 bg-white",
} as const;

const ACTION_LINK: Record<string, { href: string; label: string }> = {
  stockout_risk: { href: "/inventory/suggestions", label: "Xem gợi ý nhập" },
  pending_approvals: { href: "/approvals", label: "Duyệt ngay" },
  revenue_drop: { href: "#why", label: "Phân tích nguyên nhân" },
  orders_drop: { href: "#why", label: "Phân tích nguyên nhân" },
  slow_movers: { href: "/inventory/suggestions", label: "Xem tồn chậm" },
  back_in_stock_demand: { href: "/inventory", label: "Kiểm tra tồn" },
};

export default function ActionsPage() {
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [why, setWhy] = useState<Why | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [b, w] = await Promise.all([
        fetch("/api/merchant/briefing").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        fetch(`/api/merchant/why?days=${days}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      ]);
      setBrief(b);
      setWhy(w);
    } catch {
      setError("Không tải được briefing — kiểm tra quyền reports.store.view.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetch(`/api/merchant/why?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((w) => { if (w) setWhy(w); })
      .catch(() => {});
  }, [days]);

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-slate-50/60 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-bold text-slate-900 text-xl">AI Business Action Center</h1>
              <p className="text-xs text-slate-500 mt-1">
                AI quan sát → phát hiện → đề xuất. Mọi hành động nguy hiểm vẫn qua trang duyệt.
              </p>
            </div>
            <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold hover:bg-slate-50">
              <RefreshCw className="w-3.5 h-3.5" /> Tải lại
            </button>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500 animate-pulse">
              AI đang quét số liệu…
            </div>
          ) : error ? (
            <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center text-sm text-rose-700">{error}</div>
          ) : (
            <>
              {/* Urgent strip */}
              {(brief?.urgentCount ?? 0) > 0 && (
                <div className="rounded-2xl border border-rose-200 bg-rose-600 text-white px-4 py-3 text-sm font-bold flex items-center gap-2">
                  <Siren className="w-4 h-4" /> {brief!.urgentCount} vấn đề khẩn cần xử lý
                </div>
              )}

              {/* Anomaly cards */}
              <section className="space-y-3">
                {(brief?.anomalies ?? []).map((a, i) => {
                  const Icon = SEV_ICON[a.severity];
                  const link = ACTION_LINK[a.kind];
                  return (
                    <div key={i} className={`rounded-2xl border p-4 ${SEV_STYLE[a.severity]}`}>
                      <div className="flex items-start gap-3">
                        <Icon className="w-5 h-5 mt-0.5 shrink-0 text-slate-700" />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-900 text-sm">{a.title}</h3>
                          <p className="text-xs text-slate-600 mt-0.5">{a.detail}</p>
                          {link && (
                            <a href={link.href} className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-[#8c2d19] hover:underline">
                              {link.label} <ArrowRight className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(brief?.anomalies ?? []).length === 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                    Không có bất thường — cửa hàng đang vận hành ổn định.
                  </div>
                )}
              </section>

              {/* Digest strip */}
              {brief && (
                <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    ["Gợi ý nhập mở", brief.digest.openSuggestions],
                    ["Dòng hết hàng", brief.digest.outOfStockLines],
                    ["PO chờ duyệt", brief.digest.pendingPO],
                    ["Điều chuyển mở", brief.digest.openTransfers],
                  ].map(([label, v]) => (
                    <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                      <div className="text-2xl font-black text-slate-900">{v as number}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{label as string}</div>
                    </div>
                  ))}
                </section>
              )}

              {/* Why funnel */}
              <section id="why" className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 text-sm inline-flex items-center gap-1.5">
                    <FlaskConical className="w-4 h-4" /> Vì sao doanh thu thay đổi?
                  </h2>
                  <div className="flex gap-1">
                    {[7, 14, 30].map((d) => (
                      <button
                        key={d}
                        onClick={() => setDays(d)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold ${days === d ? "bg-[#1c1917] text-white" : "bg-slate-100 text-slate-600"}`}
                      >
                        {d} ngày
                      </button>
                    ))}
                  </div>
                </div>
                {why && (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-[11px] text-slate-500">Doanh thu kỳ này / kỳ trước</div>
                        <div className="font-black text-slate-900">
                          {why.revenue.current.toLocaleString("vi-VN")}₫ / {why.revenue.baseline.toLocaleString("vi-VN")}₫
                        </div>
                        <div className={`text-xs font-bold ${why.revenue.pct != null && why.revenue.pct < 0 ? "text-rose-600" : "text-[#14532d]"}`}>
                          {why.revenue.pct == null ? "—" : `${why.revenue.pct > 0 ? "+" : ""}${why.revenue.pct}%`}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-[11px] text-slate-500">Số đơn kỳ này / kỳ trước</div>
                        <div className="font-black text-slate-900">{why.orders.current} / {why.orders.baseline}</div>
                        <div className={`text-xs font-bold ${why.orders.pct != null && why.orders.pct < 0 ? "text-rose-600" : "text-[#14532d]"}`}>
                          {why.orders.pct == null ? "—" : `${why.orders.pct > 0 ? "+" : ""}${why.orders.pct}%`}
                        </div>
                      </div>
                    </div>
                    {why.topDecliners.length > 0 && (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500">
                              <th className="text-left font-bold px-3 py-2">SKU giảm mạnh</th>
                              <th className="text-right font-bold px-3 py-2">Kỳ trước → nay</th>
                              <th className="text-right font-bold px-3 py-2">Tồn</th>
                            </tr>
                          </thead>
                          <tbody>
                            {why.topDecliners.map((d) => (
                              <tr key={d.variantId} className="border-t border-slate-100">
                                <td className="px-3 py-2"><b>{d.name}</b> <span className="text-slate-400">{d.sku}</span></td>
                                <td className="px-3 py-2 text-right">{d.soldBase} → {d.soldNow}</td>
                                <td className="px-3 py-2 text-right">{d.outOfStockDays > 0 ? <span className="text-rose-600 font-bold">Hết hàng</span> : "Còn"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p className="text-xs text-slate-700 bg-[#faf6ef] border border-[#e8dac5] rounded-xl px-3 py-2.5">
                      <b>Nhận định:</b> {why.hypothesis}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Số liệu từ dữ liệu thật. <Link href="/approvals" className="underline">Mở trang duyệt</Link> để hành động.
                    </p>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}
