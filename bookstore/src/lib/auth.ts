import { createHash, scryptSync, randomBytes, timingSafeEqual, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

const SESSION_COOKIE = "bs_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const SCRYPT_KEYLEN = 64;
// OWASP 2024 password-storage guidance (N=2^17). maxmem must cover 128·N·r bytes.
const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const LEGACY_SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS).toString("hex");
  // Versioned envelope so parameters can rise again without invalidating rows.
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    let params: { N: number; r: number; p: number } | null = null;
    let rest = stored;
    if (stored.startsWith("scrypt$")) {
      const [, nStr, rStr, pStr, tail] = stored.split("$");
      const N = Number(nStr), r = Number(rStr), p = Number(pStr);
      if (!(N > 0 && r > 0 && p > 0 && Number.isInteger(N * r * p))) return false;
      params = { N, r, p };
      rest = tail ?? "";
    }
    const [salt, hash] = rest.split(":");
    if (!salt || !hash) return false;
    // Fail closed on malformed/corrupt rows: a length mismatch would make
    // timingSafeEqual throw RangeError (500 on every login for that account).
    const expected = Buffer.from(hash, "hex");
    if (expected.length !== SCRYPT_KEYLEN) return false;
    const derived = scryptSync(password, salt, SCRYPT_KEYLEN, params ? { ...params, maxmem: 256 * 1024 * 1024 } : LEGACY_SCRYPT);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Legacy-parameter row (or anything unparsable) → rehash after a good login. */
export function passwordNeedsRehash(stored: string): boolean {
  return !stored.startsWith(`scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$`);
}

export async function createSession(userId: string) {
  const token = randomUUID() + randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { userId, token: hashSessionToken(token), expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token: hashSessionToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Kill every OTHER session of a user (password change / compromise response);
 *  the caller's own session stays valid. */
export async function revokeOtherSessions(userId: string) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const currentHash = token ? hashSessionToken(token) : null;
  await prisma.session.deleteMany({
    where: { userId, ...(currentHash ? { token: { not: currentHash } } : {}) },
  });
}

export type AuthContext = {
  userId: string;
  email: string;
  orgId: string | null;
  orgStatus: "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED" | null;
  trialEndsAt: Date | null;
  roles: { role: string; storeId: string | null; permissions: string[] }[];
};

export async function getAuth(): Promise<AuthContext | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token: hashSessionToken(token) },
    include: {
      user: {
        include: {
          org: true,
          roles: {
            include: { role: { include: { permissions: { include: { permission: true } } } } },
          },
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return {
    userId: session.user.id,
    email: session.user.email,
    orgId: session.user.orgId,
    orgStatus: session.user.org?.status ?? null,
    trialEndsAt: session.user.org?.trialEndsAt ?? null,
    roles: session.user.roles.map((ur) => ({
      role: ur.role.name,
      storeId: ur.storeId,
      permissions: ur.role.permissions.map((rp) => rp.permission.code),
    })),
  };
}

/** Org-status gate shared by requirePermission and requireOrgActive. */
function assertOrgUsable(auth: AuthContext) {
  if (!auth.orgId) return; // legacy user — bypass
  if (auth.orgStatus === "ACTIVE") return;
  if (auth.orgStatus === "TRIAL" && auth.trialEndsAt && auth.trialEndsAt > new Date()) return;
  throw Object.assign(new Error(`Forbidden: org ${auth.orgStatus}`), { status: 403 });
}

/** Backend authorization check. Throws 401/403-shaped Error. Suspended or
 *  expired-trial orgs are rejected centrally (audit 2026-08-30 BILL-001 —
 *  requireOrgActive existed but had zero call sites). Routes a suspended
 *  owner must still reach to PAY the overdue invoice opt out explicitly via
 *  { allowSuspended: true }. */
export async function requirePermission(
  code: string,
  storeId?: string | null,
  opts?: { allowSuspended?: boolean }
) {
  const auth = await getAuth();
  if (!auth) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  if (!opts?.allowSuspended) assertOrgUsable(auth);
  const allowed = auth.roles.some(
    (r) =>
      r.permissions.includes(code) &&
      // undefined means the caller will clamp a list with resolveStoreScope;
      // null explicitly means an organisation-wide resource.
      (storeId === undefined || r.storeId === null || r.storeId === storeId)
  );
  if (!allowed)
    throw Object.assign(new Error(`Forbidden: ${code}`), { status: 403 });
  return auth;
}

/**
 * Central store-scoping for list/query filters (deliverable 1).
 * Returns the storeIds the caller may see:
 *  - null            → unscoped role, no filter (all stores)
 *  - string[]        → clamp to these stores
 * A store-scoped role requesting another store — or an unscoped request that
 * can't be satisfied — gets 403. Omitted storeId is clamped to the caller's
 * own stores, never widened to "all".
 */
export function resolveStoreScope(
  auth: AuthContext,
  requestedStoreId?: string | null,
  permission?: string
): string[] | null {
  const relevant = permission
    ? auth.roles.filter((r) => r.permissions.includes(permission))
    : auth.roles;
  const unscoped = relevant.some((r) => r.storeId === null);
  if (unscoped) return requestedStoreId ? [requestedStoreId] : null;
  const mine = [...new Set(relevant.map((r) => r.storeId).filter((s): s is string => !!s))];
  if (mine.length === 0)
    throw Object.assign(new Error("Forbidden: no store scope"), { status: 403 });
  if (requestedStoreId) {
    if (!mine.includes(requestedStoreId))
      throw Object.assign(new Error(`Forbidden: store ${requestedStoreId}`), { status: 403 });
    return [requestedStoreId];
  }
  return mine;
}

/**
 * Assert the caller (via resolveStoreScope) may act on data living in
 * `dataStoreId`. Use after loading the row a mutation targets.
 */
export function assertStoreAccess(
  auth: AuthContext,
  dataStoreId: string | null | undefined,
  permission?: string
) {
  const scope = resolveStoreScope(auth, dataStoreId, permission);
  if (scope === null) return;
  if (!dataStoreId || !scope.includes(dataStoreId))
    throw Object.assign(new Error("Forbidden: store scope"), { status: 403 });
}

/** Write a sensitive-mutation audit row (deliverable 4). */
export async function audit(
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  meta?: Record<string, unknown>,
  // ponytail: structural tx type so both PrismaClient and Prisma.TransactionClient fit
  tx?: { auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> } } | Record<string, unknown>
) {
  const data = {
    actorId, action, entity, entityId,
    after: meta ? JSON.parse(JSON.stringify(meta)) : undefined,
  };
  const client = tx as { auditLog?: { create: (a: { data: Record<string, unknown> }) => Promise<unknown> } } | undefined;
  if (client?.auditLog) await client.auditLog.create({ data });
  else await prisma.auditLog.create({ data });
}

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return auth;
}

/**
 * Enforce that the caller's org is usable. Trial is allowed until
 * trialEndsAt; ACTIVE always passes; everything else rejects. Owner role
 * (legacy superuser without orgId) bypasses so the existing admin path
 * keeps working through the migration window.
 */
export async function requireOrgActive(): Promise<AuthContext> {
  const auth = await requireAuth();
  assertOrgUsable(auth);
  return auth;
}

export async function pruneExpiredSessions() {
  return prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

export async function pruneExpiredResetTokens() {
  // Keep recently-used rows briefly for audit value; drop everything stale.
  return prisma.passwordResetToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } }] },
  });
}
