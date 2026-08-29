// /settings/billing - current plan, last 50 invoices, and a "Pay
// current period" button that hits /api/billing/checkout and
// redirects the browser to the returned VNPay URL.
"use client";
import { useEffect, useState } from "react";
import Nav from "../../nav";
import { CreditCard, AlertCircle, Loader2, Receipt } from "lucide-react";

type Invoice = {
  id: string;
  planCode: string;
  planName: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: "PENDING" | "PAID" | "FAILED" | "VOID";
  issuedAt: string;
  paidAt: string | null;
};

function money(v: number) { return v.toLocaleString("vi-VN") + " đ"; }
function fmtDate(s: string) { return new Date(s).toLocaleDateString("vi-VN"); }

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/billing/invoices");
      if (!r.ok) throw new Error("HTTP " + r.status);
      setInvoices(await r.json());
    } catch (e) { setErr(e instanceof Error ? e.message : "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function pay() {
    setPaying(true); setErr(null);
    try {
      const r = await fetch("/api/billing/checkout", { method: "POST" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.message ?? "HTTP " + r.status); return; }
      const { url } = await r.json();
      if (url) window.location.href = url;
    } finally { setPaying(false); }
  }

  const pending = invoices.find((i) => i.status === "PENDING");
  const latestPaid = invoices.find((i) => i.status === "PAID");

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <header className="flex items-center gap-3 mb-6">
          <CreditCard className="w-7 h-7 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">Thanh toan goi</h1>
        </header>

        {err && (
          <div className="mb-4 flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 text-sm">
            <AlertCircle className="w-4 h-4" /> {err}
          </div>
        )}

        <div className="bg-white border rounded p-5 mb-6">
          {pending ? (
            <div>
              <div className="text-sm text-slate-500">Hoa don dang cho</div>
              <div className="text-lg font-bold text-slate-800 mt-1">{pending.planName} - {money(pending.amount)}</div>
              <div className="text-xs text-slate-500 mt-1">Ky {fmtDate(pending.periodStart)} den {fmtDate(pending.periodEnd)}</div>
              <button onClick={pay} disabled={paying} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Thanh toan ngay
              </button>
            </div>
          ) : latestPaid ? (
            <div>
              <div className="text-sm text-slate-500">Goi hien tai</div>
              <div className="text-lg font-bold text-slate-800 mt-1">{latestPaid.planName}</div>
              <div className="text-xs text-slate-500 mt-1">Ky gan nhat: {fmtDate(latestPaid.periodStart)} den {fmtDate(latestPaid.periodEnd)} - da thanh toan {fmtDate(latestPaid.paidAt!)}</div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Chua co hoa don nao. Goi cua ban dang trong thoi gian trial.</div>
          )}
        </div>

        <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2"><Receipt className="w-5 h-5" /> Lich su hoa don</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Dang tai…</div>
        ) : invoices.length === 0 ? (
          <div className="bg-white border rounded p-8 text-center text-slate-500 text-sm">Chua co hoa don.</div>
        ) : (
          <div className="bg-white border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 text-left">
                <tr>
                  <th className="px-3 py-2">Ky</th>
                  <th className="px-3 py-2">Goi</th>
                  <th className="px-3 py-2 text-right">So tien</th>
                  <th className="px-3 py-2">Trang thai</th>
                  <th className="px-3 py-2">Ngay thanh toan</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(i.periodStart)} - {fmtDate(i.periodEnd)}</td>
                    <td className="px-3 py-2 font-medium">{i.planName}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(i.amount)}</td>
                    <td className="px-3 py-2"><StatusBadge status={i.status} /></td>
                    <td className="px-3 py-2 text-xs text-slate-500">{i.paidAt ? fmtDate(i.paidAt) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: Invoice["status"] }) {
  const cls = status === "PAID" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : status === "PENDING" ? "bg-amber-100 text-amber-700 border-amber-200"
    : status === "FAILED" ? "bg-rose-100 text-rose-700 border-rose-200"
    : "bg-slate-100 text-slate-600 border-slate-200";
  return <span className={`px-2 py-0.5 rounded text-xs border ${cls}`}>{status}</span>;
}
