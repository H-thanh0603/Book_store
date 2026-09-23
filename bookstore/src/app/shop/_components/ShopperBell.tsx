"use client";

// P3 onsite notification inbox: reads /api/storefront/notifications using
// the same localStorage identity the cart sync uses (melio.storefront.sync).
// Hidden entirely when no phone/customerId is known (anonymous visitor).
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";

function storedIdentity(): { phone?: string; customerId?: string } {
  try {
    const raw = localStorage.getItem("melio.storefront.sync");
    if (!raw) return {};
    const id = JSON.parse(raw) as { phone?: string; customerId?: string };
    return {
      ...(id.customerId ? { customerId: id.customerId } : {}),
      ...(id.phone ? { phone: id.phone } : {}),
    };
  } catch {
    return {};
  }
}

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
};

export default function ShopperBell() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = localStorage.getItem("melio.storefront.sync");
      if (!raw) return;
      const id = JSON.parse(raw) as { phone?: string; customerId?: string };
      const qs = new URLSearchParams();
      if (id.customerId) qs.set("customerId", id.customerId);
      if (id.phone) qs.set("phone", id.phone);
      if (!qs.toString()) return;
      fetch(`/api/storefront/notifications?${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d?.data?.notifications) setItems(d.data.notifications);
        })
        .catch(() => {});
    } catch {}
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (items === null) return null;

  const unread = items.filter((n) => n.status === "PENDING");

  async function markRead() {
    setOpen((v) => !v);
    if (unread.length === 0) return;
    setItems((prev) => prev!.map((n) => ({ ...n, status: "SENT" })));
    // Owner proof required by PUT /api/storefront/notifications (same
    // identity used for the GET above).
    const identity = storedIdentity();
    if (!identity.phone && !identity.customerId) return;
    const csrf = await csrfHeaders();
    await Promise.allSettled(
      unread.map((n) =>
        fetch("/api/storefront/notifications", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...csrf },
          body: JSON.stringify({ id: n.id, ...identity }),
        }).catch(() => {})
      )
    );
  }

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        onClick={markRead}
        aria-label={`Thông báo${unread.length ? ` (${unread.length} mới)` : ""}`}
        aria-expanded={open}
        className="relative flex items-center justify-center size-10 rounded-2xl border border-[#ede5d8] bg-[#faf4ea] hover:bg-[#ede5d8] text-slate-700 transition-colors cursor-pointer"
      >
        <Bell className="w-4 h-4 text-slate-600" />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center size-5 rounded-full bg-[#8c2d19] text-white font-black text-[11px]">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-[#ede5d8] z-50 p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 border-b border-slate-100 pb-2">
            <span>Thông báo của bạn</span>
            <span className="text-[#8c2d19]">{unread.length} mới</span>
          </div>
          {items.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">Chưa có thông báo nào.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
              {items.map((n) => (
                <div key={n.id} className="p-2 rounded-xl bg-[#faf4ea]/60">
                  <b className="text-xs text-slate-900 flex items-center gap-1.5">
                    {n.status === "PENDING" && <span className="size-1.5 rounded-full bg-[#8c2d19] inline-block" aria-hidden="true" />}
                    {n.title}
                  </b>
                  <p className="text-[11px] text-slate-600 mt-0.5">{n.body}</p>
                  <span className="text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString("vi-VN")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
