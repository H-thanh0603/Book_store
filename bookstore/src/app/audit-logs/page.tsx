"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Sparkles,
} from "lucide-react";

type Log = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: { email: string } | null;
  createdAt: string;
  before: unknown;
  after: unknown;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(p: number, a: string, e: string) {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/audit-logs?page=${p}&action=${encodeURIComponent(a)}&entity=${encodeURIComponent(e)}`
      );
      const d = await r.json();
      if (r.ok) {
        setLogs(d.logs);
        setTotal(d.total);
        setPage(d.page);
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
    const timer = window.setTimeout(() => void load(1, "", ""), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const totalPages = Math.ceil(total / 50) || 1;

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Header bar */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Nhật Ký Kiểm Toán Hệ Thống (Audit Trail)
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                <Sparkles className="w-3 h-3" />
                {total} bản ghi
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Ghi nhận toàn bộ thao tác bảo mật, thay đổi dữ liệu, giá bán và giao dịch của nhân viên
            </p>
          </div>

          <form
            className="flex flex-wrap items-center gap-2 w-full sm:w-auto"
            onSubmit={(ev) => {
              ev.preventDefault();
              load(1, action, entity);
            }}
          >
            <input
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-44"
              placeholder="Hành động (vd: pos.sale)..."
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
            <input
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-44"
              placeholder="Thực thể (vd: Order)..."
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
            />
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors shrink-0"
            >
              Lọc nhật ký
            </button>
          </form>
        </div>

        {err && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{err} (Yêu cầu tài khoản quyền Owner / Admin)</span>
          </div>
        )}

        {/* Audit Log Table */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                <tr>
                  <th className="p-4">Thời gian</th>
                  <th className="p-4">Tài khoản thực hiện</th>
                  <th className="p-4">Hành động</th>
                  <th className="p-4">Thực thể</th>
                  <th className="p-4">Mã ID</th>
                  <th className="p-4">Dữ liệu thay đổi (Diff JSON)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60 transition-colors align-top">
                    <td className="p-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                      {new Date(l.createdAt).toLocaleString("vi-VN")}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                        <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-600 font-bold">
                          {l.actor?.email?.charAt(0).toUpperCase() ?? "?"}
                        </div>
                        <span>{l.actor?.email ?? "Hệ thống tự động"}</span>
                      </div>
                    </td>
                    <td className="p-4 font-bold text-indigo-700">
                      <span className="bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                        {l.action}
                      </span>
                    </td>
                    <td className="p-4 font-semibold text-slate-700">{l.entity}</td>
                    <td className="p-4 font-mono text-[10px] text-slate-400">
                      {l.entityId ? l.entityId.slice(0, 8) + "..." : "—"}
                    </td>
                    <td className="p-4 max-w-md">
                      {l.before || l.after ? (
                        <div className="bg-slate-900 text-slate-200 p-2.5 rounded-xl font-mono text-[10px] overflow-x-auto max-h-24 leading-relaxed">
                          {JSON.stringify(
                            {
                              ...(l.before ? { before: l.before } : {}),
                              ...(l.after ? { after: l.after } : {}),
                            },
                            null,
                            2
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {logs.length === 0 && !loading && (
            <div className="py-12 text-center text-slate-400 text-xs">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Không có bản ghi nhật ký kiểm toán nào.
            </div>
          )}

          {/* Pagination */}
          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Trang <b className="text-slate-800">{page}</b> / {totalPages} (50 dòng / trang)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => load(page - 1, action, entity)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Trước
              </button>
              <button
                disabled={page * 50 >= total || loading}
                onClick={() => load(page + 1, action, entity)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                Sau
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
