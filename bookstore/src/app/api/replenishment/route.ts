import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { generateReplenishmentSuggestions } from "@/lib/replenishment";

export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId") ?? undefined;
    const auth = await requirePermission("reports.store.view", storeId);
    const hasGlobalScope = auth.roles.some((role) => role.permissions.includes("reports.store.view") && role.storeId === null);
    const scopedStoreIds = auth.roles.filter((role) => role.permissions.includes("reports.store.view") && role.storeId).map((role) => role.storeId!);
    const locationScope = storeId ? { storeId } : hasGlobalScope ? undefined : { storeId: { in: scopedStoreIds } };
    const suggestions = await prisma.replenishmentSuggestion.findMany({
      where: { recommendedQty: { gt: 0 }, location: locationScope },
      include: { variant: { include: { product: true } }, location: true },
      orderBy: { recommendedQty: "desc" }, take: 500,
    });
    return ok({ suggestions });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await requirePermission("purchase.create");
    if (body.action === "generate") return ok({ suggestions: await generateReplenishmentSuggestions() });
    if (!["ACCEPTED", "DISMISSED"].includes(body.status) || !body.suggestionId)
      fail(400, "VALIDATION", "Use action=generate or provide suggestionId and ACCEPTED/DISMISSED status");
    const suggestion = await prisma.replenishmentSuggestion.update({
      where: { id: body.suggestionId }, data: { status: body.status },
    });
    return ok({ id: suggestion.id, status: suggestion.status });
  } catch (err) {
    return apiError(err);
  }
}
