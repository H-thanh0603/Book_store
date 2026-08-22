// Agent 2: PO lifecycle — supplier confirmation, invoice/payable, close/cancel.
// POST /api/purchase-orders/lifecycle { poId, action }
//   actions: confirm_supplier | send | record_invoice | pay | close | cancel
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { apiError, ok, fail, toMoney } from "@/lib/api";
import { assertPoTransition } from "@/lib/purchasing";

const PAYABLE_TOTAL = (items: { quantity: number; unitCost: bigint }[]) =>
  items.reduce((s, i) => s + i.quantity * Number(i.unitCost), 0);

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (!b.poId || !b.action) fail(400, "VALIDATION", "poId and action required");
    const po = await prisma.purchaseOrder.findUnique({ where: { id: b.poId }, include: { items: true } });
    if (!po) fail(404, "NOT_FOUND", "PO not found");

    if (b.action === "confirm_supplier") {
      const auth = await requirePermission("purchase.approve");
      // Supplier confirms the order — allowed once, from approved/sent
      if (!["approved", "sent"].includes(po.status)) fail(409, "INVALID_STATUS_TRANSITION", `Cannot confirm PO in status ${po.status}`);
      if (po.supplierConfirmedAt) fail(409, "INVALID_STATUS_TRANSITION", "Already supplier-confirmed");
      const updated = await prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { supplierConfirmedAt: new Date() },
      });
      await prisma.auditLog.create({ data: { actorId: auth.userId, action: "po.supplier_confirmed", entity: "PurchaseOrder", entityId: po.id, after: { number: po.number } } });
      return ok({ number: updated.number, supplierConfirmedAt: updated.supplierConfirmedAt });
    }

    if (b.action === "send") {
      const auth = await requirePermission("purchase.create");
      assertPoTransition(po.status, "sent");
      await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: "sent" } });
      await prisma.auditLog.create({ data: { actorId: auth.userId, action: "po.send", entity: "PurchaseOrder", entityId: po.id, before: { status: po.status }, after: { status: "sent" } } });
      return ok({ number: po.number, status: "sent" });
    }

    if (b.action === "record_invoice") {
      const auth = await requirePermission("purchase.create");
      if (!b.invoiceNumber) fail(400, "VALIDATION", "invoiceNumber required");
      const amount = toMoney(b.invoiceAmount ?? PAYABLE_TOTAL(po.items), "invoiceAmount");
      if (!["sent", "partially_received", "received"].includes(po.status)) fail(409, "INVALID_STATUS_TRANSITION", `Cannot record invoice for PO in status ${po.status}`);
      const updated = await prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { invoiceNumber: b.invoiceNumber, invoiceAmount: amount, payableStatus: "unpaid" },
      });
      await prisma.auditLog.create({ data: { actorId: auth.userId, action: "po.invoice_recorded", entity: "PurchaseOrder", entityId: po.id, after: { invoiceNumber: b.invoiceNumber, invoiceAmount: amount.toString() } } });
      return ok({ number: updated.number, invoiceNumber: updated.invoiceNumber, payableStatus: updated.payableStatus });
    }

    if (b.action === "pay") {
      const auth = await requirePermission("purchase.approve");
      if (!po.invoiceNumber) fail(409, "INVALID_STATUS_TRANSITION", "Record the supplier invoice first");
      const updated = await prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { payableStatus: "paid" },
      });
      await prisma.auditLog.create({ data: { actorId: auth.userId, action: "po.paid", entity: "PurchaseOrder", entityId: po.id, after: { payableStatus: "paid" } } });
      return ok({ number: updated.number, payableStatus: updated.payableStatus });
    }

    if (b.action === "close" || b.action === "cancel") {
      const to = b.action === "close" ? "closed" : "cancelled";
      const auth = await requirePermission("purchase.approve");
      assertPoTransition(po.status, to);
      if (to === "cancelled") {
        const receivedAny = po.items.some((i) => (i.receivedQty ?? 0) > 0);
        if (receivedAny) fail(409, "INVALID_STATUS_TRANSITION", "PO has receipts — cannot cancel");
      }
      if (to === "closed") {
        const notReceived = po.items.some((i) => i.receivedQty < i.quantity);
        if (notReceived) fail(409, "INVALID_STATUS_TRANSITION", "PO not fully received — use partially_received/received first or cancel remainder via a new PO");
      }
      await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: to } });
      await prisma.auditLog.create({ data: { actorId: auth.userId, action: `po.${b.action}`, entity: "PurchaseOrder", entityId: po.id, before: { status: po.status }, after: { status: to } } });
      return ok({ number: po.number, status: to });
    }

    fail(400, "VALIDATION", "Unknown action");
  } catch (err) {
    return apiError(err);
  }
}

// GET /api/purchase-orders/lifecycle?poId= — full detail incl. receipts and price history
export async function GET(req: NextRequest) {
  try {
    await requirePermission("purchase.create");
    const poId = req.nextUrl.searchParams.get("poId");
    if (!poId) fail(400, "VALIDATION", "poId required");
    const detail = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        supplier: { select: { id: true, code: true, name: true, leadTimeDays: true, paymentTerms: true } },
        items: { include: { variant: { select: { sku: true, product: { select: { name: true } } } } } },
        receipts: { include: { items: true }, orderBy: { receivedAt: "desc" } },
      },
    });
    if (!detail) fail(404, "NOT_FOUND", "PO not found");
    return ok(detail);
  } catch (err) {
    return apiError(err);
  }
}
