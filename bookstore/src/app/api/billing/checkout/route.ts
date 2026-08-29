// POST /api/billing/checkout - issues a new BillingInvoice (or reuses
// the PENDING one for the current period) and returns the VNPay URL.
// settings.write is the right permission: only the owner should be
// able to spend on behalf of the org.
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { issueCycleInvoice } from "@/lib/billing";
import { clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.write");
    if (!auth.orgId) return ok({ code: "VALIDATION", message: "caller has no org" }, 400);
    const result = await issueCycleInvoice(auth.orgId, clientIp(req.headers), req.nextUrl.origin);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
