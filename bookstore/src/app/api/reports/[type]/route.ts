// GET /api/reports/[type]?from=YYYY-MM-DD&to=YYYY-MM-DD&storeId=...&format=json|csv
//
// type ∈ revenue-by-store | revenue-by-category | top-sku | stock-on-hand
// Permission: reports.financial.view. The orgId comes from the auth
// context (no body override path), so cross-tenant reads are impossible.
// CSV uses the same UTF-8 BOM + CRLF as the MISA export so Excel-VN
// opens both files identically.

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, optDate } from "@/lib/api";
import { reportTypes, toCsv, type ReportParams, type ReportResult } from "@/lib/reports";

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  try {
    const auth = await requirePermission("reports.financial.view");
    if (!auth.orgId) return ok({ error: "VALIDATION", message: "caller has no org" }, 400);
    const { type } = await params;
    const fn = (reportTypes as Record<string, (p: ReportParams) => Promise<ReportResult>>)[type];
    if (!fn) return ok({ error: "VALIDATION", message: `unknown report type: ${type}` }, 400);

    const sp = req.nextUrl.searchParams;
    const from = optDate(sp.get("from"), "from");
    const to = optDate(sp.get("to"), "to");
    if (!from || !to) return ok({ error: "VALIDATION", message: "from and to are required (YYYY-MM-DD)" }, 400);
    if (from > to) return ok({ error: "VALIDATION", message: "from must be <= to" }, 400);
    const storeId = sp.get("storeId") || undefined;
    const result = await fn({ from, to, orgId: auth.orgId, storeId });

    const format = sp.get("format");
    if (format === "csv") {
      const csv = toCsv(result);
      const stamp = `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
      return new Response(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${type}_${stamp}.csv"`,
        },
      });
    }
    return NextResponse.json({ type, from, to, storeId: storeId ?? null, ...result });
  } catch (err) {
    return apiError(err);
  }
}
