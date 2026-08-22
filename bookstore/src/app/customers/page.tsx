"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";

type Customer = {
  id: string; code: string; name: string; phone: string; email: string | null;
  loyalty: { points: number; tier: string } | null;
};
type LoyaltyTx = { id: string; points: number; balanceAfter: number; type: string; createdAt: string };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [history, setHistory] = useState<{ points: number; tier: string | null; transactions: LoyaltyTx[] } | null>(null);

  async function load(query: string) {
    const r = await fetch(`/api/customers?q=${encodeURIComponent(query)}`);
    if (r.ok) setCustomers((await r.json()).customers);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch; setState fires after await
  useEffect(() => { void load(""); }, []);

  async function create() {
    const r = await fetch("/api/customers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name, phone }),
    });
    const d = await r.json();
    setMsg(r.ok ? `✅ ${d.customer.code} — ${d.customer.name}` : "❌ " + d.message);
    if (r.ok) { setName(""); setPhone(""); load(q); }
  }

  async function showHistory(c: Customer) {
    setSelected(c);
    const r = await fetch("/api/customers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "history", customerId: c.id }),
    });
    if (r.ok) setHistory(await r.json());
  }

  async function adjustPoints() {
    if (!selected) return;
    const raw = window.prompt("Cộng/trừ điểm (số nguyên, âm để trừ):");
    const points = Number(raw);
    if (!raw || !Number.isInteger(points) || points === 0) return;
    const r = await fetch("/api/customers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "adjust", customerId: selected.id, points }),
    });
    const d = await r.json();
    setMsg(r.ok ? `✅ Điểm mới: ${d.points}` : "❌ " + d.message);
    load(q); showHistory(selected);
  }

  async function birthdayReward() {
    if (!selected) return;
    const r = await fetch("/api/customers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "birthday_reward", customerId: selected.id }),
    });
    const d = await r.json();
    setMsg(r.ok ? `🎁 +${d.granted} điểm` : "❌ " + d.message);
    load(q); showHistory(selected);
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="p-6 grid grid-cols-[1fr_380px] gap-6 items-start">
        <section className="space-y-4">
          <div className="bg-white rounded-xl p-4 shadow-sm flex gap-2">
            <input className="border rounded px-3 py-2 flex-1" placeholder="Thêm khách: tên"
              value={name} onChange={(e) => setName(e.target.value)} />
            <input className="border rounded px-3 py-2 w-40" placeholder="SĐT"
              value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button className="bg-blue-600 text-white rounded px-4" onClick={create}>Thêm</button>
          </div>
          {msg && <p className="text-sm">{msg}</p>}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <input className="border rounded px-3 py-2 w-72 mb-3" placeholder="Tìm tên, SĐT, mã…"
              value={q} onChange={(e) => { setQ(e.target.value); load(e.target.value); }} />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="p-2">Mã</th><th>Tên</th><th>SĐT</th><th>Hạng</th><th className="text-right p-2">Điểm</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b cursor-pointer hover:bg-blue-50" onClick={() => showHistory(c)}>
                    <td className="p-2">{c.code}</td>
                    <td>{c.name}</td>
                    <td>{c.phone}</td>
                    <td>{c.loyalty?.tier ?? "—"}</td>
                    <td className="text-right p-2 font-medium">{c.loyalty?.points ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold mb-2">Lịch sử điểm {selected ? `— ${selected.name}` : ""}</h2>
          {!history ? <p className="text-sm text-slate-500">Chọn khách hàng để xem.</p> : (
            <>
              <p className="text-sm mb-2">Hiện có <b>{history.points}</b> điểm ({history.tier ?? "chưa có tài khoản"})</p>
              <div className="flex gap-2 mb-3">
                <button onClick={adjustPoints} className="border rounded px-3 py-1 text-xs hover:bg-blue-50">± Điểm</button>
                <button onClick={birthdayReward} className="border rounded px-3 py-1 text-xs hover:bg-blue-50">🎁 Quà sinh nhật</button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b"><th className="p-1">Ngày</th><th>Loại</th><th className="text-right">Điểm</th><th className="text-right p-1">Số dư</th></tr>
                </thead>
                <tbody>
                  {history.transactions.map((t) => (
                    <tr key={t.id} className="border-b">
                      <td className="p-1 text-xs">{new Date(t.createdAt).toLocaleString("vi-VN")}</td>
                      <td className={t.points >= 0 ? "text-green-700" : "text-red-600"}>{t.type}</td>
                      <td className="text-right">{t.points > 0 ? "+" : ""}{t.points}</td>
                      <td className="text-right p-1">{t.balanceAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {history.transactions.length === 0 && <p className="text-sm text-slate-500 mt-2">Chưa có giao dịch.</p>}
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
