// Two-way server cart: the shop and the agent read/write the same lines.
// Last-write-wins by updatedAt; merge keeps both sides' lines, server
// quantity winning conflicts. Lines are variantIds only — never PII.

import { prisma, prismaRead } from "./db";

export type ServerCartLine = {
  variantId: string;
  quantity: number;
};

export type CartSubject =
  | { orgId: string; customerId: string }
  | { orgId: string; phone: string };

const MAX_LINES = 50;

export function normalizeCartPhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^84/, "").replace(/^0/, "");
}

/** Pure: clamp quantities, drop bad lines, cap 50. Shared by routes/tests. */
export function cleanCartLines(lines: unknown): ServerCartLine[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .filter(
      (l): l is ServerCartLine =>
        typeof l === "object" &&
        l !== null &&
        typeof (l as ServerCartLine).variantId === "string" &&
        (l as ServerCartLine).variantId.length > 0 &&
        (l as ServerCartLine).variantId.length <= 64 &&
        typeof (l as ServerCartLine).quantity === "number",
    )
    .map((l) => ({
      variantId: l.variantId,
      quantity: Math.min(Math.max(Math.floor(l.quantity) || 1, 1), 99),
    }))
    .slice(0, MAX_LINES);
}

/**
 * Pure merge: server lines win conflicts (they carry the latest validated
 * write), local-only lines are kept. Used by CartContext and tests.
 */
export function mergeCartLines(local: ServerCartLine[], server: ServerCartLine[]): ServerCartLine[] {
  const merged = new Map<string, number>();
  for (const l of cleanCartLines(local)) merged.set(l.variantId, l.quantity);
  for (const l of cleanCartLines(server)) merged.set(l.variantId, l.quantity);
  return [...merged.entries()].map(([variantId, quantity]) => ({ variantId, quantity })).slice(0, MAX_LINES);
}

function subjectWhere(subject: CartSubject, storeId?: string | null) {
  const store = storeId ?? null;
  if ("customerId" in subject) {
    return { orgId: subject.orgId, customerId: subject.customerId, storeId: store };
  }
  return { orgId: subject.orgId, phone: normalizeCartPhone(subject.phone), storeId: store };
}

export type StoredCart = {
  items: ServerCartLine[];
  source: string;
  updatedAt: Date;
};

export async function getServerCart(
  subject: CartSubject,
  storeId?: string | null,
): Promise<StoredCart | null> {
  const row = await prismaRead.serverCart.findFirst({ where: subjectWhere(subject, storeId) });
  if (!row) return null;
  return {
    items: cleanCartLines(row.items as unknown[]),
    source: row.source,
    updatedAt: row.updatedAt,
  };
}

export async function saveServerCart(
  subject: CartSubject,
  storeId: string | null,
  items: unknown,
  source: "shop" | "agent",
): Promise<StoredCart> {
  const lines = cleanCartLines(items);
  const where = subjectWhere(subject, storeId);
  // Keep only variants that exist and are active — garbage in, garbage out
  // otherwise, and the agent can only stage real goods.
  const known = await prismaRead.productVariant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) }, active: true },
    select: { id: true },
  });
  const knownIds = new Set(known.map((v) => v.id));
  const valid = lines.filter((l) => knownIds.has(l.variantId));
  const data = {
    orgId: subject.orgId,
    ...("customerId" in where ? { customerId: where.customerId } : { phone: where.phone }),
    storeId: where.storeId,
    items: valid,
    source,
  };
  // Nullable storeId defeats upsert (Postgres NULLs never match) — fall back
  // to find-then-write when no store scopes the cart.
  if (where.storeId === null) {
    const existing = await prisma.serverCart.findFirst({ where });
    const row = existing
      ? await prisma.serverCart.update({ where: { id: existing.id }, data: { items: valid, source } })
      : await prisma.serverCart.create({ data });
    return { items: valid, source: row.source, updatedAt: row.updatedAt };
  }
  const row = await ("customerId" in where
    ? prisma.serverCart.upsert({
        where: { orgId_customerId_storeId: { orgId: where.orgId, customerId: where.customerId!, storeId: where.storeId } },
        create: data,
        update: { items: valid, source },
      })
    : prisma.serverCart.upsert({
        where: { orgId_phone_storeId: { orgId: where.orgId, phone: where.phone!, storeId: where.storeId } },
        create: data,
        update: { items: valid, source },
      }));
  return { items: valid, source: row.source, updatedAt: row.updatedAt };
}
