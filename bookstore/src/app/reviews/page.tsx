"use client";
import { useCallback, useEffect, useState } from "react";
import Nav from "../nav";
import { Star, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  status: string;
  createdAt: string;
  product: { name: string };
};

const STATUSES = [
  { key: "PENDING", label: "Chờ duyệt" },
  { key: "APPROVED", label: "Đã duyệt" },
  { key: "REJECTED", label: "Đã từ chối" },
];

export default function ReviewsPage() {
  const [status, setStatus] = useState("PENDING");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/reviews?status=${status}`);
      const d = await r.json();
      if (r.ok) setReviews(d.reviews ?? []);
      else setMsg({ text: d.message ?? "Không tải được đánh giá", type: "error" });
    } catch {
      setMsg({ text: "Lỗi mạng", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  async function moderate(id: string, action: "approve" | "reject") {
    const r = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify({ id, action }),
    });
    const d = await r.json();
    if (r.ok) { setMsg({ text: action === "approve" ? "Đã duyệt" : "Đã từ chối", type: "success" }); void load(); }
    else setMsg({ text: d.message ?? "Lỗi", type: "error" });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <header className="flex items-center gap-3 mb-6">
          <Star className="w-7 h-7 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">Duyệt đánh giá</h1>
        </header>

        {msg && (
          <div className={`mb-4 flex items-center gap-2 rounded border px-3 py-2 text-sm ${msg.type === "success" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-rose-700 bg-rose-50 border-rose-200"}`}>
            {msg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />} {msg.text}
          </div>
        )}

        <div className="flex gap-2 mb-6" role="tablist" aria-label="Trạng thái đánh giá">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={status === s.key}
              onClick={() => setStatus(s.key)}
              className={`px-4 py-2 rounded border text-sm ${status === s.key ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 hover:bg-slate-100"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="bg-white border rounded p-5">
          {loading ? (
            <div className="animate-pulse text-sm text-slate-400" aria-busy="true">Đang tải…</div>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-slate-500">Không có đánh giá nào ở trạng thái này.</p>
          ) : (
            <ul className="divide-y">
              {reviews.map((rv) => (
                <li key={rv.id} className="py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-amber-500 text-sm" aria-label={`${rv.rating} sao`}>
                      {"★".repeat(rv.rating)}{"☆".repeat(5 - rv.rating)}
                    </span>
                    <span className="text-sm font-medium text-slate-800">{rv.product.name}</span>
                  </div>
                  {rv.title && <p className="text-sm font-medium text-slate-700">{rv.title}</p>}
                  <p className="text-sm text-slate-600 mt-1">{rv.body}</p>
                  {status === "PENDING" && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => moderate(rv.id, "approve")}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-500"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Duyệt
                      </button>
                      <button
                        onClick={() => moderate(rv.id, "reject")}
                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-rose-200 text-rose-700 rounded text-sm hover:bg-rose-50"
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
      </main>
    </div>
  );
}
