"use client";
import { useEffect, useState } from "react";
import Nav from "../nav";
import {
  Activity,
  ShieldAlert,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Server,
  EyeOff,
  AlertCircle,
} from "lucide-react";

type Run = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  error: string | null;
  createdAt: string;
};
type Alert = {
  id: string;
  rule: string;
  severity: string;
  message: string;
  detectedAt: string;
};

export default function ReportsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [jobs, loss] = await Promise.all([fetch("/api/jobs"), fetch("/api/loss-prevention")]);
      if (jobs.ok) setRuns((await jobs.json()).runs);
      else setErr((await jobs.json()).message ?? "Lỗi tải tác vụ nền");
      if (loss.ok) setAlerts((await loss.json()).alerts);
    } catch {
      setErr("Lỗi kết nối máy chủ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function retry(runId: string) {
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "retry", runId }),
    });
    void load();
  }

  async function dismiss(alertId: string) {
    await fetch("/api/loss-prevention", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "review", alertId, status: "DISMISSED" }),
    });
    void load();
  }

  const failedJobsCount = runs.filter((r) => r.status === "FAILED").length;
  const highAlertsCount = alerts.filter((a) => a.severity === "HIGH").length;

  return (
    <main className="min-h-screen bg-slate-50/60 pb-16">
      <Nav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Header bar */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Vận Hành Hệ Thống &amp; Cảnh Báo Gian Lận / Thất Thoát
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                <Sparkles className="w-3 h-3" />
                Operations &amp; Security
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Giám sát các tác vụ đồng bộ nền tự động (Background Cron Jobs) và phát hiện bất thường thu ngân / tồn kho
            </p>
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shrink-0"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới trạng thái
          </button>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-indigo-600" />
              Tổng tác vụ nền
            </span>
            <p className="text-2xl font-black text-slate-900 mt-1">{runs.length}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-rose-600 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              Tác vụ lỗi (Failed)
            </span>
            <p className="text-2xl font-black text-rose-700 mt-1">{failedJobsCount}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              Cảnh báo thất thoát
            </span>
            <p className="text-2xl font-black text-slate-900 mt-1">{alerts.length}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-rose-600 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              Cảnh báo mức cao (High)
            </span>
            <p className="text-2xl font-black text-rose-700 mt-1">{highAlertsCount}</p>
          </div>
        </div>

        {err && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {/* Section 1: Background Cron Jobs */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-sm">Tác Vụ Xử Lý Nền Định Kỳ (Scheduled Jobs)</h2>
              <p className="text-[11px] text-slate-400">Đồng bộ tồn kho, gửi báo cáo, tính điểm thưởng</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                <tr>
                  <th className="p-4">Loại tác vụ (Job Kind)</th>
                  <th className="p-4">Trạng thái</th>
                  <th className="p-4">Số lần thử</th>
                  <th className="p-4">Thông báo lỗi / Logs</th>
                  <th className="p-4">Thời gian chạy</th>
                  <th className="p-4 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4 font-mono font-bold text-slate-900">{run.kind}</td>
                    <td className="p-4">
                      {run.status === "FAILED" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <AlertTriangle className="w-3 h-3" />
                          Thất bại
                        </span>
                      ) : run.status === "COMPLETED" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Thành công
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          <Clock className="w-3 h-3" />
                          {run.status}
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-medium text-slate-700">{run.attempts} lần</td>
                    <td className="p-4 max-w-xs truncate text-slate-600 font-mono text-[11px]" title={run.error ?? ""}>
                      {run.error ? <span className="text-rose-600">{run.error}</span> : "—"}
                    </td>
                    <td className="p-4 text-slate-500">
                      {new Date(run.createdAt).toLocaleString("vi-VN")}
                    </td>
                    <td className="p-4 text-right">
                      {run.status === "FAILED" && (
                        <button
                          onClick={() => retry(run.id)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold transition-colors"
                        >
                          <RotateCw className="w-3 h-3" />
                          Chạy lại
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {runs.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Server className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Chưa có tác vụ nền nào được ghi nhận.
            </div>
          )}
        </div>

        {/* Section 2: Loss Prevention Alerts */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-sm">Cảnh Báo Chống Thất Thoát (Loss Prevention AI)</h2>
              <p className="text-[11px] text-slate-400">Phát hiện bất thường trong huỷ đơn, giảm giá quá mức, chênh lệch quỹ tiền</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                <tr>
                  <th className="p-4">Quy tắc cảnh báo</th>
                  <th className="p-4">Mức độ rủi ro</th>
                  <th className="p-4">Nội dung chi tiết</th>
                  <th className="p-4">Thời gian phát hiện</th>
                  <th className="p-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alerts.map((alert) => {
                  const isHigh = alert.severity === "HIGH";
                  return (
                    <tr key={alert.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-4 font-bold text-slate-900">{alert.rule}</td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isHigh
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          {alert.severity}
                        </span>
                      </td>
                      <td className="p-4 text-slate-700 font-medium">{alert.message}</td>
                      <td className="p-4 text-slate-500">
                        {new Date(alert.detectedAt).toLocaleString("vi-VN")}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => dismiss(alert.id)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                        >
                          <EyeOff className="w-3 h-3" />
                          Bỏ qua
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {alerts.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-xs">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" />
              Hệ thống an toàn, không có cảnh báo bất thường nào.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
