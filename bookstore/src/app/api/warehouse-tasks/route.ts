import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, fail, nextBusinessNumber, ok } from "@/lib/api";
import { WarehouseTaskStatus, WarehouseTaskType } from "@/generated/prisma/client";

const TRANSITIONS: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
};

export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId") ?? undefined;
    const auth = await requirePermission("inventory.view", storeId);
    const hasGlobalScope = auth.roles.some((role) => role.permissions.includes("inventory.view") && role.storeId === null);
    const scopedStoreIds = auth.roles.filter((role) => role.permissions.includes("inventory.view") && role.storeId).map((role) => role.storeId!);
    const locationScope = storeId ? { storeId } : hasGlobalScope ? undefined : { storeId: { in: scopedStoreIds } };
    const tasks = await prisma.warehouseTask.findMany({
      where: { location: locationScope }, include: { location: true },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 200,
    });
    return ok({ tasks });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "create") {
      if (!body.locationId || !Object.values(WarehouseTaskType).includes(body.type))
        fail(400, "VALIDATION", "locationId and valid task type required");
      const location = await prisma.stockLocation.findUnique({ where: { id: body.locationId } });
      if (!location) fail(404, "NOT_FOUND", "Warehouse location not found");
      await requirePermission("inventory.adjust", location.storeId ?? undefined);
      const task = await prisma.warehouseTask.create({ data: {
        number: await nextBusinessNumber("WMS"), type: body.type, locationId: location.id,
        refType: body.refType ?? null, refId: body.refId ?? null, assignedTo: body.assignedTo ?? null,
        priority: Number.isInteger(body.priority) ? body.priority : 0,
        notes: typeof body.notes === "string" ? body.notes : null,
      } });
      return ok({ task }, 201);
    }
    if (body.action !== "transition" || !body.taskId || !Object.values(WarehouseTaskStatus).includes(body.status))
      fail(400, "VALIDATION", "Unknown action");
    const current = await prisma.warehouseTask.findUnique({ where: { id: body.taskId }, include: { location: true } });
    if (!current) fail(404, "NOT_FOUND", "Warehouse task not found");
    await requirePermission("inventory.adjust", current.location.storeId ?? undefined);
    if (!(TRANSITIONS[current.status] ?? []).includes(body.status))
      fail(409, "INVALID_STATUS_TRANSITION", `Cannot transition ${current.status} -> ${body.status}`);
    const task = await prisma.warehouseTask.update({ where: { id: current.id }, data: {
      status: body.status, assignedTo: body.assignedTo ?? current.assignedTo,
      completedAt: body.status === "COMPLETED" ? new Date() : null,
    } });
    return ok({ task });
  } catch (err) {
    return apiError(err);
  }
}
