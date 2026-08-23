"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import {
  Search,
  Barcode,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Sparkles,
  Printer,
  CheckSquare,
  Square,
  X,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  category: { name: string } | null;
  brand: { name: string } | null;
  author: { name: string } | null;
  variants: { sku: string; barcodes: { barcode: string }[]; prices: { amount: string }[] }[];
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  async function load(p: number, query: string) {
    try {
      const r = await fetch(`/api/products?page=${p}&q=${encodeURIComponent(query)}`);
      const d = await r.json();
      if (r.ok) {
        setProducts(d.products);
        setTotal(d.total);
        setPage(d.page);
        setErr(null);
      } else {
        setErr(d.message);
      }
    } catch {
      setErr("Lỗi kết nối máy chủ");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1, ""), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const vnd = (n: number) => n.toLocaleString("vi-VN") + " ₫";
  const totalPages = Math.ceil(total / 25) || 1;

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function selectAll() {
    if (selectedIds.length === products.length) setSelectedIds([]);
    else setSelectedIds(products.map((p) => p.id));
  }

  const selectedProducts = products.filter((p) => selectedIds.includes(p.id));

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Header bar */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Danh Mục Sản Phẩm &amp; Bảng Giá</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                <Sparkles className="w-3 h-3" />
                {total} sản phẩm
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Quản lý danh mục sách, văn phòng phẩm, biểu giá bán lẻ, tác giả và in tem mã vạch Barcode hàng loạt
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (selectedIds.length === 0) setSelectedIds(products.map((p) => p.id));
                setPrintModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              <Printer className="w-4 h-4" />
              In Tem Mã Vạch ({selectedIds.length > 0 ? selectedIds.length : "Tất cả"})
            </button>

            <form
              className="flex items-center gap-2 w-full sm:w-auto"
              onSubmit={(e) => {
                e.preventDefault();
                load(1, q);
              }}
            >
              <div className="relative flex-1 sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="Tìm tên sách, SKU, mã vạch, tác giả..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors shrink-0"
              >
                Tìm kiếm
              </button>
            </form>
          </div>
        </div>

        {err && (
          <div className="flex items-center gap-2 p-3.5 text-xs text-red-700 bg-red-50 rounded-xl border border-red-200/80">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {/* Product Table with Checkbox */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200/80 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="p-4 w-10">
                    <button onClick={selectAll} className="text-slate-600 hover:text-indigo-600">
                      {selectedIds.length === products.length && products.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="p-4">Tên Sản Phẩm</th>
                  <th className="p-4">Ngành Hàng / Thương Hiệu</th>
                  <th className="p-4">SKU &amp; Barcode</th>
                  <th className="p-4 text-right">Giá Bán Lẻ (VND)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const variant = p.variants[0];
                  const price = variant?.prices[0] ? Number(variant.prices[0].amount) : 0;
                  const barcode = variant?.barcodes[0]?.barcode ?? "Chưa có";
                  const isChecked = selectedIds.includes(p.id);

                  return (
                    <tr key={p.id} className={`hover:bg-slate-50/60 transition-colors ${isChecked ? "bg-indigo-50/30" : ""}`}>
                      <td className="p-4">
                        <button onClick={() => toggleSelect(p.id)} className="text-slate-600 hover:text-indigo-600">
                          {isChecked ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                        </button>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-900">{p.name}</div>
                        {p.author && <div className="text-[11px] text-slate-400 italic">✍️ {p.author.name}</div>}
                      </td>
                      <td className="p-4">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {p.category?.name ?? "Chưa phân loại"}
                        </span>
                        {p.brand && <span className="ml-1 text-[10px] text-indigo-600 font-bold">({p.brand.name})</span>}
                      </td>
                      <td className="p-4 font-mono text-[11px]">
                        <div>SKU: {variant?.sku ?? "N/A"}</div>
                        <div className="text-slate-400 flex items-center gap-1">
                          <Barcode className="w-3.5 h-3.5" /> {barcode}
                        </div>
                      </td>
                      <td className="p-4 text-right font-bold text-slate-900 font-mono">
                        {price > 0 ? vnd(price) : "Liên hệ"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Trang {page} / {totalPages} ({total} sản phẩm)</span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => load(page - 1, q)}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => load(page + 1, q)}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PRINT BARCODE LABELS MODAL */}
      {printModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white">
          <div className="w-full max-w-4xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 my-8 print:shadow-none print:border-none print:m-0">
            <div className="flex items-center justify-between border-b pb-4 print:hidden">
              <div>
                <h3 className="font-bold text-xl text-slate-900">Xem Trước Tem Nhãn Mã Vạch</h3>
                <p className="text-xs text-slate-500">Chuẩn in tem dán decal 35x22mm hoặc tờ A4 (3x8 = 24 tem)</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
                >
                  <Printer className="w-4 h-4" /> Bắt Đầu In Ngay
                </button>
                <button onClick={() => setPrintModalOpen(false)} className="p-2 rounded-full hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Label Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 print:grid-cols-3 print:gap-2">
              {(selectedProducts.length > 0 ? selectedProducts : products).map((p) => {
                const variant = p.variants[0];
                const price = variant?.prices[0] ? Number(variant.prices[0].amount) : 0;
                const barcode = variant?.barcodes[0]?.barcode ?? "893000000000";

                return (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl border border-slate-300 bg-white text-center flex flex-col justify-between h-36 print:border-black print:h-32"
                  >
                    <div>
                      <span className="text-[9px] font-black uppercase text-slate-500 block">MELIO BOOKSTORE</span>
                      <b className="text-[11px] text-slate-900 line-clamp-1 block mt-0.5">{p.name}</b>
                    </div>

                    <div className="my-auto py-1">
                      {/* Barcode Simulation bars */}
                      <div className="flex justify-center items-center h-8 gap-0.5 px-2">
                        {Array.from({ length: 28 }).map((_, i) => (
                          <div
                            key={i}
                            className={`h-full ${i % 3 === 0 ? "w-1 bg-black" : i % 2 === 0 ? "w-0.5 bg-black" : "w-px bg-slate-800"}`}
                          />
                        ))}
                      </div>
                      <span className="font-mono text-[9px] text-slate-600 block mt-0.5 tracking-wider font-bold">
                        {barcode}
                      </span>
                    </div>

                    <div className="border-t border-dashed border-slate-300 pt-1 flex items-center justify-between text-[10px]">
                      <span className="text-slate-500 font-mono">SKU: {variant?.sku?.slice(-6)}</span>
                      <b className="text-slate-900 font-bold">{vnd(price)}</b>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
