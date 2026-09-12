"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Shared offset-pagination footer (WS2.1/FE-002): every admin list API returns
// { page, pageSize, total } — this renders "Trang x / N (T bản ghi)" + prev/next.
export default function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 text-xs text-slate-500">
      <span>
        Trang {page} / {totalPages} ({total.toLocaleString("vi-VN")} bản ghi)
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Trang trước"
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Trang sau"
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
