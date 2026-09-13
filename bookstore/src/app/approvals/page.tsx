"use client";
// Approval surface for merchant-agent staged changes. The model proposes
// (PENDING); humans APPROVE (applies via the manual flow's code) or REJECT.
// Nothing here calls a mutation except the approve/reject endpoints.
import { useCallback, useEffect, useState } from "react";
import Nav from "../nav";
import ConfirmDialog from "@/components/ConfirmDialog";
import { CheckCircle2, XCircle, RefreshCw, Loader2, Stamp } from "lucide-react";

type StagedChange = {
  id: string;
  kind: string;
  title: string;
  payload: Record<string, unknown>;
  status: string;
  requestedBy: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  appliedRef: string | null;
  error: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  "promotion.create": "Tạo khuyến mãi (nháp)",
  "product.patch": "Sửa mô tả sản phẩm",
  "suggestion.accept": "Duyệt gợi ý nhập hàng",
};

function payloadSummary(kind: string, payload: Record<string, unknown>): string {
  if (kind === "promotion.create")
    return `${String(payload.name ?? "")} — ${String(payload.type ?? "")} ${String(payload.value ?? "")}`;
  if (kind === "product.patch")
    return `Mô tả mới ${(payload.description as string ?? "").length} ký tự`;
  if (kind === "suggestion.accept")
    return `Gợi ý ${String(payload.suggestionId ?? "").slice(0, 8)}…`;
  return JSON.stringify(payload).slice(0, 120);
}

export default function ApprovalsPage() {
  const [rows, setRows] = useState<StagedChange[]>([]);
  const [filter, setFilter] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [confirm, setConfirm] = useState<{ row: StagedChange; action: "approve" | "reject" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/merchant/staged-changes?status=${filter}`);
      const d = await r.json();
      setRows(r.ok ? d.stagedChanges ?? [] : []);
      if (!r.ok) setMsg({ text: `Lỗi tải: ${d.message ?? r.status}`, type: "error" });
    } catch {
      setMsg({ text: "Lỗi: không thể kết nối.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function decide(action: "approve" | "reject") {
    if (!confirm) return;
    setBusyId(confirm.row.id);
    try {
      const r = await fetch(`/api/merchant/staged-changes/${confirm.row.id}/${action}`, { method: "POST" });
      const d = await r.json();
      if (r.ok) {
        setMsg({ text: action === "approve" ? `Đã duyệt — ${d.status}` : "Đã từ chối.", type: "success" });
        setConfirm(null);
        load();
      } else {
        setMsg({ text: `Lỗi: ${d.message ?? r.status}`, type: "error" });
      }
    } catch {
      setMsg({ text: "Lỗi: không thể kết nối.", type: "error" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#faf7f2] pb-16">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#ede5d8] shadow-xs">
          <div>
            <h1 className="font-serif text-2xl font-bold text-[#1c1917] tracking-tight flex items-center gap-2">
              <Stamp className="w-6 h-6 text-[#8c2d19]" aria-hidden="true" />
              Duyệt Đề Xuất AI
            </h1>
            <p className="text-xs text-[#574431] mt-1">
              Trợ lý AI chỉ đề xuất — mọi thay đổi có hiệu lực khi bạn bấm Duyệt. Không có gì tự chạy.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-sm border border-[#ede5d8] rounded-lg px-3 py-2 bg-white"
            >
              {["PENDING", "APPLIED", "REJECTED", "FAILED", ""].map((s) => (
                <option key={s} value={s}>{s === "" ? "Tất cả" : s}</option>
              ))}
            </select>
            <button onClick={load} className="text-sm border border-[#ede5d8] rounded-lg px-3 py-2 bg-white flex items-center gap-1">
              <RefreshCw className="w-4 h-4" /> Tải lại
            </button>
          </div>
        </div>

        {msg && (
          <div className={`p-3 rounded-xl text-sm ${msg.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            {msg.text}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#ede5d8] shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#8c2d19]" /></div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#574431]">Không có đề xuất nào ở trạng thái này.</div>
          ) : (
            <ul className="divide-y divide-[#ede5d8]">
              {rows.map((row) => (
                <li key={row.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#1c1917]">{row.title}</div>
                    <div className="text-xs text-[#574431] mt-0.5">
                      {KIND_LABEL[row.kind] ?? row.kind} · {payloadSummary(row.kind, row.payload)}
                    </div>
                    <div className="text-[11px] text-[#a89880] mt-0.5">
                      {row.status}
                      {row.appliedRef ? ` · ref ${row.appliedRef.slice(0, 8)}…` : ""}
                      {row.error ? ` · lỗi: ${row.error}` : ""}
                    </div>
                  </div>
                  {row.status === "PENDING" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        disabled={busyId === row.id}
                        onClick={() => setConfirm({ row, action: "approve" })}
                        className="text-sm px-3 py-1.5 rounded-lg bg-[#8c2d19] text-white flex items-center gap-1 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Duyệt & áp dụng
                      </button>
                      <button
                        disabled={busyId === row.id}
                        onClick={() => setConfirm({ row, action: "reject" })}
                        className="text-sm px-3 py-1.5 rounded-lg border border-[#ede5d8] bg-white flex items-center gap-1 disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" /> Từ chối
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        request={confirm ? {
          title: confirm.action === "approve" ? "Duyệt và áp dụng thay đổi?" : "Từ chối đề xuất?",
          body: `${confirm.row.title} — thao tác này ghi audit log.`,
          confirmLabel: confirm.action === "approve" ? "Duyệt & áp dụng" : "Từ chối",
        } : null}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void decide(confirm!.action)}
      />
    </main>
  );
}
