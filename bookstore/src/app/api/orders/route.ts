import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertStoreAccess, requirePermission, resolveStoreScope } from "@/lib/auth";
import { apiError, ok, fail, optPage } from "@/lib/api";
import { createReservedOrder, type CreateOrderInput } from "@/lib/orders";
import type { OrderStatus } from "@/generated/prisma/client";

// POST /api/orders — create order (WEB/APP), reserve stock at store/warehouse
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = await requirePermission("pos.sell");
    // Resolve scope explicitly — passing client-controlled storeId into
    // requirePermission would skip the binding when omitted (auth.ts treats
    // undefined as "caller clamps later"). Here we clamp/verify up front.
    const scope = resolveStoreScope(auth, body.storeId ?? undefined, "pos.sell");

    let locationStoreId: string | null | undefined;
    if (body.locationId) {
      const loc = await prisma.stockLocation.findUnique({
        where: { id: body.locationId }, select: { storeId: true },
      });
      if (!loc) fail(404, "NOT_FOUND", "Fulfillment location not found");
      // Warehouse locations (storeId null) are org-wide; store-scoped callers
      // may only reserve at their own stores.
      assertStoreAccess(auth, loc.storeId, "pos.sell");
      locationStoreId = loc.storeId;
    }
    // Scoped callers must name an in-scope store or an in-scope location —
    // never fall through to the org-wide warehouse default.
    if (scope !== null && !body.storeId && !body.locationId)
      fail(400, "VALIDATION", "storeId or locationId is required for your role");
    const effectiveStoreId = (body.storeId ?? locationStoreId ?? null) as string | null;

    const result = await createReservedOrder({
      channel: body.channel ?? "WEB", type: body.type, storeId: effectiveStoreId,
      customerId: body.customerId, locationId: body.locationId, couponCode: body.couponCode,
      items: body.items,
    } as CreateOrderInput, auth.userId);
    return ok({ number: result.number, status: result.status }, 201);
  } catch (err) {
    return apiError(err);
  }
}

// GET /api/orders — scoped to caller's stores
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const auth = await requirePermission("reports.store.view");
    const scope = resolveStoreScope(auth, sp.get("storeId") ?? undefined, "reports.store.view");
    // Tenant isolation (#7): storeId scoping alone is not enough — an
    // org-wide role (scope null) must still never see other orgs' orders.
    // Store is nullable (warehouse orders), so OR both paths under org.
    // Legacy org-less callers are denied: an empty filter would list every tenant.
    if (!auth.orgId) fail(403, "FORBIDDEN", "Order listing requires an org-scoped account");
    // L2 server filter: the old client-side search/status filter ran over the
    // current page only — page 2+ rows never matched. Filter here instead.
    const q = (sp.get("q") ?? "").trim().slice(0, 80);
    const status = sp.get("status") ?? "ALL";
    const statusGroups: Record<string, OrderStatus[]> = {
      PROCESSING: ["PAID", "CONFIRMED", "ALLOCATED", "PICKING", "PACKED", "READY"],
      SHIPPED: ["SHIPPED"], DELIVERED: ["DELIVERED"], CANCELLED: ["CANCELLED"],
    };
    const orgFilter = {
      OR: [
        { store: { region: { orgId: auth.orgId } } },
        { storeId: null, customer: { orgId: auth.orgId } },
      ],
    };
    // NOTE: a single `where` object can't hold two OR keys — the search OR
    // must nest inside AND with the org filter, not beside it.
    const where = {
      AND: [
        orgFilter,
        ...(scope ? [{ storeId: { in: scope } }] : []),
        ...(q ? [{
          OR: [
            { number: { contains: q, mode: "insensitive" as const } },
            { customer: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }] : []),
        ...(status !== "ALL" && statusGroups[status] ? [{ status: { in: statusGroups[status] } }] : []),
      ],
    };
    const { page, pageSize, skip } = optPage(sp);
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { customer: true, items: { include: { variant: true } } },
        orderBy: { createdAt: "desc" }, skip, take: pageSize,
      }),
      prisma.order.count({ where }),
    ]);
    return ok({ orders, page, pageSize, total });
  } catch (err) {
    return apiError(err);
  }
}
