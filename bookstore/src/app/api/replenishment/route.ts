import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertStoreAccess, audit, requirePermission } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { generateReplenishmentSuggestions } from "@/lib/replenishment";
import { createPurchaseOrder, createTransfer } from "@/lib/purchasing";
import { SuggestionStatus } from "@/generated/prisma/client";

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
    const auth = await requirePermission("purchase.create");
    if (body.action === "generate") return ok({ suggestions: await generateReplenishmentSuggestions() });
    if (!body.suggestionId || !["ACCEPTED", "DISMISSED"].includes(body.status))
      fail(400, "VALIDATION", "Use action=generate or provide suggestionId and ACCEPTED/DISMISSED status");

    const suggestion = await prisma.replenishmentSuggestion.findUnique({
      where: { id: body.suggestionId },
      include: { variant: true, location: true },
    });
    if (!suggestion) fail(404, "NOT_FOUND", "Suggestion not found");
    // Store scope: the caller must cover the suggestion's own location.
    assertStoreAccess(auth, suggestion.location.storeId, "purchase.create");

    // Accepting a suggestion is approval-backed: it materializes the recommendation
    // as a draft transfer (store balancing) or pending_approval PO (purchase).
    // The status claim below is atomic: only ONE accept/dismiss ever creates work
    // for a suggestion — double submits get a 409 instead of duplicate POs/transfers.
    const created = await prisma.$transaction(async (tx) => {
      const claimed = await tx.replenishmentSuggestion.updateMany({
        where: { id: suggestion.id, status: SuggestionStatus.OPEN },
        data: { status: body.status },
      });
      if (claimed.count !== 1)
        fail(409, "INVALID_STATUS_TRANSITION", `Suggestion is ${suggestion.status}, not OPEN`);

      let result: { kind: string; number?: string; id: string } | null = null;
      if (body.status === "ACCEPTED" && suggestion.recommendedQty > 0) {
        const balancedFrom = (suggestion.rationale as { balancedFrom?: { locationId: string; qty: number } }).balancedFrom;
        if (balancedFrom) {
          const sourceLoc = await tx.stockLocation.findUnique({ where: { id: balancedFrom.locationId } });
          if (!sourceLoc) fail(400, "VALIDATION", "Balancing source location no longer exists");
          assertStoreAccess(auth, sourceLoc.storeId, "purchase.create");
          const transfer = await createTransfer({
            fromLocationId: balancedFrom.locationId,
            toLocationId: suggestion.locationId,
            requestedBy: auth.userId,
            items: [{ variantId: suggestion.variantId, quantity: Math.min(balancedFrom.qty, suggestion.recommendedQty) }],
            client: tx,
          });
          result = { kind: "transfer", number: transfer.number, id: transfer.id };
        } else {
          // ponytail: central warehouse + latest supplier price cost. Route by store or
          // cheapest supplier once multi-warehouse purchasing lands.
          const warehouse = await tx.warehouse.findFirst({ where: { isCentral: true } })
            ?? await tx.warehouse.findFirst();
          const price = await tx.supplierProductPrice.findFirst({
            where: { variantId: suggestion.variantId }, orderBy: { recordedAt: "desc" },
          });
          if (!warehouse || !price) fail(400, "VALIDATION", "No warehouse or supplier price to source this PO");
          const po = await createPurchaseOrder({
            supplierId: price.supplierId,
            warehouseId: warehouse.id,
            userId: auth.userId,
            items: [{ variantId: suggestion.variantId, quantity: suggestion.recommendedQty, unitCost: price.unitCost }],
            client: tx,
          });
          result = { kind: "po", number: po.number, id: po.id };
        }
      }
      return result;
    });

    await audit(auth.userId, body.status === "ACCEPTED" ? "suggestion.accept" : "suggestion.dismiss",
      "replenishment_suggestion", suggestion.id, { created: created?.number ? created : undefined });
    return ok({ id: suggestion.id, status: body.status, created });
  } catch (err) {
    return apiError(err);
  }
}
