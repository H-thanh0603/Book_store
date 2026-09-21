// Floating support chat for staff. Polls /api/support/conversations
// every 30s for a badge count, polls messages every 5s when a thread
// is open. Polling beats websockets for MVP - no infra, no auth
// handshake, easy to debug. Upgrade to WS when chat volume justifies
// the socket pool.
"use client";
import { useEffect, useState, useRef } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";

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
        method: "POST", headers: { "content-type": "application/json", ...(await csrfHeaders()) },
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-fetch; load() is not memoized, adding it would refetch every render
  }, [active?.id]);

  const openCount = list.filter((c) => c.status !== "CLOSED").length;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="melio-support-panel"
        aria-label={open ? "Đóng hỗ trợ" : "Mở hỗ trợ"}
        className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-[#8c2d19] text-white shadow-lg hover:bg-[#7a2816] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c2d19] flex items-center justify-center"
        title="Hỗ trợ"
      >
        {open ? <X className="w-5 h-5" aria-hidden="true" /> : <MessageCircle className="w-5 h-5" aria-hidden="true" />}
        {!open && openCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{openCount}</span>
        )}
      </button>

      {open && (
        <div id="melio-support-panel" role="dialog" aria-modal="true" aria-label="Hỗ trợ nhân viên" className="fixed bottom-20 right-4 z-50 w-[calc(100vw-2rem)] max-w-96 max-h-[70vh] h-[32rem] bg-white border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {!active ? (
            <>
              <div className="px-4 py-3 border-b bg-[#faf4ea] font-semibold text-sm text-[#1c1917]">Hỗ trợ ({list.length})</div>
              <div className="flex-1 overflow-y-auto">
                {list.length === 0 ? (
                  <div className="p-6 text-center text-sm text-[#574431]">Chưa có cuộc trò chuyện nào. Mở ca POS hoặc tạo yêu cầu mới để bắt đầu.</div>
                ) : list.map((c) => (
                  <button key={c.id} onClick={() => setActive(c)} className="w-full text-left px-4 py-2 border-b hover:bg-[#faf4ea] focus-visible:outline-2 focus-visible:outline-[#8c2d19]">
                    <div className="text-sm font-medium text-[#1c1917]">{c.customerName}</div>
                    <div className="text-xs text-[#574431] truncate">{c.subject ?? c.customerPhone}</div>
                    <StatusPill status={c.status} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="px-4 py-3 border-b bg-[#faf4ea] flex items-center justify-between">
                <button onClick={() => setActive(null)} aria-label="Quay lại danh sách" className="text-xs font-medium text-[#574431] hover:text-[#1c1917] hover:underline focus-visible:outline-2 focus-visible:outline-[#8c2d19]">Quay lại</button>
                <div className="font-semibold text-sm text-[#1c1917]">{active.customerName} <StatusPill status={active.status} /></div>
                {active.status !== "CLOSED" && <button onClick={close} aria-label="Đóng cuộc trò chuyện" className="text-xs font-medium text-[#8c2d19] hover:underline focus-visible:outline-2 focus-visible:outline-[#8c2d19]">Đóng</button>}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.length === 0 ? (
                  <div className="text-center text-xs text-[#574431] py-6">Chưa có tin nhắn. Nhập lời chào đầu tiên bên dưới.</div>
                ) : messages.map((m) => (
                  <div key={m.id} className={"flex " + (m.kind === "STAFF" ? "justify-end" : "justify-start")}>
                    <div className={"max-w-[80%] rounded-2xl px-3 py-1.5 text-sm border " + (m.kind === "STAFF" ? "bg-[#8c2d19] text-white border-[#7a2816]" : m.kind === "BOT" ? "bg-[#faf4ea] text-[#574431] border-[#ede5d8]" : "bg-white text-[#1c1917] border-[#ede5d8]")}>
                      {m.body}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t p-2 flex gap-2">
                <label htmlFor="melio-support-input" className="sr-only">Nhập trả lời hỗ trợ</label>
                <input
                  id="melio-support-input"
                  value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Nhập trả lời..." disabled={active.status === "CLOSED"}
                  aria-label="Nhập trả lời hỗ trợ"
                  className="flex-1 border border-[#e8dac5] rounded px-2 py-1 text-sm text-[#1c1917] placeholder:text-[#574431]/70 focus-visible:outline-2 focus-visible:outline-[#8c2d19]"
                />
                <button onClick={send} disabled={busy || !draft.trim() || active.status === "CLOSED"} aria-label="Gửi tin nhắn" className="px-3 py-1 bg-[#8c2d19] hover:bg-[#7a2816] text-white rounded text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c2d19]">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
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
  return <span className={"ml-2 inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold " + cls}>{status}</span>;
}
