import { NextResponse } from "next/server";
import { prisma } from "./db";

export function apiError(err: unknown) {
  const e = err as { status?: number; code?: string; message: string };
  const status = e.status ?? 500;
  if (status === 500) console.error(err);
  // Never leak raw DB errors.
  const known = [
    "INSUFFICIENT_STOCK", "INVALID_STATUS_TRANSITION", "DUPLICATE",
    "NOT_FOUND", "VALIDATION",
  ];
  const code = known.includes(e.code ?? "") ? e.code! : status === 500 ? "INTERNAL" : "BAD_REQUEST";
  return NextResponse.json({ code, message: e.message }, { status });
}

/**
 * Parse a JSON money field (VND — integer, minor units) into bigint.
 * Rejects non-numbers, negatives, non-integers so BigInt() never throws.
 */
export function toMoney(v: unknown, field: string): bigint {
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v < 0)
    fail(400, "VALIDATION", `${field} must be a non-negative integer`);
  return BigInt(v);
}

export function fail(status: number, code: string, message: string, details?: unknown): never {
  throw Object.assign(new Error(message), { status, code, details });
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(JSON.parse(JSON.stringify(data, (_, v) => (typeof v === "bigint" ? Number(v) : v))), { status });
}

export async function nextBusinessNumber(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const counter = await prisma.sequenceCounter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${year}-${String(counter.value).padStart(6, "0")}`;
}
