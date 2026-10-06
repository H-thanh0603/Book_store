// Design tokens + number formatting shared by the email templates.
export const COLORS = {
  primary: "#4f46e5", // indigo-600
  success: "#059669", // emerald-600
  text: "#1e293b",    // slate-800
  muted: "#64748b",   // slate-500
  bg: "#f8fafc",      // slate-50
  border: "#e2e8f0",  // slate-200
} as const;

export function fmt(n: number) {
  return n.toLocaleString("vi-VN");
}
