"use client";
import { useCallback, useEffect, useState } from "react";
import Nav from "../nav";
import { csrfHeaders } from "@/lib/csrf-client";
import ConfirmDialog, { type ConfirmRequest } from "@/components/ConfirmDialog";
import { Tags, Plus, Pencil, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";

type Kind = "categories" | "brands" | "authors" | "publishers";
const KINDS: { key: Kind; label: string }[] = [
  { key: "categories", label: "Thể loại" },
  { key: "brands", label: "Thương hiệu" },
  { key: "authors", label: "Tác giả" },
  { key: "publishers", label: "NXB" },
];

type Row = { id: string; name: string; parentId?: string | null };

export default function CategoriesPage() {
  const [kind, setKind] = useState<Kind>("categories");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/refs?kind=${kind}`);
      const d = await r.json();
      if (r.ok) {
        const list = d.categories ?? d.brands ?? d.authors ?? d.publishers ?? [];
        setRows(list);
      } else setMsg({ text: d.message ?? "Không tải được danh sách", type: "error" });
    } catch {
      setMsg({ text: "Lỗi mạng", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!name.trim()) { setMsg({ text: "Nhập tên", type: "error" }); return; }
    const body: Record<string, unknown> = editing
      ? { kind, id: editing.id, name: name.trim() }
      : { kind, name: name.trim() };
    if (kind === "categories" && !editing && parentId) body.parentId = parentId;
    const r = await fetch("/api/catalog", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", ...(await csrfHeaders()) },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: editing ? "Đã cập nhật" : "Đã thêm mới", type: "success" });
      setName(""); setParentId(""); setEditing(null);
      void load();
    } else setMsg({ text: d.message ?? "Lỗi", type: "error" });
  }

  async function doDelete() {
    if (!pendingDelete) return;
    const r = await fetch(`/api/catalog?kind=${kind}&id=${pendingDelete.id}`, {
      method: "DELETE",
      headers: { ...(await csrfHeaders()) },
    });
    const d = await r.json();
    if (r.ok) { setMsg({ text: "Đã xóa", type: "success" }); void load(); }
    else setMsg({ text: d.message ?? "Không xóa được (có thể đang được dùng)", type: "error" });
    setPendingDelete(null);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <header className="flex items-center gap-3 mb-6">
          <Tags className="w-7 h-7 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">Danh mục &amp; thuộc tính</h1>
        </header>

        {msg && (
          <div className={`mb-4 flex items-center gap-2 rounded border px-3 py-2 text-sm ${msg.type === "success" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-rose-700 bg-rose-50 border-rose-200"}`}>
            {msg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />} {msg.text}
          </div>
        )}

        <div className="flex gap-2 mb-6" role="tablist" aria-label="Loại danh mục">
          {KINDS.map((k) => (
            <button
              key={k.key}
              role="tab"
              aria-selected={kind === k.key}
              onClick={() => { setKind(k.key); setEditing(null); setName(""); setParentId(""); }}
              className={`px-4 py-2 rounded border text-sm ${kind === k.key ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 hover:bg-slate-100"}`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="bg-white border rounded p-5 mb-6">
          <h2 className="font-semibold text-slate-800 mb-3">{editing ? "Đổi tên" : "Thêm mới"}</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên…"
              aria-label="Tên"
              className="flex-1 border rounded px-3 py-2 text-sm"
            />
            {kind === "categories" && !editing && (
              <select value={parentId} onChange={(e) => setParentId(e.target.value)} aria-label="Danh mục cha" className="border rounded px-3 py-2 text-sm">
                <option value="">Không có cha</option>
                {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            <button onClick={save} className="inline-flex items-center gap-1 px-4 py-2 bg-slate-800 text-white rounded text-sm hover:bg-slate-700">
              <Plus className="w-4 h-4" /> {editing ? "Lưu" : "Thêm"}
            </button>
            {editing && (
              <button onClick={() => { setEditing(null); setName(""); }} className="px-4 py-2 border rounded text-sm text-slate-600 hover:bg-slate-100">
                Hủy
              </button>
            )}
          </div>
        </div>

        <div className="bg-white border rounded p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Danh sách ({rows.length})</h2>
          {loading ? (
            <div className="animate-pulse text-sm text-slate-400" aria-busy="true">Đang tải…</div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có mục nào — thêm mới ở trên.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2">
                  <span className="flex-1 text-sm text-slate-800">{r.name}</span>
                  <button
                    onClick={() => { setEditing(r); setName(r.name); }}
                    aria-label={`Đổi tên ${r.name}`}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setPendingDelete(r);
                      setConfirm({ title: "Xóa?", body: `Xóa "${r.name}"? Không xóa được mục đang có sản phẩm dùng.`, confirmLabel: "Xóa", danger: true });
                    }}
                    aria-label={`Xóa ${r.name}`}
                    className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <ConfirmDialog
        request={confirm}
        onCancel={() => { setConfirm(null); setPendingDelete(null); }}
        onConfirm={() => { setConfirm(null); void doDelete(); }}
      />
    </div>
  );
}
