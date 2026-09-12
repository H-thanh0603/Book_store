import { createHash, randomBytes } from "crypto";
import { prisma } from "./db";
import { clientIp, enforceRateLimit } from "./rate-limit";

// A1: agent API keys. Plaintext key format `mk_<32 hex>` (recognizable in
// logs/proxies); only the sha256 is stored. Keys carry their own per-minute
// quota so agent traffic never shares the anonymous IP bucket.

export type ResolvedAgentKey = {
  id: string;
  label: string;
  orgId: string | null;
  quotaPerMin: number;
};

export function hashAgentKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function newAgentKeyPlaintext(): string {
  return `mk_${randomBytes(16).toString("hex")}`;
}

/** Staff-issued key. Returns the row + plaintext (shown ONCE to the caller). */
export async function issueAgentKey(input: {
  label: string;
  orgId?: string | null;
  quotaPerMin?: number;
  createdBy?: string;
}): Promise<{ id: string; plaintext: string; quotaPerMin: number }> {
  const plaintext = newAgentKeyPlaintext();
  const row = await prisma.agentKey.create({
    data: {
      label: input.label.slice(0, 120),
      keyHash: hashAgentKey(plaintext),
      orgId: input.orgId ?? null,
      quotaPerMin: Math.max(1, Math.min(10_000, input.quotaPerMin ?? 120)),
      createdBy: input.createdBy ?? null,
    },
    select: { id: true, quotaPerMin: true },
  });
  return { id: row.id, plaintext, quotaPerMin: row.quotaPerMin };
}

export async function resolveAgentKey(req: Request): Promise<ResolvedAgentKey | null> {
  const raw = req.headers.get("x-agent-key")?.trim();
  if (!raw) return null;
  const row = await prisma.agentKey.findUnique({
    where: { keyHash: hashAgentKey(raw) },
    select: { id: true, label: true, orgId: true, quotaPerMin: true, status: true },
  });
  if (!row || row.status !== "ACTIVE") return null;
  return { id: row.id, label: row.label, orgId: row.orgId, quotaPerMin: row.quotaPerMin };
}

export async function touchAgentKey(id: string): Promise<void> {
  await prisma.agentKey.update({ where: { id }, data: { lastUsedAt: new Date() } }).catch(() => {});
}

/**
 * Per-tool rate limit with agent identity: keyed callers get their own
 * quota (`agent:{key}:{tool}`), anonymous callers keep the endpoint's
 * legacy IP bucket untouched (same namespace + limit as before).
 * Returns the resolved key (or null).
 */
export async function agentRateLimit(
  req: Request,
  tool: string,
  anonNs: string,
  anonLimit: number,
  windowMs = 60_000
): Promise<ResolvedAgentKey | null> {
  const key = await resolveAgentKey(req);
  if (key) {
    await enforceRateLimit(`agent:${key.id}:${tool}`, `key:${key.id}`, key.quotaPerMin, windowMs);
    void touchAgentKey(key.id);
    return key;
  }
  await enforceRateLimit(anonNs, clientIp(req.headers), anonLimit, windowMs);
  return null;
}

/**
 * Best-effort session-log tail for endpoints: maps the outcome to OK /
 * RATE_LIMITED / ERROR and appends the chained event. Never throws — the
 * log must not break the tool call it records.
 */
export async function finishAgentCall(
  req: Request,
  tool: string,
  key: ResolvedAgentKey | null,
  started: number,
  error?: unknown
): Promise<void> {
  try {
    const st = (error as { status?: number; code?: string } | undefined);
    const status = !error ? "OK" : st?.status === 429 || st?.code === "RATE_LIMITED" ? "RATE_LIMITED" : "ERROR";
    const keyId = key?.id ?? (await resolveAgentKey(req))?.id ?? null;
    await logAgentEvent({ keyId, tool, status, latencyMs: Date.now() - started });
  } catch {
    // logging is observability, not the request path
  }
}

// ── A2: tamper-evident session log (AIVS-inspired) ─────────────────────────
// Chain is per (keyId ?? "anon", day). Append is serialized with a Postgres
// advisory lock so concurrent tool calls can't fork the chain: each event
// commits prevHash + eventHash atomically. Verification recomputes every
// link — any deletion/edit breaks the chain at that point.

export const GENESIS_HASH = "GENESIS";

function canonicalEvent(input: { tool: string; status: string; day: string; at: string }): string {
  return JSON.stringify({ day: input.day, status: input.status, tool: input.tool, at: input.at });
}

export function hashEventLink(prevHash: string, canonical: string): string {
  return createHash("sha256").update(`${prevHash}|${canonical}`).digest("hex");
}

export function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function logAgentEvent(input: {
  keyId: string | null;
  tool: string;
  status: "OK" | "RATE_LIMITED" | "ERROR";
  latencyMs?: number;
}): Promise<{ id: string; eventHash: string }> {
  const day = currentDay();
  const at = new Date().toISOString();
  const canonical = canonicalEvent({ tool: input.tool, status: input.status, day, at });
  const partition = `${input.keyId ?? "anon"}:${day}`;
  const lockKey = createHash("sha256").update(`agentlog:${partition}`).digest().readInt32BE(0);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
    const last = await tx.agentEvent.findFirst({
      where: input.keyId ? { keyId: input.keyId, day } : { keyId: null, day },
      orderBy: { createdAt: "desc" },
      select: { eventHash: true },
    });
    const prevHash = last?.eventHash ?? GENESIS_HASH;
    const eventHash = hashEventLink(prevHash, canonical);
    const row = await tx.agentEvent.create({
      data: {
        keyId: input.keyId,
        day,
        prevHash,
        eventHash,
        at,
        tool: input.tool,
        status: input.status,
        latencyMs: input.latencyMs ?? null,
      },
      select: { id: true },
    });
    return { id: row.id, eventHash };
  });
}

/** Recompute a (key, day) chain. Returns { ok, checked, brokenAt? }. */
export async function verifyAgentChain(
  keyId: string | null,
  day: string
): Promise<{ ok: boolean; checked: number; brokenAt?: string }> {
  const rows = await prisma.agentEvent.findMany({
    where: input_keyFilter(keyId, day),
    orderBy: { createdAt: "asc" },
    select: { id: true, prevHash: true, eventHash: true, tool: true, status: true, at: true },
  });
  let prev = GENESIS_HASH;
  for (const r of rows) {
    if (r.prevHash !== prev) return { ok: false, checked: rows.length, brokenAt: r.id };
    const canonical = canonicalEvent({ tool: r.tool, status: r.status, day, at: r.at });
    if (hashEventLink(prev, canonical) !== r.eventHash)
      return { ok: false, checked: rows.length, brokenAt: r.id };
    prev = r.eventHash;
  }
  return { ok: true, checked: rows.length };
}

function input_keyFilter(keyId: string | null, day: string) {
  return keyId ? { keyId, day } : { keyId: null, day };
}
