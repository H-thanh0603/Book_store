// MISA export endpoint. Streams a zip with three files:
//   SalesInvoice.csv   — line items per order
//   GeneralLedger.csv  — revenue per order
//   manifest.json      — counts + date range for audit
//
// GET /api/exports/misa?from=YYYY-MM-DD&to=YYYY-MM-DD&orgId=...
//
// - Permission: invoices.read (accounting role).
// - Multi-tenant: orgId query param must match the caller's org; the
//   helper below rejects mismatches with 403.
// - Zip is store-only (no compression); MISA's importer on the
//   bookkeeper's side just unzips into a temp folder anyway.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, optDate } from "@/lib/api";
import { assertSameOrg } from "@/lib/org-scope";
import { buildGeneralLedgerCsv, buildManifest, buildSalesInvoiceCsv, toMisaDate } from "@/lib/exports/misa";
import { buildZip } from "@/lib/exports/misa-zip";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("invoices.read");
    const url = req.nextUrl;
    const from = optDate(url.searchParams.get("from"), "from");
    const to = optDate(url.searchParams.get("to"), "to");
    if (!from || !to) {
      return ok({ error: "VALIDATION", message: "from and to are required (YYYY-MM-DD)" }, 400);
    }
    if (from > to) {
      return ok({ error: "VALIDATION", message: "from must be <= to" }, 400);
    }
    // Default to caller's org; explicit orgId must match.
    const claimed = url.searchParams.get("orgId");
    assertSameOrg(auth, claimed ?? auth.orgId);
    const orgId = auth.orgId;
    if (!orgId) return ok({ error: "VALIDATION", message: "caller has no org" }, 400);

    const [salesCsv, glCsv, salesOrders, glOrders] = await Promise.all([
      buildSalesInvoiceCsv({ from, to, orgId }),
      buildGeneralLedgerCsv({ from, to, orgId }),
      prisma.order.count({
        where: {
          store: { region: { orgId } },
          createdAt: { gte: from, lte: to },
          status: { in: ["CONFIRMED", "PAID", "SHIPPED", "DELIVERED"] },
        },
      }),
      prisma.order.count({
        where: {
          store: { region: { orgId } },
          createdAt: { gte: from, lte: to },
          status: { in: ["CONFIRMED", "PAID", "SHIPPED", "DELIVERED"] },
        },
      }),
    ]);
    const manifest = buildManifest({
      generatedAt: new Date().toISOString(),
      orgId,
      from: toMisaDate(from),
      to: toMisaDate(to),
      rows: { salesInvoice: salesOrders, generalLedger: glOrders },
    });

    const zip = buildZip([
      { name: "SalesInvoice.csv", data: Buffer.from(salesCsv, "utf8") },
      { name: "GeneralLedger.csv", data: Buffer.from(glCsv, "utf8") },
      { name: "manifest.json", data: Buffer.from(manifest, "utf8") },
    ]);

    const stamp = `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
    return new Response(new Uint8Array(zip), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="misa_${stamp}.zip"`,
        "x-misa-orders": String(salesOrders),
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
