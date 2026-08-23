// Agent 2: PO lifecycle — supplier confirmation, invoice/payable, close/cancel.
// POST /api/purchase-orders/lifecycle { poId, action }
//   actions: confirm_supplier | send | record_invoice | pay | close | cancel
//
// Concurrency: every transition is an atomic conditional claim
// (`updateMany` guarded on the pre-state) inside a $transaction, so repeated or
// concurrent submissions can never double-apply a state change (notably `pay`).
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { audit, requirePermission } from "@/lib/auth";
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
      const updated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.purchaseOrder.updateMany({
          where: { id: po.id, supplierConfirmedAt: null },
          data: { supplierConfirmedAt: new Date() },
        });
        if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "Already supplier-confirmed");
        return tx.purchaseOrder.findUniqueOrThrow({
          where: { id: po.id }, select: { number: true, supplierConfirmedAt: true },
        });
      });
      await audit(auth.userId, "po.supplier_confirmed", "PurchaseOrder", po.id, { number: updated.number });
      return ok({ number: updated.number, supplierConfirmedAt: updated.supplierConfirmedAt });
    }

    if (b.action === "send") {
      const auth = await requirePermission("purchase.create");
      assertPoTransition(po.status, "sent");
      const updated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.purchaseOrder.updateMany({
          where: { id: po.id, status: po.status },
          data: { status: "sent" },
        });
        if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "PO was already updated");
        return tx.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, select: { number: true } });
      });
      await audit(auth.userId, "po.send", "PurchaseOrder", po.id, { before: { status: po.status }, after: { status: "sent" } });
      return ok({ number: updated.number, status: "sent" });
    }

    if (b.action === "record_invoice") {
      const auth = await requirePermission("purchase.create");
      if (!b.invoiceNumber) fail(400, "VALIDATION", "invoiceNumber required");
      const amount = toMoney(b.invoiceAmount ?? PAYABLE_TOTAL(po.items), "invoiceAmount");
      if (!["sent", "partially_received", "received"].includes(po.status)) fail(409, "INVALID_STATUS_TRANSITION", `Cannot record invoice for PO in status ${po.status}`);
      // Invoice is editable while unpaid; once partially_paid/paid the payable
      // record is frozen — no reset-to-unpaid after money has moved.
      // Note the explicit null branch: payableStatus starts as NULL and
      // `notIn` alone never matches a NULL in SQL.
      const updated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.purchaseOrder.updateMany({
          where: {
            id: po.id,
            OR: [
              { payableStatus: null },
              { payableStatus: { notIn: ["partially_paid", "paid"] } },
            ],
          },
          data: { invoiceNumber: b.invoiceNumber, invoiceAmount: amount, payableStatus: "unpaid" },
        });
        if (claimed.count !== 1)
          fail(409, "INVALID_STATUS_TRANSITION", "Invoice is frozen — this PO has already been paid");
        return tx.purchaseOrder.findUniqueOrThrow({
          where: { id: po.id },
          select: { number: true, invoiceNumber: true, payableStatus: true },
        });
      });
      await audit(auth.userId, "po.invoice_recorded", "PurchaseOrder", po.id, { invoiceNumber: b.invoiceNumber, invoiceAmount: amount.toString() });
      return ok({ number: updated.number, invoiceNumber: updated.invoiceNumber, payableStatus: updated.payableStatus });
    }

    if (b.action === "pay") {
      const auth = await requirePermission("purchase.approve");
      const updated = await prisma.$transaction(async (tx) => {
        const current = await tx.purchaseOrder.findUnique({
          where: { id: po.id }, select: { invoiceNumber: true, payableStatus: true },
        });
        if (!current) fail(404, "NOT_FOUND", "PO not found");
        if (!current.invoiceNumber) fail(409, "INVALID_STATUS_TRANSITION", "Record the supplier invoice first");
        const claimed = await tx.purchaseOrder.updateMany({
          where: { id: po.id, payableStatus: "unpaid" },
          data: { payableStatus: "paid" },
        });
        if (claimed.count !== 1)
          fail(409, "INVALID_STATUS_TRANSITION", `Cannot pay PO with payableStatus ${current.payableStatus}`);
        return tx.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, select: { number: true, payableStatus: true } });
      });
      await audit(auth.userId, "po.paid", "PurchaseOrder", po.id, { after: { payableStatus: updated.payableStatus } });
      return ok({ number: updated.number, payableStatus: updated.payableStatus });
    }

    if (b.action === "close" || b.action === "cancel") {
      const to = b.action === "close" ? "closed" : "cancelled";
      const auth = await requirePermission("purchase.approve");
      assertPoTransition(po.status, to);
      await prisma.$transaction(async (tx) => {
        // Re-validate against live items inside the transaction — a receipt
        // recorded concurrently must not be cancelled away.
        const fresh = await tx.purchaseOrder.findUnique({ where: { id: po.id }, include: { items: true } });
        if (!fresh || fresh.status !== po.status)
          fail(409, "INVALID_STATUS_TRANSITION", "PO was already updated");
        if (to === "cancelled" && fresh.items.some((i) => (i.receivedQty ?? 0) > 0))
          fail(409, "INVALID_STATUS_TRANSITION", "PO has receipts — cannot cancel");
        if (to === "closed" && fresh.items.some((i) => i.receivedQty < i.quantity))
          fail(409, "INVALID_STATUS_TRANSITION", "PO not fully received — use partially_received/received first or cancel remainder via a new PO");
        const claimed = await tx.purchaseOrder.updateMany({
          where: { id: po.id, status: po.status },
          data: { status: to },
        });
        if (claimed.count !== 1) fail(409, "INVALID_STATUS_TRANSITION", "PO was already updated");
        await audit(auth.userId, `po.${b.action}`, "PurchaseOrder", po.id, { before: { status: po.status }, after: { status: to } }, tx);
      });
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
