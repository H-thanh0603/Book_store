"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";

type Promo = {
  id: string; name: string; code: string | null; type: string; value: number;
  buyQty: number | null; getQty: number | null; minQty: number; channel: string;
  stackable: boolean; usageLimit: number | null; usedCount: number; memberOnly: boolean;
  priority: number; active: boolean;
  category: { name: string } | null;
};

export default function PromotionsPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", code: "", type: "percentage", value: 10, minQty: 0, buyQty: 1, getQty: 1,
    categoryId: "", channel: "ALL", stackable: false, usageLimit: "",
    memberOnly: false, priority: 0, endAt: "",
  });

  async function load() {
    const r = await fetch("/api/promotions");
    if (r.ok) setPromos((await r.json()).promotions);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    load();
    fetch("/api/refs?kind=categories").then(async (r) => { if (r.ok) setCategories((await r.json()).categories); });
  }, []);

  async function create() {
    const r = await fetch("/api/promotions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        code: form.code || undefined,
        categoryId: form.categoryId || undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        endAt: form.endAt || undefined,
      }),
    });
    const d = await r.json();
    setMsg(r.ok ? "✅ Đã tạo khuyến mãi" : "❌ " + d.message);
    if (r.ok) load();
  }

  async function toggle(p: Promo) {
    const r = await fetch("/api/promotions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    if (r.ok) load(); else setMsg("❌ " + (await r.json()).message);
  }

  function describe(p: Promo): string {
    if (p.type === "percentage") return `Giảm ${p.value}%`;
    if (p.type === "fixed") return `Giảm ${p.value.toLocaleString("vi-VN")}₫`;
    return `Mua ${p.buyQty} tặng ${p.getQty}`;
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="p-6 grid grid-cols-[380px_1fr] gap-6 items-start">
        <section className="bg-white rounded-xl p-4 shadow-sm space-y-2">
          <h2 className="font-bold">Tạo khuyến mãi</h2>
          <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Tên"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Mã coupon (bỏ trống = tự động)"
            value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <select className="w-full border rounded px-3 py-2 text-sm" value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="percentage">Giảm theo %</option>
            <option value="fixed">Giảm số tiền cố định</option>
            <option value="buy_x_get_y">Mua X tặng Y</option>
          </select>
          <div className="flex gap-2">
            {form.type === "buy_x_get_y" ? (
              <>
                <input type="number" min={1} className="border rounded px-2 py-2 flex-1 text-sm" placeholder="Mua X"
                  value={form.buyQty} onChange={(e) => setForm({ ...form, buyQty: Number(e.target.value), minQty: Number(e.target.value) })} />
                <input type="number" min={1} className="border rounded px-2 py-2 flex-1 text-sm" placeholder="Tặng Y"
                  value={form.getQty} onChange={(e) => setForm({ ...form, getQty: Number(e.target.value) })} />
              </>
            ) : (
              <input type="number" min={0} className="border rounded px-2 py-2 w-32 text-sm"
                value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
            )}
            <input type="number" min={0} className="border rounded px-2 py-2 w-24 text-sm" placeholder="SL tối thiểu"
              value={form.minQty} onChange={(e) => setForm({ ...form, minQty: Number(e.target.value) })} />
          </div>
          <select className="w-full border rounded px-3 py-2 text-sm" value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Mọi ngành hàng</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex gap-2">
            <select className="border rounded px-3 py-2 flex-1 text-sm" value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              <option value="ALL">Tất cả kênh</option>
              <option value="POS">Chỉ POS</option>
              <option value="WEB">Chỉ Online</option>
            </select>
            <input type="number" min={0} className="border rounded px-2 py-2 w-24 text-sm" placeholder="Ưu tiên"
              value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
          </div>
          <label className="text-xs block">Hết hạn:
            <input type="datetime-local" className="w-full border rounded px-2 py-1"
              onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
          </label>
          <label className="text-xs block">Giới hạn lượt dùng:
            <input type="number" min={0} className="w-full border rounded px-2 py-1"
              value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} />
          </label>
          <div className="flex gap-4 text-sm">
            <label><input type="checkbox" checked={form.stackable} onChange={(e) => setForm({ ...form, stackable: e.target.checked })} /> Cộng dồn</label>
            <label><input type="checkbox" checked={form.memberOnly} onChange={(e) => setForm({ ...form, memberOnly: e.target.checked })} /> Chỉ thành viên</label>
          </div>
          <button onClick={create} disabled={!form.name}
            className="bg-blue-600 disabled:bg-slate-300 text-white rounded px-4 py-2 w-full">Tạo</button>
          {msg && <p className="text-sm">{msg}</p>}
        </section>

        <section className="bg-white rounded-xl p-4 shadow-sm overflow-x-auto">
          <h2 className="font-bold mb-3">Danh sách ({promos.length})</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="p-2">Tên</th><th>Mã</th><th>Rule</th><th>Kênh</th><th>Dùng</th><th>Trạng thái</th><th></th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="p-2 font-medium">{p.name}{p.category && <span className="text-xs text-slate-400"> · {p.category.name}</span>}</td>
                  <td>{p.code ?? "—"}</td>
                  <td>{describe(p)}{p.minQty > 0 && p.type !== "buy_x_get_y" ? ` (từ ${p.minQty} món)` : ""}</td>
                  <td>{p.channel}</td>
                  <td>{p.usedCount}{p.usageLimit != null ? `/${p.usageLimit}` : ""}</td>
                  <td>{p.active ? <span className="text-green-700">Đang chạy</span> : <span className="text-slate-400">Tắt</span>}</td>
                  <td><button onClick={() => toggle(p)} className="text-blue-600 hover:underline">{p.active ? "Tắt" : "Bật"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
