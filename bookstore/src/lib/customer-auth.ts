// Storefront-side customer auth. Mirrors the staff auth surface in
// src/lib/auth.ts but lives on its own cookie + CustomerSession table so
// a customer logged into /shop can never accidentally ride a staff
// session (and vice versa). Password hashing, scrypt params, and
// session-token hashing reuse the staff primitives — same envelope, same
// SHA-256, so password reuse is transparent and verifyPassword works
// against rows created here without a migration.
//
// ponytail: one cookie, one table, no refresh token. 30-day TTL is
// generous for a bookstore storefront. If a customer later needs
// "sign out everywhere" or per-device revocation, add a currentToken
// column on Customer and invalidate against that.

import { createHash, randomBytes, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { hashPassword, verifyPassword } from "./auth";

const CUSTOMER_COOKIE = "bs_customer";
const CUSTOMER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type CustomerAuth = {
  customerId: string;
  email: string | null;
  phone: string;
  name: string;
};

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createCustomerSession(customerId: string) {
  const token = randomUUID() + randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + CUSTOMER_TTL_MS);
  await prisma.customerSession.create({
    data: { customerId, token: hashSessionToken(token), expiresAt },
  });
  const jar = await cookies();
  jar.set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroyCustomerSession() {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (token) {
    await prisma.customerSession.deleteMany({ where: { token: hashSessionToken(token) } });
  }
  jar.delete(CUSTOMER_COOKIE);
}

export async function getCustomerAuth(): Promise<CustomerAuth | null> {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.customerSession.findUnique({
    where: { token: hashSessionToken(token) },
    include: { customer: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return {
    customerId: session.customer.id,
    email: session.customer.email,
    phone: session.customer.phone,
    name: session.customer.name,
  };
}

export async function requireCustomerAuth(): Promise<CustomerAuth> {
  const auth = await getCustomerAuth();
  if (!auth) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return auth;
}

export async function setCustomerPassword(customerId: string, password: string) {
  const hash = hashPassword(password);
  await prisma.customer.update({ where: { id: customerId }, data: { passwordHash: hash } });
}

export async function checkCustomerPassword(customerId: string, password: string) {
  const row = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { passwordHash: true },
  });
  if (!row?.passwordHash) return false;
  return verifyPassword(password, row.passwordHash);
}

/** Random opaque token + SHA-256 stored, raw returned to caller for the
 *  verify-email link. Same shape as PasswordResetToken. */
export function issueEmailVerifyToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString("hex");
  const hash = hashSessionToken(raw);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  return { raw, hash, expiresAt };
}

export async function consumeEmailVerifyToken(raw: string) {
  const hash = hashSessionToken(raw);
  const row = await prisma.customer.findFirst({
    where: { emailVerifyTokenHash: hash, emailVerifyExpiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!row) return null;
  await prisma.customer.update({
    where: { id: row.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerifyTokenHash: null,
      emailVerifyExpiresAt: null,
    },
  });
  return row.id;
}

export async function pruneExpiredCustomerSessions() {
  return prisma.customerSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
