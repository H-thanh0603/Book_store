// N3c: product reviews — average + approved list + submit form (PENDING).
"use client";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";

type Review = {
  id: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: string;
};

function Stars({ value, onPick }: { value: number; onPick?: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          disabled={!onPick}
          onClick={() => onPick?.(s)}
          aria-label={`${s} sao`}
          className={onPick ? "cursor-pointer p-1.5 -m-1.5 touch-44" : "cursor-default"}
        >
          <Star
            className={`w-4 h-4 ${s <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
          />
        </button>
      ))}
    </div>
  );
}

export default function ProductReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch(`/api/storefront/reviews?productId=${productId}`);
      if (!r.ok) return;
      const d = await r.json();
      setReviews(d.reviews);
      setAverage(d.average);
      setCount(d.count);
    } catch {
      // best-effort — reviews never block shopping
    }
  }

  useEffect(() => {
    setSent(false);
    setErr(null);
    setReviews([]);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload per product
  }, [productId]);

  async function submit() {
    setErr(null);
    if (!name.trim() || !body.trim()) {
      setErr("Nhập tên và nội dung đánh giá");
      return;
    }
    const r = await fetch("/api/storefront/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await csrfHeaders()) },
      body: JSON.stringify({ productId, authorName: name.trim(), rating, body: body.trim() }),
    });
    if (r.ok) {
      setSent(true);
      setName("");
      setBody("");
      setRating(5);
    } else {
      const d = await r.json().catch(() => null);
      setErr(d?.message ?? "Gửi đánh giá thất bại");
    }
  }

  return (
    <section className="pt-4 border-t border-[#ede5d8] space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-sm text-slate-900">Đánh giá của bạn đọc</h4>
        {count > 0 ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Stars value={Math.round(average)} /> {average}/5 ({count})
          </span>
        ) : (
          <span className="text-xs text-slate-400">Chưa có đánh giá — hãy là người đầu tiên</span>
        )}
      </div>

      {reviews.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {reviews.map((r) => (
            <div key={r.id} className="p-3 rounded-xl bg-white border border-[#ede5d8] text-xs space-y-1">
              <div className="flex items-center justify-between">
                <b className="text-slate-900">{r.authorName}</b>
                <Stars value={r.rating} />
              </div>
              {r.title && <p className="font-bold text-slate-800">{r.title}</p>}
              <p className="text-slate-600 leading-relaxed">{r.body}</p>
              <span className="text-[10px] text-slate-400">
                {new Date(r.createdAt).toLocaleDateString("vi-VN")}
              </span>
            </div>
          ))}
        </div>
      )}

      {sent ? (
        <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          Cảm ơn bạn! Đánh giá sẽ hiển thị sau khi cửa hàng duyệt.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={name}
              aria-label="Tên của bạn"
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên của bạn"
              className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20"
            />
            <Stars value={rating} onPick={setRating} />
          </div>
          <textarea
            value={body}
            aria-label="Nội dung đánh giá"
            onChange={(e) => setBody(e.target.value)}
            placeholder="Chia sẻ cảm nhận về tác phẩm..."
            rows={2}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#8c2d19]/20"
          />
          {err && <p className="text-xs text-rose-600 font-semibold">{err}</p>}
          <button
            onClick={submit}
            className="px-4 py-2 rounded-xl bg-[#1c1917] hover:bg-[#8c2d19] text-white text-xs font-bold transition-colors"
          >
            Gửi đánh giá
          </button>
        </div>
      )}
    </section>
  );
}
