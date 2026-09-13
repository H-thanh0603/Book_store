"use client";
import { useCallback, useEffect, useState } from "react";
import Nav from "../nav";
import { Users, Plus, AlertCircle, CheckCircle2 } from "lucide-react";

type Member = {
  id: string;
  email: string;
  active: boolean;
  createdAt: string;
  roles: { storeId: string | null; role: { name: string } }[];
};

const ROLES = ["cashier", "sales", "warehouse", "store_manager", "purchasing", "accountant", "marketing"];

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", role: "cashier", storeId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tm, st] = await Promise.all([fetch("/api/team/invite"), fetch("/api/stores")]);
      const td = await tm.json();
      if (tm.ok) setMembers(td.users ?? []);
      else setMsg({ text: td.message ?? "Không tải được nhân sự (cần quyền admin)", type: "error" });
      if (st.ok) setStores((await st.json()).stores ?? []);
    } catch {
      setMsg({ text: "Lỗi mạng", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function invite() {
    if (!form.email.trim() || form.password.length < 10) {
      setMsg({ text: "Email hợp lệ + mật khẩu tối thiểu 10 ký tự", type: "error" });
      return;
    }
    const r = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-check": "1" },
      body: JSON.stringify({
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        ...(form.storeId ? { storeId: form.storeId } : {}),
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ text: `Đã thêm ${d.email} (${d.role})`, type: "success" });
      setShowForm(false);
      setForm({ email: "", password: "", role: "cashier", storeId: "" });
      void load();
    } else setMsg({ text: d.message ?? "Lỗi", type: "error" });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <header className="flex items-center gap-3 mb-6">
          <Users className="w-7 h-7 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">Nhân sự</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 px-4 py-2 bg-slate-800 text-white rounded text-sm hover:bg-slate-700"
          >
            <Plus className="w-4 h-4" /> Mời nhân viên
          </button>
        </header>

        {msg && (
          <div className={`mb-4 flex items-center gap-2 rounded border px-3 py-2 text-sm ${msg.type === "success" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-rose-700 bg-rose-50 border-rose-200"}`}>
            {msg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />} {msg.text}
          </div>
        )}

        {showForm && (
          <div className="bg-white border rounded p-5 mb-6">
            <h2 className="font-semibold text-slate-800 mb-3">Mời nhân viên mới</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Email"
                aria-label="Email"
                className="border rounded px-3 py-2 text-sm"
              />
              <input
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Mật khẩu tạm (≥10 ký tự)"
                type="password"
                aria-label="Mật khẩu tạm"
                className="border rounded px-3 py-2 text-sm"
              />
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} aria-label="Vai trò" className="border rounded px-3 py-2 text-sm">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })} aria-label="Chi nhánh (tùy chọn)" className="border rounded px-3 py-2 text-sm">
                <option value="">Toàn hệ thống</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <p className="text-xs text-slate-500 mt-2">Không thể cấp owner/admin qua form này. Nhân viên nên đổi mật khẩu sau lần đăng nhập đầu.</p>
            <button onClick={invite} className="mt-3 px-4 py-2 bg-slate-800 text-white rounded text-sm hover:bg-slate-700">
              Gửi lời mời
            </button>
          </div>
        )}

        <div className="bg-white border rounded p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Thành viên ({members.length})</h2>
          {loading ? (
            <div className="animate-pulse text-sm text-slate-400" aria-busy="true">Đang tải…</div>
          ) : members.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có thành viên nào.</p>
          ) : (
            <ul className="divide-y">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 py-2">
                  <span className="flex-1 text-sm text-slate-800">
                    {m.email}
                    {!m.active && <span className="ml-2 text-xs text-rose-600">(đã khóa)</span>}
                  </span>
                  <span className="text-xs text-slate-500">
                    {m.roles.map((r) => `${r.role.name}${r.storeId ? " @chi nhánh" : ""}`).join(", ") || "chưa có vai trò"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
