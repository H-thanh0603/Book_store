import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { audit, requirePermission } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { generateReplenishmentSuggestions } from "@/lib/replenishment";
import { createPurchaseOrder, createTransfer } from "@/lib/purchasing";

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
    if (!body.suggestionId || !["ACCEPTED", "DISMISSED"].includes(body.status))
      fail(400, "VALIDATION", "Use action=generate or provide suggestionId and ACCEPTED/DISMISSED status");

    const suggestion = await prisma.replenishmentSuggestion.findUnique({
      where: { id: body.suggestionId },
      include: { variant: true, location: true },
    });
    if (!suggestion) fail(404, "NOT_FOUND", "Suggestion not found");

    // Accepting a suggestion is approval-backed: it materializes the recommendation
    // as a draft transfer (store balancing) or pending_approval PO (purchase).
    let created: { kind: string; number?: string; id: string } | null = null;
    if (body.status === "ACCEPTED" && suggestion.recommendedQty > 0) {
      const balancedFrom = (suggestion.rationale as { balancedFrom?: { locationId: string; qty: number } }).balancedFrom;
      if (balancedFrom) {
        const transfer = await createTransfer({
          fromLocationId: balancedFrom.locationId,
          toLocationId: suggestion.locationId,
          requestedBy: "replenishment",
          items: [{ variantId: suggestion.variantId, quantity: Math.min(balancedFrom.qty, suggestion.recommendedQty) }],
        });
        created = { kind: "transfer", number: transfer.number, id: transfer.id };
      } else {
        // ponytail: central warehouse + latest supplier price cost. Route by store or
        // cheapest supplier once multi-warehouse purchasing lands.
        const warehouse = await prisma.warehouse.findFirst({ where: { isCentral: true } })
          ?? await prisma.warehouse.findFirst();
        const price = await prisma.supplierProductPrice.findFirst({
          where: { variantId: suggestion.variantId }, orderBy: { recordedAt: "desc" },
        });
        if (!warehouse || !price) fail(400, "VALIDATION", "No warehouse or supplier price to source this PO");
        const po = await createPurchaseOrder({
          supplierId: price.supplierId,
          warehouseId: warehouse.id,
          userId: "replenishment",
          items: [{ variantId: suggestion.variantId, quantity: suggestion.recommendedQty, unitCost: price.unitCost }],
        });
        created = { kind: "po", number: po.number, id: po.id };
      }
    }

    const updated = await prisma.replenishmentSuggestion.update({
      where: { id: suggestion.id }, data: { status: body.status },
    });
    await audit("replenishment", body.status === "ACCEPTED" ? "suggestion.accept" : "suggestion.dismiss",
      "replenishment_suggestion", suggestion.id, { created });
    return ok({ id: updated.id, status: updated.status, created });
  } catch (err) {
    return apiError(err);
  }
}
