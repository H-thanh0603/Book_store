// Per-org loss-prevention rule editor. Owner/staff can adjust the
// four thresholds (LARGE_REFUND, EXCESSIVE_DISCOUNT, CASH_VARIANCE,
// STOCK_SHRINKAGE) without dev help. Effective threshold (per-org
// rule OR SystemConfig OR hard default) shown alongside so it's
// obvious what's actually being enforced.

"use client";
import { useEffect, useState } from "react";
import Nav from "../../nav";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ShieldAlert, AlertCircle, Loader2, RotateCcw, Save } from "lucide-react";

type Kind = "LARGE_REFUND" | "EXCESSIVE_DISCOUNT" | "CASH_VARIANCE" | "STOCK_SHRINKAGE";
type Effective = { kind: Kind; threshold: number; isOverride: boolean };
type Override = { id: string; kind: Kind; threshold: number; active: boolean };
type Draft = { threshold: string; active: boolean; id: string | null };

const META: Record<Kind, { label: string; unit: string; hint: string }> = {
  LARGE_REFUND: { label: "Hoàn tiền lớn", unit: "đ", hint: "Phiếu trả hàng có tổng hoàn tiền ≥ ngưỡng sẽ tạo cảnh báo HIGH." },
  EXCESSIVE_DISCOUNT: { label: "Chiết khấu quá cao", unit: "%", hint: "Giao dịch POS có chiết khấu/tổng ≥ ngưỡng (%) sẽ bị cảnh báo." },
  CASH_VARIANCE: { label: "Chênh lệch tiền cuối ca", unit: "đ", hint: "Đóng ca có |lệch| ≥ ngưỡng sẽ bị cảnh báo." },
  STOCK_SHRINKAGE: { label: "Hao hụt tồn kho", unit: "cuốn", hint: "Phiếu kho LOST/STOCK_ADJUST có |số lượng| ≥ ngưỡng sẽ bị cảnh báo." },
};

export default function LossPreventionPage() {
  const [effective, setEffective] = useState<Effective[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [drafts, setDrafts] = useState<Partial<Record<Kind, Draft>>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savedKind, setSavedKind] = useState<Kind | null>(null);
  const [pendingReset, setPendingReset] = useState<Kind | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/loss-prevention/rules");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = (await r.json()) as { effective: Effective[]; overrides: Override[] };
      setEffective(d.effective); setOverrides(d.overrides);
      const next: Partial<Record<Kind, Draft>> = {};
      for (const e of d.effective) {
        const ov = d.overrides.find((o) => o.kind === e.kind);
        next[e.kind] = { threshold: String(ov?.threshold ?? e.threshold), active: ov?.active ?? false, id: ov?.id ?? null };
      }
      setDrafts(next);
    } catch (e) { setErr(e instanceof Error ? e.message : "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function updateDraft(kind: Kind, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [kind]: { threshold: "0", active: false, id: null, ...prev[kind], ...patch } }));
  }

  async function save(kind: Kind) {
    const d = drafts[kind];
    if (!d) return;
    const num = Number(d.threshold);
    if (!Number.isFinite(num) || num < 0) { setErr(kind + ": ngưỡng phải là số không âm"); return; }
    setErr(null);
    const res = d.id
      ? await fetch("/api/loss-prevention/rules/" + d.id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ threshold: num, active: d.active }) })
      : await fetch("/api/loss-prevention/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, threshold: num, active: d.active }) });
    if (!res.ok) { setErr("Lưu " + kind + " thất bại: HTTP " + res.status); return; }
    setSavedKind(kind); setTimeout(() => setSavedKind(null), 1500); load();
  }

  async function reset(kind: Kind) {
    const d = drafts[kind];
    if (!d?.id) {
      updateDraft(kind, { threshold: String(effective.find((e) => e.kind === kind)?.threshold ?? 0), active: false });
      return;
    }
    const res = await fetch("/api/loss-prevention/rules/" + d.id, { method: "DELETE" });
    if (!res.ok) { setErr("Xoá " + kind + " thất bại: HTTP " + res.status); return; }
    load();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <header className="flex items-center gap-3 mb-2">
          <ShieldAlert className="w-7 h-7 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800">Ngưỡng chống thất thoát</h1>
        </header>
        <p className="text-sm text-slate-500 mb-6">Điều chỉnh ngưỡng cảnh báo cho tổ chức của bạn. Không bật = dùng mặc định hệ thống.</p>
        {err && (
          <div className="mb-4 flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 text-sm">
            <AlertCircle className="w-4 h-4" /> {err}
          </div>
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Đang tải...</div>
        ) : (
          <div className="bg-white border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 text-left">
                <tr>
                  <th className="px-3 py-2">Quy tac</th>
                  <th className="px-3 py-2 w-40">Nguong override</th>
                  <th className="px-3 py-2 w-32">Dang ap dung</th>
                  <th className="px-3 py-2 w-24">Bat</th>
                  <th className="px-3 py-2 w-44"></th>
                </tr>
              </thead>
              <tbody>
                {effective.map((e) => {
                  const d = drafts[e.kind];
                  const m = META[e.kind];
                  return (
                    <tr key={e.kind} className="border-t align-middle">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{m.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{m.hint}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <input type="number" min={0} value={d?.threshold ?? ""} onChange={(ev) => updateDraft(e.kind, { threshold: ev.target.value })} className="w-24 border rounded px-2 py-1 text-sm font-mono" />
                          <span className="text-xs text-slate-500">{m.unit}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-sm font-mono">{e.threshold.toLocaleString("vi-VN")} {m.unit}</div>
                        <div className="text-[11px] text-slate-500">{e.isOverride ? "override" : "mặc định"}</div>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => updateDraft(e.kind, { active: !(d?.active ?? false) })} aria-label={`${d?.active ? "Tắt" : "Bật"} quy tắc ${m.label}`} className={"px-2 py-0.5 rounded text-xs border " + (d?.active ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-white text-slate-700 border-slate-300")}>
                          {d?.active ? "BẬT" : "TẮT"}
                        </button>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button onClick={() => save(e.kind)} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#8c2d19] text-white rounded text-xs hover:bg-[#7a2816]">
                          <Save className="w-3 h-3" /> Lưu
                        </button>
                        <button onClick={() => { if (!drafts[e.kind]?.id) reset(e.kind); else setPendingReset(e.kind); }} className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded text-xs hover:bg-slate-200" title="Xoá override, dùng mặc định">
                          <RotateCcw className="w-3 h-3" /> Reset
                        </button>
                        {savedKind === e.kind && <span className="ml-2 text-xs text-emerald-600">Đã lưu</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {overrides.length > 0 && (
          <p className="text-xs text-slate-500 mt-3">{overrides.length} override đang hoạt động cho tổ chức này.</p>
        )}
      </main>
      <ConfirmDialog
        request={pendingReset ? {
          title: `Xoá override “${META[pendingReset].label}”?`,
          body: "Ngưỡng sẽ quay về mặc định hệ thống. Thay đổi có hiệu lực ngay cho các giao dịch mới.",
          confirmLabel: "Xoá override",
        } : null}
        onConfirm={() => { if (pendingReset) void reset(pendingReset); setPendingReset(null); }}
        onCancel={() => setPendingReset(null)}
      />
    </div>
  );
}
