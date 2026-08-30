"use client";
import { useEffect, useState } from "react";
import Nav from "../../nav";
import { Barcode, Printer, Search, CheckSquare, Square, } from "lucide-react";
import { printLabels } from "@/components/BarcodeLabel";

type Product = {
  id: string;
  name: string;
  variants: {
    id: string;
    sku: string;
    barcodes: { barcode: string }[];
    prices: { amount: string }[];
  }[];
};

export default function BarcodeLabelPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Map<string, { barcode: string; name: string; price: number; sku: string }>>(new Map());
  const [copies, setCopies] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/products?limit=500")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = products.filter((p) => {
    const query = q.toLowerCase().trim();
    if (!query) return true;
    return p.name.toLowerCase().includes(query) || p.variants.some((v) => v.sku.toLowerCase().includes(query));
  });

  function toggleProduct(product: Product) {
    const v = product.variants[0];
    if (!v) return;
    const barcode = v.barcodes[0]?.barcode ?? "";
    if (!barcode) return;
    const key = v.id;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, {
          barcode,
          name: product.name,
          price: Number(v.prices[0]?.amount ?? 0n),
          sku: v.sku,
        });
      }
      return next;
    });
  }

  function selectAll() {
    const next = new Map(selected);
    for (const p of filtered) {
      const v = p.variants[0];
      if (!v) continue;
      const barcode = v.barcodes[0]?.barcode ?? "";
      if (!barcode || next.has(v.id)) continue;
      next.set(v.id, {
        barcode,
        name: p.name,
        price: Number(v.prices[0]?.amount ?? 0n),
        sku: v.sku,
      });
    }
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Map());
  }

  function handlePrint() {
    const labels = Array.from(selected.values());
    if (labels.length === 0) return;
    printLabels(labels, { copies });
  }

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Barcode className="w-6 h-6 text-indigo-600" />
                In Tem Barcode
              </h1>
              <p className="text-xs text-slate-500 mt-1">Chọn sản phẩm và in tem barcode EAN13/Code128</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">Số bản:</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={copies}
                  onChange={(e) => setCopies(Number(e.target.value) || 1)}
                  className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <button
                onClick={handlePrint}
                disabled={selected.size === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-white/50 text-white shadow-sm transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                In {selected.size} tem
              </button>
            </div>
          </div>

          {/* Search + Bulk Actions */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                placeholder="Tìm sản phẩm..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <button onClick={selectAll} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors">
              Chọn tất cả
            </button>
            <button onClick={clearSelection} disabled={selected.size === 0} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-40">
              Bỏ chọn ({selected.size})
            </button>
          </div>
        </div>

        {/* Product List */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                <tr>
                  <th className="p-4 w-10"></th>
                  <th className="p-4">Sản phẩm</th>
                  <th className="p-4">SKU</th>
                  <th className="p-4">Barcode</th>
                  <th className="p-4 text-right">Giá</th>
                  <th className="p-4 text-center">Tem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => {
                  const v = p.variants[0];
                  const barcode = v?.barcodes[0]?.barcode ?? "";
                  const price = Number(v?.prices[0]?.amount ?? 0n);
                  const isSelected = v ? selected.has(v.id) : false;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => toggleProduct(p)}
                      className={`cursor-pointer transition-colors ${isSelected ? "bg-indigo-50/60" : "hover:bg-slate-50/60"}`}
                    >
                      <td className="p-4">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300" />
                        )}
                      </td>
                      <td className="p-4 font-semibold text-slate-900">{p.name}</td>
                      <td className="p-4 font-mono text-slate-600">{v?.sku ?? "—"}</td>
                      <td className="p-4 font-mono text-slate-600">{barcode || "Chưa có"}</td>
                      <td className="p-4 text-right font-semibold text-indigo-700">{price.toLocaleString("vi-VN")} ₫</td>
                      <td className="p-4 text-center">
                        {barcode && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Sẵn sàng
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {loading && (
            <div className="py-8 text-center text-slate-400 text-xs">Đang tải...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-8 text-center text-slate-400 text-xs">
              <Barcode className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Không tìm thấy sản phẩm
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
