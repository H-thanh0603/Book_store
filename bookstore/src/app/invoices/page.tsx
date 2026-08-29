"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "../nav";
import { FileText, Search, ExternalLink, AlertCircle, Loader2 } from "lucide-react";

type EInvoice = {
  id: string;
  orderId: string;
  orderKind: string;
  status: "DRAFT" | "PENDING" | "SENDING" | "ISSUED" | "CANCELED" | "ERROR";
  provider: string;
  invoiceNumber: string | null;
  customerName: string;
  total: number;
  createdAt: string;
  issuedAt: string | null;
  errorMessage: string | null;
  pdfUrl: string | null;
};

const STATUS_COLOR: Record<EInvoice["status"], string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING: "bg-amber-100 text-amber-700",
  SENDING: "bg-blue-100 text-blue-700",
  ISSUED: "bg-emerald-100 text-emerald-700",
  CANCELED: "bg-slate-200 text-slate-600 line-through",
  ERROR: "bg-rose-100 text-rose-700",
};

export default function InvoicesPage() {
  const [rows, setRows] = useState<EInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");

  async function load() {
    setLoading(true); setErr(null);
    try {
      const url = new URL("/api/invoices", window.location.origin);
      if (status) url.searchParams.set("status", status);
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [status]);

  const filtered = q
    ? rows.filter((r) => [r.orderId, r.invoiceNumber, r.customerName].some((v) => v?.toLowerCase().includes(q.toLowerCase())))
    : rows;

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <header className="flex items-center gap-3 mb-6">
          <FileText className="w-7 h-7 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">Hóa đơn điện tử</h1>
          <span className="ml-auto text-sm text-slate-500">{rows.length} bản ghi</span>
        </header>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2 bg-white border rounded px-3 py-2 w-72">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              className="outline-none text-sm flex-1"
              placeholder="Tìm theo mã HĐ, số HĐ, khách hàng…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="border rounded px-3 py-2 text-sm bg-white" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="DRAFT">DRAFT</option>
            <option value="PENDING">PENDING</option>
            <option value="SENDING">SENDING</option>
            <option value="ISSUED">ISSUED</option>
            <option value="CANCELED">CANCELED</option>
            <option value="ERROR">ERROR</option>
          </select>
          <button className="text-sm text-blue-600 hover:underline" onClick={load}>Làm mới</button>
        </div>

        {err && (
          <div className="mb-4 flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 text-sm">
            <AlertCircle className="w-4 h-4" /> {err}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Đang tải…</div>
        ) : (
          <div className="bg-white border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 text-left">
                <tr>
                  <th className="px-3 py-2">Số HĐ</th>
                  <th className="px-3 py-2">Đơn</th>
                  <th className="px-3 py-2">Khách</th>
                  <th className="px-3 py-2 text-right">Tổng</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2">Phát hành</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Chưa có hóa đơn</td></tr>
                ) : filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs">{r.invoiceNumber ?? <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.orderId}</td>
                    <td className="px-3 py-2">{r.customerName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.total.toLocaleString("vi-VN")}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLOR[r.status]}`}>{r.status}</span>
                      {r.errorMessage && <div className="text-xs text-rose-600 mt-1">{r.errorMessage}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{r.issuedAt ? new Date(r.issuedAt).toLocaleString("vi-VN") : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/invoices/${r.id}`} className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs">
                        Chi tiết <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
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
