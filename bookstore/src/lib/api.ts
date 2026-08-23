import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "./db";

export async function apiError(err: unknown) {
  const e = err as { status?: number; code?: string; message: string; retryAfter?: number; stack?: string };
  const malformedJson = err instanceof SyntaxError;
  const status = e.status ?? (malformedJson ? 400 : 500);
  const requestId = (await headers()).get("x-request-id") ?? undefined;
  if (status === 500) console.error(JSON.stringify({
    level: "error", event: "api_error", requestId, message: e.message ?? "Unknown error", stack: e.stack,
  }));
  // Never leak raw DB errors.
  const known = [
    "INSUFFICIENT_STOCK", "INVALID_STATUS_TRANSITION", "DUPLICATE",
    "NOT_FOUND", "VALIDATION", "RATE_LIMITED",
  ];
  const code = known.includes(e.code ?? "") ? e.code! : status === 500 ? "INTERNAL" : "BAD_REQUEST";
  const message = status === 500 ? "Internal server error" : malformedJson ? "Malformed JSON request" : e.message;
  const response = NextResponse.json({ code, message, requestId }, { status });
  if (e.retryAfter) response.headers.set("Retry-After", String(e.retryAfter));
  return response;
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

// ── Body validation helpers ─────────────────────────────────────────────────
// Fail closed with 400 instead of letting junk reach Prisma and surface as 500.

export function reqStr(v: unknown, field: string, max = 255): string {
  if (typeof v !== "string" || !v.trim()) fail(400, "VALIDATION", `${field} is required`);
  const s = v.trim();
  if (s.length > max) fail(400, "VALIDATION", `${field} must be at most ${max} characters`);
  return s;
}

export function optStr(v: unknown, field: string, max = 500): string | null {
  if (v === undefined || v === null || v === "") return null;
  return reqStr(v, field, max);
}

export function reqInt(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max)
    fail(400, "VALIDATION", `${field} must be an integer between ${min} and ${max}`);
  return v;
}

export function optBool(v: unknown, field: string): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") fail(400, "VALIDATION", `${field} must be a boolean`);
  return v;
}

/** Parse an optional date-ish value; garbage strings become 400, never Invalid Date. */
export function optDate(v: unknown, field: string): Date | null {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) fail(400, "VALIDATION", `${field} is not a valid date`);
  return d;
}

/** Assert an FK target exists; turns would-be P2003 500s into clean 404s. */
export function requireRef<T>(row: T | null, label: string): T {
  if (!row) fail(404, "NOT_FOUND", `${label} not found`);
  return row;
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(JSON.parse(JSON.stringify(data, (_, value) => {
    if (typeof value !== "bigint") return value;
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value) : value.toString();
  })), { status });
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

// ponytail: in-memory cache, refresh only on miss. No TTL — config changes are rare;
// restart server to pick up a changed value. Swap for DB-listen/period refresh if needed.
const configCache = new Map<string, { value: unknown; expiresAt: number }>();
const CONFIG_TTL_MS = 30_000;

/**
 * Read a SystemConfig JSON value (spec §101). Falls back to `fallback` when the
 * row is missing so callers never crash on an un-seeded key.
 */
export async function getSystemConfig<T>(key: string, fallback: T): Promise<T> {
  const cached = configCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  const value = (row?.value as T) ?? fallback;
  configCache.set(key, { value, expiresAt: Date.now() + CONFIG_TTL_MS });
  return value;
}
