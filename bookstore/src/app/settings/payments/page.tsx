// /settings/payments — refund queue for REFUND_REQUIRED captures
// (audit MONEY-001 follow-up). Money that raced an order cancellation:
// the gateway captured it, the order was cancelled, and before this page
// existed the only trace was an error log. Operators now see the queue,
// who paid, how much, and mark the refund done once the bank/portal
// transfer is complete. The scan job (payments.refund_scan) pages them
// via webhook + alert checker.
"use client";
import { useEffect, useState } from "react";
import Nav from "../../nav";
import { CreditCard, AlertCircle, Loader2, CheckCircle2, Undo2, RefreshCw } from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";

type Refund = {
  id: string;
  txnRef: string;
  provider: string;
  amount: number;
  paidAt: string | null;
  createdAt: string;
  refundStatus: string | null;
  refundedAt: string | null;
  refundNote: string | null;
  orderNumber: string | null;
  orderStatus: string | null;
  orderTotal: number | null;
  customerName: string | null;
  customerPhone: string | null;
};

function money(v: number) {
  return v.toLocaleString("vi-VN") + " đ";
}
function fmtDateTime(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("vi-VN");
}

export default function PaymentsRefundsPage() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/payments/refunds");
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message ?? "HTTP " + r.status);
      }
      const data = await r.json();
      setRefunds(data.refunds ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function markRefunded(id: string) {
    setMarkingId(id);
    setErr(null);
    try {
      const r = await fetch("/api/payments/refunds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await csrfHeaders()) },
        body: JSON.stringify({ id, note: noteText || undefined }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message ?? "HTTP " + r.status);
      }
      setNoteFor(null);
      setNoteText("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setMarkingId(null);
    }
  }

  const open = refunds.filter((r) => r.refundStatus !== "REFUNDED");
  const done = refunds.filter((r) => r.refundStatus === "REFUNDED");
  const openTotal = open.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <header className="flex items-center gap-3 mb-6">
          <CreditCard className="w-7 h-7 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">Hoàn tiền</h1>
          <button
            onClick={load}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 border rounded text-sm text-slate-600 hover:bg-slate-100"
          >
            <RefreshCw className={"w-4 h-4" + (loading ? " animate-spin" : "")} /> Làm mới
          </button>
        </header>

        {err && (
          <div className="mb-4 flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" /> {err}
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded p-4 mb-6 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              Các khoản thanh toán sau đã <b>nhận tiền từ khách</b> nhưng đơn hàng bị hủy/tồn kho đã trả lại.
              Tiền đang giữ phía cổng thanh toán — cần hoàn cho khách qua <b>portal VNPay</b> (mã giao dịch dưới đây)
              hoặc chuyển khoản kèm ghi chú. Sau khi hoàn xong, bấm &quot;Đánh dấu đã hoàn&quot; để lưu vết.
            </div>
          </div>
        </div>

        {open.length > 0 && (
          <div className="bg-white border rounded p-5 mb-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-slate-800">Cần hoàn tiền ({open.length})</h2>
              <span className="text-sm font-semibold text-rose-700">Tổng: {money(openTotal)}</span>
            </div>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-4 font-medium">Mã giao dịch</th>
                    <th className="py-2 pr-4 font-medium">Đơn hàng</th>
                    <th className="py-2 pr-4 font-medium">Khách</th>
                    <th className="py-2 pr-4 font-medium">Số tiền</th>
                    <th className="py-2 pr-4 font-medium">Thu tiền lúc</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {open.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 align-top">
                      <td className="py-3 pr-4 font-mono text-xs">{r.txnRef}</td>
                      <td className="py-3 pr-4">
                        {r.orderNumber ?? "—"}
                        <div className="text-xs text-slate-400">đơn {r.orderStatus ?? "?"}</div>
                      </td>
                      <td className="py-3 pr-4">
                        {r.customerName ?? "—"}
                        <div className="text-xs text-slate-400">{r.customerPhone ?? ""}</div>
                      </td>
                      <td className="py-3 pr-4 font-semibold">{money(r.amount)}</td>
                      <td className="py-3 pr-4 text-xs">{fmtDateTime(r.paidAt)}</td>
                      <td className="py-3">
                        {noteFor === r.id ? (
                          <div className="flex flex-col gap-2 min-w-56">
                            <input
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              placeholder="Ghi chú (mã hoàn, người thực hiện...)"
                              className="border rounded px-2 py-1 text-sm"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => markRefunded(r.id)}
                                disabled={markingId === r.id}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {markingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                Xác nhận đã hoàn
                              </button>
                              <button
                                onClick={() => {
                                  setNoteFor(null);
                                  setNoteText("");
                                }}
                                className="px-3 py-1.5 border rounded text-xs text-slate-600 hover:bg-slate-100"
                              >
                                Huỷ
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setNoteFor(r.id);
                              setNoteText("");
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-white rounded text-xs font-semibold hover:bg-slate-900"
                          >
                            <Undo2 className="w-3.5 h-3.5" /> Đánh dấu đã hoàn
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {done.length > 0 && (
          <div className="bg-white border rounded p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Đã hoàn ({done.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-4 font-medium">Mã giao dịch</th>
                    <th className="py-2 pr-4 font-medium">Đơn hàng</th>
                    <th className="py-2 pr-4 font-medium">Số tiền</th>
                    <th className="py-2 pr-4 font-medium">Hoàn lúc</th>
                    <th className="py-2 font-medium">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {done.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{r.txnRef}</td>
                      <td className="py-2 pr-4">{r.orderNumber ?? "—"}</td>
                      <td className="py-2 pr-4">{money(r.amount)}</td>
                      <td className="py-2 pr-4 text-xs">{fmtDateTime(r.refundedAt)}</td>
                      <td className="py-2 text-xs text-slate-500">{r.refundNote ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && open.length === 0 && done.length === 0 && (
          <div className="bg-white border rounded p-10 text-center text-slate-500">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
            Không có khoản hoàn tiền nào — không có giao dịch nào thu tiền trên đơn đã hủy.
          </div>
        )}

        {loading && (
          <div className="bg-white border rounded p-10 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          </div>
        )}
      </main>
    </div>
  );
}
