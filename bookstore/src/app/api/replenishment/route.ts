import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { audit, requirePermission } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { applySuggestionDecision, generateReplenishmentSuggestions } from "@/lib/replenishment";

export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId") ?? undefined;
    const auth = await requirePermission("reports.store.view", storeId);
    const hasGlobalScope = auth.roles.some((role) => role.permissions.includes("reports.store.view") && role.storeId === null);
    const scopedStoreIds = auth.roles.filter((role) => role.permissions.includes("reports.store.view") && role.storeId).map((role) => role.storeId!);
    const locationScope = storeId ? { storeId } : hasGlobalScope ? undefined : { storeId: { in: scopedStoreIds } };
    const suggestions = await prisma.replenishmentSuggestion.findMany({
      where: {
        recommendedQty: { gt: 0 },
        location: {
          ...locationScope,
          // P0-3: suggestions were readable across tenants.
          ...(auth.orgId ? { OR: [{ store: { orgId: auth.orgId } }, { storeId: null }] } : {}),
        },
        ...(auth.orgId ? { variant: { orgId: auth.orgId } } : {}),
      },
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
    const auth = await requirePermission("purchase.create");
    if (body.action === "generate") return ok({ suggestions: await generateReplenishmentSuggestions(auth.orgId) });
    if (!body.suggestionId || !["ACCEPTED", "DISMISSED"].includes(body.status))
      fail(400, "VALIDATION", "Use action=generate or provide suggestionId and ACCEPTED/DISMISSED status");

    // Atomic accept/dismiss lives in lib/replenishment.ts so the staged-change
    // approval surface applies the exact same flow.
    const { suggestionId, status, created } = await applySuggestionDecision(
      body.suggestionId, body.status, auth,
    );

    await audit(auth.userId, body.status === "ACCEPTED" ? "suggestion.accept" : "suggestion.dismiss",
      "replenishment_suggestion", suggestionId, { created: created?.number ? created : undefined });
    return ok({ id: suggestionId, status, created });
  } catch (err) {
    return apiError(err);
  }
}
