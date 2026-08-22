import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, ok } from "@/lib/api";
import { createReservedOrder, type CreateOrderInput } from "@/lib/orders";
import { IntegrationJobStatus } from "@/generated/prisma/client";

function providerName(value: unknown) {
  if (typeof value !== "string" || !/^[a-z0-9_-]{2,32}$/i.test(value))
    fail(400, "VALIDATION", "provider must contain 2-32 letters, numbers, _ or -");
  return value.toLowerCase();
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission("admin.config");
    const provider = req.nextUrl.searchParams.get("provider") ?? undefined;
    const requestedStatus = req.nextUrl.searchParams.get("status") ?? undefined;
    const status = requestedStatus && Object.values(IntegrationJobStatus).includes(requestedStatus as IntegrationJobStatus)
      ? requestedStatus as IntegrationJobStatus : undefined;
    const jobs = await prisma.integrationJob.findMany({
      where: { provider, status }, orderBy: { createdAt: "desc" }, take: 200,
    });
    return ok({ jobs });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("admin.config");
    const body = await req.json();
    const provider = providerName(body.provider);

    if (body.action === "import_marketplace_order") {
      if (typeof body.externalId !== "string" || !body.externalId.trim() || !body.order)
        fail(400, "VALIDATION", "externalId and order required");
      const idempotencyKey = `${provider}:marketplace-order:${body.externalId.trim()}`;
      const existing = await prisma.integrationJob.findUnique({ where: { idempotencyKey } });
      if (existing?.status === "SUCCEEDED") return ok({ job: existing, duplicate: true });
      const job = existing
        ? await prisma.integrationJob.update({ where: { id: existing.id }, data: { status: "PROCESSING", attempts: { increment: 1 }, error: null } })
        : await prisma.integrationJob.create({ data: {
          provider, kind: "MARKETPLACE_ORDER_IMPORT", externalId: body.externalId.trim(), idempotencyKey,
          status: "PROCESSING", attempts: 1, payload: body.order,
        } });
      try {
        const order = await createReservedOrder({ ...body.order, channel: "MARKETPLACE" } as CreateOrderInput, auth.userId);
        const completed = await prisma.integrationJob.update({
          where: { id: job.id },
          data: { status: "SUCCEEDED", result: { orderId: order.id, number: order.number }, completedAt: new Date() },
        });
        return ok({ job: completed, order: { id: order.id, number: order.number, status: order.status } }, 201);
      } catch (err) {
        await prisma.integrationJob.update({
          where: { id: job.id }, data: { status: "FAILED", error: err instanceof Error ? err.message : "Unknown import error", completedAt: new Date() },
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
      const idempotencyKey = body.idempotencyKey ?? `${provider}:accounting:${start.toISOString()}:${end.toISOString()}`;
      const existing = await prisma.integrationJob.findUnique({ where: { idempotencyKey } });
      if (existing) return ok({ job: existing, duplicate: true });
      const [pos, orders, refunds] = await Promise.all([
        prisma.posTransaction.aggregate({ where: { status: "COMPLETED", createdAt: { gte: start, lt: end } }, _sum: { subtotal: true, discountTotal: true, total: true }, _count: true }),
        prisma.order.aggregate({ where: { status: "DELIVERED", createdAt: { gte: start, lt: end } }, _sum: { subtotal: true, discountTotal: true, total: true }, _count: true }),
        prisma.return.aggregate({ where: { status: "REFUNDED", createdAt: { gte: start, lt: end } }, _sum: { refundTotal: true }, _count: true }),
      ]);
      const payload = {
        startAt: start.toISOString(), endAt: end.toISOString(),
        pos: { count: pos._count, subtotal: Number(pos._sum.subtotal ?? 0n), discount: Number(pos._sum.discountTotal ?? 0n), total: Number(pos._sum.total ?? 0n) },
        orders: { count: orders._count, subtotal: Number(orders._sum.subtotal ?? 0n), discount: Number(orders._sum.discountTotal ?? 0n), total: Number(orders._sum.total ?? 0n) },
        refunds: { count: refunds._count, total: Number(refunds._sum.refundTotal ?? 0n) },
      };
      const job = await prisma.integrationJob.create({ data: {
        provider, kind: "ACCOUNTING_EXPORT", idempotencyKey, payload,
      } });
      return ok({ job }, 202);
    }

    fail(400, "VALIDATION", "Unknown integration action");
  } catch (err) {
    return apiError(err);
  }
}
