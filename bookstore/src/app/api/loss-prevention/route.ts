import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { requireOrgId } from "@/lib/org-scope";
import { apiError, fail, ok } from "@/lib/api";
import { scanLossPrevention } from "@/lib/loss-prevention";

export async function GET() {
  try {
    const auth = await requirePermission("reports.financial.view");
    const orgId = requireOrgId(auth);
    const alerts = await prisma.lossAlert.findMany({
      where: { orgId },
      orderBy: { detectedAt: "desc" },
      take: 200,
    });
    return ok({ alerts });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("reports.financial.view");
    const orgId = requireOrgId(auth);
    const body = await req.json();
    if (body.action === "scan") return ok({ alerts: await scanLossPrevention(orgId) });
    if (body.action !== "review" || !body.alertId || !["REVIEWED", "DISMISSED"].includes(body.status))
      fail(400, "VALIDATION", "Use action=scan or provide alertId and REVIEWED/DISMISSED status");
    const updated = await prisma.lossAlert.updateMany({
      where: { id: body.alertId, orgId },
      data: { status: body.status, reviewedAt: new Date(), reviewedBy: auth.userId },
    });
    if (updated.count !== 1) fail(404, "NOT_FOUND", "Loss alert not found");
    return ok({ id: body.alertId, status: body.status });
  } catch (err) {
    return apiError(err);
  }
}
