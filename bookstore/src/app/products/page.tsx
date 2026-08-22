"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";

type Product = {
  id: string; name: string;
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

  async function load(p: number, query: string) {
    const r = await fetch(`/api/products?page=${p}&q=${encodeURIComponent(query)}`);
    const d = await r.json();
    if (r.ok) { setProducts(d.products); setTotal(d.total); setPage(d.page); setErr(null); }
    else setErr(d.message);
  }

  useEffect(() => { load(1, ""); }, []);

  const vnd = (n: number) => n.toLocaleString("vi-VN") + "₫";

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="p-6 space-y-4">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); load(1, q); }}>
          <input className="border rounded px-3 py-2 w-96" placeholder="Tìm theo tên, SKU, barcode, tác giả…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="bg-blue-600 text-white rounded px-4">Tìm</button>
          <span className="self-center text-sm text-slate-500">{total} sản phẩm</span>
        </form>
        {err && <p className="text-red-600">{err}</p>}
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="p-3">Sản phẩm</th><th>Danh mục</th><th>SKU</th><th>Barcode</th><th className="text-right p-3">Giá bán</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b align-top">
                  <td className="p-3 font-medium">
                    {p.name}
                    {p.author && <span className="block text-xs text-slate-500">{p.author.name}</span>}
                    {p.brand && <span className="block text-xs text-slate-500">{p.brand.name}</span>}
                  </td>
                  <td>{p.category?.name}</td>
                  <td>{p.variants.map((v) => v.sku).join(", ")}</td>
                  <td className="text-xs">{p.variants.flatMap((v) => v.barcodes.map((b) => b.barcode)).join(", ")}</td>
                  <td className="text-right p-3">{vnd(Number(p.variants[0]?.prices[0]?.amount ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => load(page - 1, q)}
            className="border rounded px-3 py-1 disabled:opacity-40">← Trước</button>
          <span className="text-sm">Trang {page}</span>
          <button disabled={page * 25 >= total} onClick={() => load(page + 1, q)}
            className="border rounded px-3 py-1 disabled:opacity-40">Sau →</button>
        </div>
      </div>
    </main>
  );
}
