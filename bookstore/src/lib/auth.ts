import { scryptSync, randomBytes, timingSafeEqual, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

const SESSION_COOKIE = "bs_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!hash) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

export async function createSession(userId: string) {
  const token = randomUUID() + randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { userId, token, expiresAt } });
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
  if (token) await prisma.session.deleteMany({ where: { token } });
  jar.delete(SESSION_COOKIE);
}

export type AuthContext = {
  userId: string;
  email: string;
  roles: { role: string; storeId: string | null; permissions: string[] }[];
};

export async function getAuth(): Promise<AuthContext | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
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
    roles: session.user.roles.map((ur) => ({
      role: ur.role.name,
      storeId: ur.storeId,
      permissions: ur.role.permissions.map((rp) => rp.permission.code),
    })),
  };
}

/** Backend authorization check. Throws 401/403-shaped Error. */
export async function requirePermission(code: string, storeId?: string) {
  const auth = await getAuth();
  if (!auth) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  const allowed = auth.roles.some(
    (r) =>
      r.permissions.includes(code) &&
      // role scoped to a store only satisfies requests for that store;
      // unscoped requests are satisfied by any matching role
      (r.storeId === null || storeId === undefined || r.storeId === storeId)
  );
  if (!allowed)
    throw Object.assign(new Error(`Forbidden: ${code}`), { status: 403 });
  return auth;
}

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return auth;
}
