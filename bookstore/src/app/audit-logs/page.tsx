"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";

type Log = {
  id: string; action: string; entity: string; entityId: string | null;
  actor: { email: string } | null; createdAt: string;
  before: unknown; after: unknown;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load(p: number, a: string, e: string) {
    const r = await fetch(`/api/audit-logs?page=${p}&action=${encodeURIComponent(a)}&entity=${encodeURIComponent(e)}`);
    const d = await r.json();
    if (r.ok) { setLogs(d.logs); setTotal(d.total); setPage(d.page); setErr(null); }
    else setErr(d.message);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch; setState fires after await
  useEffect(() => { void load(1, "", ""); }, []);

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="p-6 space-y-4">
        <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); load(1, action, entity); }}>
          <input className="border rounded px-3 py-2 w-56" placeholder="Hành động (vd: pos.sale)"
            value={action} onChange={(e) => setAction(e.target.value)} />
          <input className="border rounded px-3 py-2 w-56" placeholder="Entity (vd: PosTransaction)"
            value={entity} onChange={(e) => setEntity(e.target.value)} />
          <button className="bg-blue-600 text-white rounded px-4">Lọc</button>
          <span className="self-center text-sm text-slate-500">{total} bản ghi</span>
        </form>
        {err && <p className="text-red-600">{err} (cần quyền admin)</p>}
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="p-3">Thời gian</th><th>Người thực hiện</th><th>Hành động</th>
                <th>Entity</th><th>ID</th><th>Thay đổi</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b align-top">
                  <td className="p-3 text-xs whitespace-nowrap">{new Date(l.createdAt).toLocaleString("vi-VN")}</td>
                  <td>{l.actor?.email ?? "—"}</td>
                  <td className="font-medium">{l.action}</td>
                  <td>{l.entity}</td>
                  <td className="text-xs">{l.entityId?.slice(0, 8)}</td>
                  <td className="text-xs text-slate-500 max-w-md">
                    {l.before || l.after
                      ? JSON.stringify({ ...(l.before ? { before: l.before } : {}), ...(l.after ? { after: l.after } : {}) })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => load(page - 1, action, entity)}
            className="border rounded px-3 py-1 disabled:opacity-40">← Trước</button>
          <span className="text-sm">Trang {page}</span>
          <button disabled={page * 50 >= total} onClick={() => load(page + 1, action, entity)}
            className="border rounded px-3 py-1 disabled:opacity-40">Sau →</button>
        </div>
      </div>
    </main>
  );
}
