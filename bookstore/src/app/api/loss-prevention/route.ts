import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { scanLossPrevention } from "@/lib/loss-prevention";

export async function GET() {
  try {
    await requirePermission("reports.financial.view");
    const alerts = await prisma.lossAlert.findMany({ orderBy: { detectedAt: "desc" }, take: 200 });
    return ok({ alerts });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("reports.financial.view");
    const body = await req.json();
    if (body.action === "scan") return ok({ alerts: await scanLossPrevention() });
    if (body.action !== "review" || !body.alertId || !["REVIEWED", "DISMISSED"].includes(body.status))
      fail(400, "VALIDATION", "Use action=scan or provide alertId and REVIEWED/DISMISSED status");
    const alert = await prisma.lossAlert.update({
      where: { id: body.alertId },
      data: { status: body.status, reviewedAt: new Date(), reviewedBy: auth.userId },
    });
    return ok({ id: alert.id, status: alert.status });
  } catch (err) {
    return apiError(err);
  }
}
