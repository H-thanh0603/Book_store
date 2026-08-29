"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "../../../nav";
import { ArrowLeft, Webhook, AlertCircle, Loader2, RotateCw, Send, PlayCircle } from "lucide-react";

type Delivery = {
  id: string;
  eventId: string;
  eventType: string;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  nextRetryAt: string;
  createdAt: string;
};

type Detail = {
  endpoint: {
    id: string;
    provider: string;
    url: string;
    eventTypes: string[];
    active: boolean;
    description: string | null;
    createdAt: string;
  };
  deliveries: Delivery[];
};

export default function WebhookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(id: string) {
    const r = await fetch(`/api/webhooks/${id}`);
    if (!r.ok) { setErr(`HTTP ${r.status}`); return; }
    setData(await r.json());
  }
  useEffect(() => { params.then(({ id }) => load(id)); }, [params]);

  async function action(body: unknown) {
    setBusy(true);
    try {
      const id = data?.endpoint.id;
      const r = await fetch(`/api/webhooks/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.message ?? `HTTP ${r.status}`);
        return;
      }
      const j = await r.json();
      if (body && (body as { action: string }).action === "rotate-secret") {
        setNewSecret(j.secret);
      }
      if (id) load(id);
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

  if (!data) return (
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
        <Link href="/settings/webhooks" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Quay lại
        </Link>

        <header className="flex items-center gap-3 mb-6">
          <Webhook className="w-7 h-7 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">{data.endpoint.provider}</h1>
          <span className={`ml-2 px-2 py-0.5 rounded text-xs ${data.endpoint.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
            {data.endpoint.active ? "BẬT" : "TẮT"}
          </span>
        </header>

        <section className="bg-white border rounded p-4 grid grid-cols-2 gap-3 text-sm mb-6">
          <div className="col-span-2"><div className="text-slate-500 text-xs">URL</div><div className="font-mono text-xs break-all">{data.endpoint.url}</div></div>
          <div className="col-span-2"><div className="text-slate-500 text-xs">Sự kiện</div><div className="font-medium">{data.endpoint.eventTypes.length === 0 ? "tất cả" : data.endpoint.eventTypes.join(", ")}</div></div>
          <div className="col-span-2"><div className="text-slate-500 text-xs">Mô tả</div><div>{data.endpoint.description ?? "—"}</div></div>
        </section>

        {newSecret && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded p-4 text-sm">
            <div className="font-semibold text-emerald-800 mb-2">Secret mới — lưu ngay:</div>
            <pre className="bg-white border rounded p-2 overflow-x-auto text-xs font-mono break-all">{newSecret}</pre>
            <button onClick={() => setNewSecret(null)} className="mt-2 px-3 py-1 bg-emerald-600 text-white rounded text-xs">Đã lưu</button>
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => action({ action: "rotate-secret" })}
            disabled={busy}
            className="px-3 py-2 bg-amber-100 text-amber-800 rounded text-sm hover:bg-amber-200 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <RotateCw className="w-4 h-4" /> Rotate secret
          </button>
          <button
            onClick={() => action({ action: "test" })}
            disabled={busy}
            className="px-3 py-2 bg-blue-100 text-blue-800 rounded text-sm hover:bg-blue-200 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Send className="w-4 h-4" /> Gửi test event
          </button>
        </div>

        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Delivery gần đây ({data.deliveries.length})</h2>
          <div className="bg-white border rounded">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 text-left">
                <tr>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2">Attempts</th>
                  <th className="px-3 py-2">Lỗi</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.deliveries.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-500">Chưa có delivery</td></tr>
                ) : data.deliveries.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="px-3 py-2 font-mono">{d.eventType}</td>
                    <td className="px-3 py-2">
                      {d.deliveredAt ? (
                        <span className="text-emerald-700">{d.lastStatus}</span>
                      ) : d.lastStatus ? (
                        <span className="text-rose-700">{d.lastStatus}</span>
                      ) : (
                        <span className="text-amber-700">pending</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{d.attempts}</td>
                    <td className="px-3 py-2 text-rose-600">{d.lastError ?? ""}</td>
                    <td className="px-3 py-2 text-right">
                      {!d.deliveredAt && d.lastError && (
                        <button
                          onClick={() => action({ action: "rearm-delivery", deliveryId: d.id })}
                          className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1"
                        >
                          <PlayCircle className="w-3 h-3" /> Rearm
                        </button>
                      )}
                    </td>
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
