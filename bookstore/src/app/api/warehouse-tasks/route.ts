import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertStoreAccess, requirePermission } from "@/lib/auth";
import { apiError, fail, nextBusinessNumber, ok } from "@/lib/api";
import { applyMovement } from "@/lib/inventory";
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
      where: { location: locationScope },
      include: {
        location: true,
        items: { include: { variant: { include: { product: true } } } }, // bin-level detail
      },
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

    // Wave picking: group open PICK tasks for one location into a wave. The wave id
    // lets a picker pull every task in one pass and the mobile client to filter.
    if (body.action === "create_wave") {
      if (!body.locationId) fail(400, "VALIDATION", "locationId required");
      const location = await prisma.stockLocation.findUnique({ where: { id: body.locationId } });
      if (!location) fail(404, "NOT_FOUND", "Warehouse location not found");
      await requirePermission("inventory.adjust", location.storeId);
      const waveId = `wave-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const updated = await prisma.warehouseTask.updateMany({
        where: { locationId: body.locationId, type: "PICK", status: "OPEN", waveId: null },
        data: { waveId },
      });
      if (updated.count === 0) fail(400, "VALIDATION", "No open PICK tasks at this location");
      return ok({ waveId, taskCount: updated.count }, 201);
    }

    // Packing labels: printable label set for a task/wave (variant, qty, bin, number).
    if (body.action === "pack_labels") {
      const taskIdOrWave = body.taskId ? { id: body.taskId } : body.waveId ? { waveId: body.waveId } : null;
      if (!taskIdOrWave) fail(400, "VALIDATION", "taskId or waveId required");
      const tasks = await prisma.warehouseTask.findMany({
        where: taskIdOrWave,
        include: { location: true, items: { include: { variant: { include: { product: true } } } } },
      });
      if (tasks.length === 0) fail(404, "NOT_FOUND", "No tasks found");
      const auth = await requirePermission("inventory.view");
      for (const task of tasks) assertStoreAccess(auth, task.location.storeId, "inventory.view");
      return ok({
        labels: tasks.map((task) => ({
          taskNumber: task.number, type: task.type, location: task.location.name, waveId: task.waveId,
          lines: task.items.map((item) => ({
            sku: item.variant.sku, product: item.variant.product.name,
            quantity: item.quantity, processedQty: item.processedQty, bin: item.binCode,
          })),
        })),
      });
    }

    if (body.action === "create") {
      if (!body.locationId || !Object.values(WarehouseTaskType).includes(body.type))
        fail(400, "VALIDATION", "locationId and valid task type required");
      const location = await prisma.stockLocation.findUnique({ where: { id: body.locationId } });
      if (!location) fail(404, "NOT_FOUND", "Warehouse location not found");
      await requirePermission("inventory.adjust", location.storeId);
      if (body.items !== undefined && (!Array.isArray(body.items) || body.items.some((i: unknown) =>
        typeof i !== "object" || i === null || typeof (i as { variantId?: unknown }).variantId !== "string"
        || !Number.isInteger((i as { quantity?: unknown }).quantity) || (i as { quantity?: number }).quantity! <= 0)))
        fail(400, "VALIDATION", "items must be [{variantId, quantity}] with positive integer quantity");
      const task = await prisma.warehouseTask.create({ data: {
        number: await nextBusinessNumber("WMS"), type: body.type, locationId: location.id,
        refType: body.refType ?? null, refId: body.refId ?? null, assignedTo: body.assignedTo ?? null,
        priority: Number.isInteger(body.priority) ? body.priority : 0,
        notes: typeof body.notes === "string" ? body.notes : null,
        items: Array.isArray(body.items)
          ? { create: body.items.map((item: { variantId: string; quantity: number; binCode?: string }) => ({
            variantId: item.variantId, quantity: item.quantity, binCode: item.binCode ?? null })) }
          : undefined,
      }, include: { items: true } });
      return ok({ task }, 201);
    }

    if (body.action === "scan") {
      // Mobile scanner flow: record progress on one task item. When every item is
      // fully processed the task auto-completes; PICK/PUTAWAY also move stock.
      if (typeof body.taskItemId !== "string" || !Number.isInteger(body.quantity) || body.quantity <= 0)
        fail(400, "VALIDATION", "taskItemId and positive integer quantity required");
      const item = await prisma.warehouseTaskItem.findUnique({
        where: { id: body.taskItemId }, include: { task: { include: { location: true } } },
      });
      if (!item) fail(404, "NOT_FOUND", "Task item not found");
      if (item.task.status !== "IN_PROGRESS") fail(409, "INVALID_STATUS_TRANSITION", "Task must be IN_PROGRESS to scan");
      await requirePermission("inventory.adjust", item.task.location.storeId);
      const processedQty = Math.min(item.processedQty + body.quantity, item.quantity);
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.warehouseTaskItem.updateMany({
          where: { id: item.id, processedQty: item.processedQty }, data: { processedQty },
        });
        if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "Task item was already scanned");
        if (["PICK", "PUTAWAY"].includes(item.task.type)) {
          const delta = processedQty - item.processedQty;
          if (delta !== 0)
            await applyMovement(tx, {
              variantId: item.variantId, locationId: item.task.locationId,
              type: item.task.type === "PICK" ? "TRANSFER_OUT" : "PURCHASE_RECEIPT",
              quantityDelta: item.task.type === "PICK" ? -delta : delta,
              refType: "warehouse_task", refId: item.task.id, userId: "wms-scan",
            });
        }
        const siblings = await tx.warehouseTaskItem.findMany({ where: { taskId: item.taskId } });
        const done = siblings.every((sibling) => sibling.processedQty >= sibling.quantity);
        if (done) {
          const completed = await tx.warehouseTask.updateMany({
            where: { id: item.taskId, status: "IN_PROGRESS" },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
          if (completed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "Task was already updated");
        }
        return done;
      });
      const task = await prisma.warehouseTask.findUnique({ where: { id: item.taskId } });
      return ok({ taskItemId: item.id, processedQty, taskStatus: task?.status });
    }

    if (body.action !== "transition" || !body.taskId || !Object.values(WarehouseTaskStatus).includes(body.status))
      fail(400, "VALIDATION", "Unknown action");
    const current = await prisma.warehouseTask.findUnique({ where: { id: body.taskId }, include: { location: true, items: true } });
    if (!current) fail(404, "NOT_FOUND", "Warehouse task not found");
    await requirePermission("inventory.adjust", current.location.storeId);
    if (!(TRANSITIONS[current.status] ?? []).includes(body.status))
      fail(409, "INVALID_STATUS_TRANSITION", `Cannot transition ${current.status} -> ${body.status}`);
    const task = await prisma.$transaction(async (tx) => {
      const claimed = await tx.warehouseTask.updateMany({
        where: { id: current.id, status: current.status },
        data: {
          status: body.status, assignedTo: body.assignedTo ?? current.assignedTo,
          completedAt: body.status === "COMPLETED" ? new Date() : null,
        },
      });
      if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "Warehouse task was already updated");
      // Completing manually applies un-scanned quantities in the same transaction.
      if (body.status === "COMPLETED" && ["PICK", "PUTAWAY"].includes(current.type)) {
        for (const item of current.items) {
          const remaining = item.quantity - item.processedQty;
          if (remaining <= 0) continue;
          if (current.type === "PICK")
            await applyMovement(tx, { variantId: item.variantId, locationId: current.locationId, type: "TRANSFER_OUT", quantityDelta: -remaining, refType: "warehouse_task", refId: current.id, userId: "wms-complete" });
          else
            await applyMovement(tx, { variantId: item.variantId, locationId: current.locationId, type: "PURCHASE_RECEIPT", quantityDelta: remaining, refType: "warehouse_task", refId: current.id, userId: "wms-complete" });
          await tx.warehouseTaskItem.update({ where: { id: item.id }, data: { processedQty: item.quantity } });
        }
      }
      return tx.warehouseTask.findUniqueOrThrow({ where: { id: current.id } });
    });
    return ok({ task });
  } catch (err) {
    return apiError(err);
  }
}
