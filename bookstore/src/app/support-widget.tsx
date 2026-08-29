// Floating support chat for staff. Polls /api/support/conversations
// every 30s for a badge count, polls messages every 5s when a thread
// is open. Polling beats websockets for MVP - no infra, no auth
// handshake, easy to debug. Upgrade to WS when chat volume justifies
// the socket pool.
"use client";
import { useEffect, useState, useRef } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";

type Conversation = { id: string; subject: string | null; status: "OPEN" | "ESCALATED" | "CLOSED"; lastMessageAt: string; customerName: string; customerPhone: string };
type Message = { id: string; kind: "USER" | "STAFF" | "BOT"; body: string; createdAt: string };

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadList() {
    try { const r = await fetch("/api/support/conversations"); if (r.ok) setList(await r.json()); } catch {}
  }
  async function loadMessages() {
    if (!active) return;
    try {
      const r = await fetch(`/api/support/conversations/${active.id}/messages`);
      if (r.ok) { const d = await r.json(); setMessages(d.messages); }
    } catch {}
  }
  async function send() {
    if (!active || !draft.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/support/conversations/${active.id}/messages`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      setDraft("");
      await loadMessages();
      await loadList();
    } finally { setBusy(false); }
  }
  async function close() {
    if (!active) return;
    await fetch(`/api/support/conversations/${active.id}/close`, { method: "POST" });
    setActive(null); setMessages([]); await loadList();
  }

  useEffect(() => {
    if (!open) return;
    loadList();
    listTimer.current = setInterval(loadList, 30_000);
    return () => { if (listTimer.current) clearInterval(listTimer.current); };
  }, [open]);

  useEffect(() => {
    if (!active) return;
    loadMessages();
    msgTimer.current = setInterval(loadMessages, 5_000);
    return () => { if (msgTimer.current) clearInterval(msgTimer.current); };
  }, [active?.id]);

  const openCount = list.filter((c) => c.status !== "CLOSED").length;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 flex items-center justify-center"
        title="Ho tro"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
        {!open && openCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{openCount}</span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-96 h-[32rem] bg-white border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {!active ? (
            <>
              <div className="px-4 py-3 border-b bg-slate-50 font-semibold text-sm text-slate-800">Ho tro ({list.length})</div>
              <div className="flex-1 overflow-y-auto">
                {list.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs">Chua co cuoc tro chuyen nao.</div>
                ) : list.map((c) => (
                  <button key={c.id} onClick={() => setActive(c)} className="w-full text-left px-4 py-2 border-b hover:bg-slate-50">
                    <div className="text-sm font-medium text-slate-800">{c.customerName}</div>
                    <div className="text-xs text-slate-500 truncate">{c.subject ?? c.customerPhone}</div>
                    <StatusPill status={c.status} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                <button onClick={() => setActive(null)} className="text-xs text-slate-500 hover:underline">Quay lai</button>
                <div className="font-semibold text-sm">{active.customerName} <StatusPill status={active.status} /></div>
                {active.status !== "CLOSED" && <button onClick={close} className="text-xs text-rose-600 hover:underline">Dong</button>}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.length === 0 ? (
                  <div className="text-center text-xs text-slate-400 py-6">Chua co tin nhan.</div>
                ) : messages.map((m) => (
                  <div key={m.id} className={"flex " + (m.kind === "STAFF" ? "justify-end" : "justify-start")}>
                    <div className={"max-w-[80%] rounded-2xl px-3 py-1.5 text-sm " + (m.kind === "STAFF" ? "bg-indigo-600 text-white" : m.kind === "BOT" ? "bg-slate-200 text-slate-700" : "bg-slate-100 text-slate-800")}>
                      {m.body}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t p-2 flex gap-2">
                <input
                  value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Nhap tra loi..." disabled={active.status === "CLOSED"}
                  className="flex-1 border rounded px-2 py-1 text-sm"
                />
                <button onClick={send} disabled={busy || !draft.trim() || active.status === "CLOSED"} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function StatusPill({ status }: { status: "OPEN" | "ESCALATED" | "CLOSED" }) {
  const cls = status === "ESCALATED" ? "bg-amber-100 text-amber-700"
    : status === "CLOSED" ? "bg-slate-200 text-slate-600"
    : "bg-emerald-100 text-emerald-700";
  return <span className={"ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold " + cls}>{status}</span>;
}
