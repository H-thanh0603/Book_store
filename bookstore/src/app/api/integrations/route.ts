import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertStoreAccess, requirePermission } from "@/lib/auth";
import { requireOrgId } from "@/lib/org-scope";
import { apiError, fail, ok } from "@/lib/api";
import { createReservedOrder, type CreateOrderInput } from "@/lib/orders";
import { claimIntegrationJob } from "@/lib/integration-jobs";
import { IntegrationJobStatus } from "@/generated/prisma/client";
import { sealJson, sealSecret } from "@/lib/secret-box";

function providerName(value: unknown) {
  if (typeof value !== "string" || !/^[a-z0-9_-]{2,32}$/i.test(value))
    fail(400, "VALIDATION", "provider must contain 2-32 letters, numbers, _ or -");
  return value.toLowerCase();
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("admin.config");
    const orgId = requireOrgId(auth);
    if (req.nextUrl.searchParams.get("resource") === "providers") {
      // Credentials and webhook secrets are write-only — never returned.
      const providers = await prisma.integrationProvider.findMany({
        where: { orgId },
        select: { id: true, name: true, kind: true, active: true, lastCatalogSyncAt: true, lastStockSyncAt: true, lastOrderSyncAt: true, createdAt: true },
      });
      return ok({ providers });
    }
    const provider = req.nextUrl.searchParams.get("provider") ?? undefined;
    const requestedStatus = req.nextUrl.searchParams.get("status") ?? undefined;
    const status = requestedStatus && Object.values(IntegrationJobStatus).includes(requestedStatus as IntegrationJobStatus)
      ? requestedStatus as IntegrationJobStatus : undefined;
    const jobs = await prisma.integrationJob.findMany({
      where: { orgId, provider, status }, orderBy: { createdAt: "desc" }, take: 200,
    });
    return ok({ jobs });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("admin.config");
    const orgId = requireOrgId(auth);
    const body = await req.json();
    const provider = providerName(body.provider);

    // Connector registration: upsert credentials + webhook secret scoped to orgId.
    if (body.action === "register_provider") {
      if (!["marketplace", "accounting"].includes(body.kind))
        fail(400, "VALIDATION", "kind must be marketplace or accounting");
      if (body.webhookSecret !== undefined && (typeof body.webhookSecret !== "string" || body.webhookSecret.length < 16))
        fail(400, "VALIDATION", "webhookSecret must be at least 16 characters");
      const saved = await prisma.integrationProvider.upsert({
        where: { orgId_name: { orgId, name: provider } },
        create: {
          orgId, name: provider, kind: body.kind,
          credentials: body.credentials === undefined ? undefined : sealJson(body.credentials),
          webhookSecret: body.webhookSecret === undefined ? null : sealSecret(body.webhookSecret),
        },
        update: {
          kind: body.kind, active: body.active ?? true,
          ...(body.credentials !== undefined ? { credentials: sealJson(body.credentials) } : {}),
          ...(body.webhookSecret !== undefined ? { webhookSecret: sealSecret(body.webhookSecret) } : {}),
        },
      });
      return ok({ id: saved.id, name: saved.name, kind: saved.kind });
    }

    if (body.action === "queue_sync") {
      if (!["catalog", "stock", "orders"].includes(body.target))
        fail(400, "VALIDATION", "target must be catalog, stock or orders");
      fail(501, "NOT_IMPLEMENTED", "Outbound sync is disabled until a connector worker is configured");
    }

    // Reconciliation: compare local vs external order ids for the caller's org only.
    if (body.action === "reconcile") {
      const start = body.startAt ? new Date(body.startAt) : new Date(Date.now() - 86_400_000);
      const end = body.endAt ? new Date(body.endAt) : new Date();
      if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start >= end)
        fail(400, "VALIDATION", "Invalid reconcile period");
      const externalIds: string[] = Array.isArray(body.externalOrderIds)
        ? [...new Set<string>(body.externalOrderIds.filter((v: unknown): v is string => typeof v === "string" && v.trim() !== "").map((v: string) => v.trim()))]
        : [];
      if (externalIds.length === 0)
        fail(400, "VALIDATION", "externalOrderIds (non-empty string array) required for reconcile");
      const localOrders = await prisma.order.findMany({
        where: {
          channel: "MARKETPLACE",
          createdAt: { gte: start, lt: end },
          OR: [{ store: { orgId } }, { storeId: null, customer: { orgId } }],
        },
        select: { id: true, number: true, externalId: true },
      });
      const localExternal = new Set<string>(localOrders.map((o) => o.externalId).filter((v): v is string => !!v));
      return ok({
        period: { startAt: start.toISOString(), endAt: end.toISOString() },
        missingLocally: externalIds.filter((id) => !localExternal.has(id)),
        missingExternally: [...localExternal].filter((id) => !externalIds.includes(id)),
      });
    }

    if (body.action === "import_marketplace_order") {
      if (typeof body.externalId !== "string" || !body.externalId.trim() || !body.order)
        fail(400, "VALIDATION", "externalId and order required");
      if (body.order.storeId) {
        assertStoreAccess(auth, body.order.storeId, "admin.config");
      }
      const externalId = body.externalId.trim();
      const idempotencyKey = `${orgId}:${provider}:marketplace-order:${externalId}`;
      const { job, claimed } = await claimIntegrationJob({
        orgId, provider, kind: "MARKETPLACE_ORDER_IMPORT", externalId, idempotencyKey, payload: body.order,
      });
      if (!claimed) return ok({ job, duplicate: true }, job.status === "SUCCEEDED" ? 200 : 202);
      try {
        const { order, completed } = await prisma.$transaction(async (tx) => {
          const order = await createReservedOrder(
            { ...body.order, channel: "MARKETPLACE", externalId } as CreateOrderInput,
            auth.userId,
            tx,
          );
          const completed = await tx.integrationJob.update({
            where: { id: job.id },
            data: { status: "SUCCEEDED", result: { orderId: order.id, number: order.number }, completedAt: new Date() },
          });
          return { order, completed };
        });
        return ok({ job: completed, order: { id: order.id, number: order.number, status: order.status } }, 201);
      } catch (err) {
        await prisma.integrationJob.updateMany({
          where: { id: job.id, status: "PROCESSING" },
          data: { status: "FAILED", error: err instanceof Error ? err.message : "Unknown import error", completedAt: new Date() },
        });
        throw err;
      }
    }

    if (body.action === "queue_accounting_export") {
      if (body.idempotencyKey !== undefined && (typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim()))
        fail(400, "VALIDATION", "idempotencyKey must be a non-empty string");
      const start = body.startAt ? new Date(body.startAt) : new Date(Date.now() - 86_400_000);
      const end = body.endAt ? new Date(body.endAt) : new Date();
      if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start >= end)
        fail(400, "VALIDATION", "Invalid accounting export period");
      const rawKey = body.idempotencyKey ?? `${provider}:accounting:${start.toISOString()}:${end.toISOString()}`;
      const idempotencyKey = `${orgId}:${rawKey}`;
      const existing = await prisma.integrationJob.findUnique({ where: { idempotencyKey } });
      if (existing) return ok({ job: existing, duplicate: true });
      const [pos, orders, refunds] = await Promise.all([
        prisma.posTransaction.aggregate({
          where: { status: "COMPLETED", createdAt: { gte: start, lt: end }, shift: { terminal: { store: { orgId } } } },
          _sum: { subtotal: true, discountTotal: true, total: true }, _count: true,
        }),
        prisma.order.aggregate({
          where: {
            status: "DELIVERED", createdAt: { gte: start, lt: end },
            OR: [{ store: { orgId } }, { storeId: null, customer: { orgId } }],
          },
          _sum: { subtotal: true, discountTotal: true, total: true }, _count: true,
        }),
        prisma.return.aggregate({
          where: {
            status: "REFUNDED", createdAt: { gte: start, lt: end },
            OR: [{ location: { store: { orgId } } }, { customer: { orgId } }],
          },
          _sum: { refundTotal: true }, _count: true,
        }),
      ]);
      const payload = {
        startAt: start.toISOString(), endAt: end.toISOString(),
        pos: { count: pos._count, subtotal: Number(pos._sum.subtotal ?? 0n), discount: Number(pos._sum.discountTotal ?? 0n), total: Number(pos._sum.total ?? 0n) },
        orders: { count: orders._count, subtotal: Number(orders._sum.subtotal ?? 0n), discount: Number(orders._sum.discountTotal ?? 0n), total: Number(orders._sum.total ?? 0n) },
        refunds: { count: refunds._count, total: Number(refunds._sum.refundTotal ?? 0n) },
      };
      const job = await prisma.integrationJob.create({ data: {
        orgId, provider, kind: "ACCOUNTING_EXPORT", idempotencyKey, payload,
      } });
      return ok({ job }, 202);
    }

    fail(400, "VALIDATION", "Unknown integration action");
  } catch (err) {
    return apiError(err);
  }
}
