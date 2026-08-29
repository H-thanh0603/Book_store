"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "../../nav";
import { Webhook, Plus, AlertCircle, Loader2, Trash2, ExternalLink } from "lucide-react";

type Endpoint = {
  id: string;
  provider: string;
  url: string;
  eventTypes: string[];
  active: boolean;
  description: string | null;
  createdAt: string;
};

export default function WebhooksPage() {
  const [rows, setRows] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/webhooks");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
    } catch (e) { setErr(e instanceof Error ? e.message : "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function toggle(id: string, active: boolean) {
    await fetch(`/api/webhooks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    load();
  }
  async function remove(id: string) {
    if (!confirm("Xoá endpoint này? Lịch sử delivery cũng sẽ mất.")) return;
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <header className="flex items-center gap-3 mb-6">
          <Webhook className="w-7 h-7 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">Webhooks</h1>
          <span className="ml-auto text-sm text-slate-500">{rows.length} endpoint</span>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="ml-3 inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> Tạo mới
          </button>
        </header>

        {showNew && <NewEndpointForm onCreated={() => { setShowNew(false); load(); }} onCancel={() => setShowNew(false)} />}

        {err && (
          <div className="mb-4 flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 text-sm">
            <AlertCircle className="w-4 h-4" /> {err}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Đang tải…</div>
        ) : rows.length === 0 ? (
          <div className="bg-white border rounded p-8 text-center text-slate-500">
            Chưa có endpoint nào. Tạo endpoint đầu tiên để bắt đầu nhận sự kiện.
          </div>
        ) : (
          <div className="bg-white border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 text-left">
                <tr>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">URL</th>
                  <th className="px-3 py-2">Sự kiện</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{r.provider}</td>
                    <td className="px-3 py-2 font-mono text-xs truncate max-w-xs">{r.url}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {r.eventTypes.length === 0 ? <span className="italic">tất cả</span> : r.eventTypes.join(", ")}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => toggle(r.id, r.active)}
                        className={`px-2 py-0.5 rounded text-xs border ${r.active ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-white text-slate-700 border-slate-300"}`}
                      >
                        {r.active ? "BẬT" : "TẮT"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap space-x-1">
                      <Link href={`/settings/webhooks/${r.id}`} className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1">
                        Chi tiết <ExternalLink className="w-3 h-3" />
                      </Link>
                      <button onClick={() => remove(r.id)} className="text-rose-600 hover:underline text-xs inline-flex items-center gap-1">
                        <Trash2 className="w-3 h-3" /> Xoá
                      </button>
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

function NewEndpointForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [provider, setProvider] = useState("custom");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [eventTypes, setEventTypes] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          url,
          description: description || undefined,
          eventTypes: eventTypes.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.message ?? `HTTP ${r.status}`);
        return;
      }
      const d = await r.json();
      setSecret(d.secret);
    } finally { setBusy(false); }
  }

  if (secret) {
    return (
      <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded p-4 text-sm">
        <div className="font-semibold text-emerald-800 mb-2">Đã tạo endpoint. LƯU SECRET NGAY — sẽ không hiển thị lại:</div>
        <pre className="bg-white border rounded p-2 overflow-x-auto text-xs font-mono break-all">{secret}</pre>
        <button onClick={onCreated} className="mt-2 px-3 py-1 bg-emerald-600 text-white rounded text-xs">Đã lưu</button>
      </div>
    );
  }

  return (
    <div className="mb-4 bg-white border rounded p-4 grid grid-cols-2 gap-3 text-sm">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Provider</label>
        <input className="w-full border rounded px-2 py-1" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="custom | einvoice | misa" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">URL</label>
        <input className="w-full border rounded px-2 py-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="col-span-2">
        <label className="block text-xs font-semibold text-slate-700 mb-1">Mô tả</label>
        <input className="w-full border rounded px-2 py-1" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="col-span-2">
        <label className="block text-xs font-semibold text-slate-700 mb-1">Sự kiện (phẩy, để trống = tất cả)</label>
        <input className="w-full border rounded px-2 py-1" value={eventTypes} onChange={(e) => setEventTypes(e.target.value)} placeholder="order.paid, invoice.issued" />
      </div>
      {err && <div className="col-span-2 text-rose-700 text-xs">{err}</div>}
      <div className="col-span-2 flex gap-2">
        <button onClick={submit} disabled={busy || !url} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs disabled:opacity-50">
          {busy ? "Đang tạo…" : "Tạo"}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded text-xs">Huỷ</button>
      </div>
    </div>
  );
}
