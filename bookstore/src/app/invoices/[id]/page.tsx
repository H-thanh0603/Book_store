"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "../../nav";
import { ArrowLeft, FileText, AlertCircle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";

type Attempt = {
  id: string;
  phase: string;
  status: string;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type Detail = {
  id: string;
  orderId: string;
  orderKind: string;
  provider: string;
  status: string;
  invoiceNumber: string | null;
  customerName: string;
  customerTaxCode: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  subtotal: number;
  tax: number;
  total: number;
  signedXmlUrl: string | null;
  pdfUrl: string | null;
  errorMessage: string | null;
  pollAttempts: number;
  issuedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  attempts: Attempt[];
};

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [row, setRow] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    params.then(({ id }) => {
      fetch(`/api/invoices/${id}`).then(async (r) => {
        if (!r.ok) { setErr(`HTTP ${r.status}`); return; }
        setRow(await r.json());
      }).catch((e) => setErr(String(e)));
    });
  }, [params]);

  async function cancel() {
    if (!row) return;
    if (!confirm("Hủy hóa đơn điện tử này?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/invoices/${row.id}/cancel`, { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.message ?? `HTTP ${r.status}`);
      } else {
        const fresh = await fetch(`/api/invoices/${row.id}`).then((r) => r.json());
        setRow(fresh);
      }
    } finally { setBusy(false); }
  }

  if (err) return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 text-sm">
          <AlertCircle className="w-4 h-4" /> {err}
        </div>
      </main>
    </div>
  );

  if (!row) return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-8 flex items-center gap-2 text-slate-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/invoices" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
        </Link>

        <header className="flex items-center gap-3 mb-6">
          <FileText className="w-7 h-7 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">Hóa đơn #{row.invoiceNumber ?? row.id.slice(0, 8)}</h1>
        </header>

        <section className="bg-white border rounded p-4 grid grid-cols-2 gap-3 text-sm mb-6">
          <div><div className="text-slate-500 text-xs">Trạng thái</div><div className="font-medium">{row.status}</div></div>
          <div><div className="text-slate-500 text-xs">Nhà cung cấp</div><div className="font-medium">{row.provider}</div></div>
          <div><div className="text-slate-500 text-xs">Đơn hàng</div><div className="font-mono text-xs">{row.orderId}</div></div>
          <div><div className="text-slate-500 text-xs">Loại</div><div className="font-medium">{row.orderKind}</div></div>
          <div><div className="text-slate-500 text-xs">Khách hàng</div><div className="font-medium">{row.customerName}</div></div>
          <div><div className="text-slate-500 text-xs">MST</div><div className="font-medium">{row.customerTaxCode ?? "—"}</div></div>
          <div className="col-span-2"><div className="text-slate-500 text-xs">Địa chỉ</div><div className="font-medium">{row.customerAddress ?? "—"}</div></div>
          <div><div className="text-slate-500 text-xs">Subtotal</div><div className="font-medium tabular-nums">{row.subtotal.toLocaleString("vi-VN")}</div></div>
          <div><div className="text-slate-500 text-xs">VAT</div><div className="font-medium tabular-nums">{row.tax.toLocaleString("vi-VN")}</div></div>
          <div className="col-span-2 border-t pt-2"><div className="text-slate-500 text-xs">Tổng</div><div className="font-bold tabular-nums text-lg">{row.total.toLocaleString("vi-VN")} đ</div></div>
        </section>

        {row.errorMessage && (
          <div className="mb-4 flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 text-sm">
            <AlertCircle className="w-4 h-4" /> {row.errorMessage}
          </div>
        )}

        {(row.signedXmlUrl || row.pdfUrl) && (
          <div className="flex gap-2 mb-6">
            {row.signedXmlUrl && (
              <a href={row.signedXmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                Tải XML <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {row.pdfUrl && (
              <a href={row.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                Tải PDF <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {row.status === "ISSUED" && (
          <button
            onClick={cancel}
            disabled={busy}
            className="mb-6 px-4 py-2 bg-rose-600 text-white rounded text-sm hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Hủy hóa đơn
          </button>
        )}

        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Lịch sử gọi nhà cung cấp</h2>
          <div className="bg-white border rounded">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 text-left">
                <tr>
                  <th className="px-3 py-2">Pha</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2">Bắt đầu</th>
                  <th className="px-3 py-2">Kết thúc</th>
                  <th className="px-3 py-2">Lỗi</th>
                </tr>
              </thead>
              <tbody>
                {row.attempts.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">Chưa có lần gọi</td></tr>
                ) : row.attempts.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-2 font-mono">{a.phase}</td>
                    <td className="px-3 py-2">{a.status}</td>
                    <td className="px-3 py-2">{new Date(a.startedAt).toLocaleString("vi-VN")}</td>
                    <td className="px-3 py-2">{a.finishedAt ? new Date(a.finishedAt).toLocaleString("vi-VN") : "—"}</td>
                    <td className="px-3 py-2 text-rose-600">{a.errorMessage ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
