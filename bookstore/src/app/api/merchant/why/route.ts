// Why-analysis funnel: revenue → orders → SKU decliners → stockout hypothesis.
// Staff only (reports.store.view). Evidence-backed, never vibes — the model
// quotes hypothesis + topDecliners, the UI shows the funnel numbers.
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { whyRevenueChanged } from "@/lib/merchant-anomaly";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("reports.store.view");
    const days = Number(req.nextUrl.searchParams.get("days")) || 7;
    if (![7, 14, 30].includes(days)) fail(400, "VALIDATION", "days phải là 7, 14 hoặc 30");
    return ok(await whyRevenueChanged({ orgId: auth.orgId }, days));
  } catch (err) {
    return apiError(err);
  }
}
