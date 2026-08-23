// Purchasing + Stock Transfer creation primitives.
// State transitions (approve/send/receive/dispatch) live in the API routes that
// own their claim-based $transaction flows; this module only creates documents
// and exposes the transition table they validate against.
import { prisma } from "./db";
import { fail, nextBusinessNumber } from "./api";
import { Prisma } from "../generated/prisma/client";
import { PoStatus } from "../generated/prisma/enums";

type Db = Prisma.TransactionClient | typeof prisma;

// ── Purchase Orders ──────────────────────────────────────────

export async function createPurchaseOrder(input: {
  supplierId: string;
  warehouseId: string;
  expectedDate?: Date;
  userId: string;
  items: { variantId: string; quantity: number; unitCost: bigint }[];
  /** Pass a transaction client to create the PO atomically with other writes. */
  client?: Db;
}) {
  if (input.items.length === 0) fail(400, "VALIDATION", "PO needs items");
  const db = input.client ?? prisma;
  const number = await nextBusinessNumber("PO");
  return db.purchaseOrder.create({
    data: {
      number,
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      status: "pending_approval",
      expectedDate: input.expectedDate,
      orderedBy: input.userId,
      items: { create: input.items },
    },
    include: { items: true },
  });
}

const PO_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "cancelled"],
  approved: ["sent", "cancelled"],
  sent: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "closed"],
  received: ["closed"],
  cancelled: [],
  closed: [],
};

export function assertPoTransition(from: PoStatus, to: PoStatus) {
  if (!PO_TRANSITIONS[from].includes(to))
    fail(400, "INVALID_STATUS_TRANSITION", `Cannot transition PO ${from} → ${to}`);
}

// ── Stock Transfer ───────────────────────────────────────────

export async function createTransfer(input: {
  fromLocationId: string;
  toLocationId: string;
  requestedBy: string;
  items: { variantId: string; quantity: number }[];
  /** Pass a transaction client to create the transfer atomically with other writes. */
  client?: Db;
}) {
  if (input.fromLocationId === input.toLocationId)
    fail(400, "VALIDATION", "Source and destination must differ");
  if (input.items.length === 0) fail(400, "VALIDATION", "Transfer needs items");
  const db = input.client ?? prisma;
  const number = await nextBusinessNumber("TRF");
  return db.stockTransfer.create({
    data: {
      number,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      requestedBy: input.requestedBy,
      status: "REQUESTED",
      items: { create: input.items },
    },
  });
}
