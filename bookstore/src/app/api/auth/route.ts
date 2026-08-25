import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, destroySession, getAuth, hashPassword, passwordNeedsRehash, revokeOtherSessions, verifyPassword } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, email, password } = body;

    if (action === "login") {
      if (typeof email !== "string" || typeof password !== "string" || !email || !password)
        fail(400, "VALIDATION", "email and password required");
      const normalizedEmail = email.trim().toLowerCase();
      await Promise.all([
        enforceRateLimit("login-ip", clientIp(req.headers), 20, 60_000),
        enforceRateLimit("login-account", normalizedEmail, 10, 5 * 60_000),
      ]);
      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user || !user.active || !verifyPassword(password, user.passwordHash))
        fail(401, "BAD_REQUEST", "Invalid credentials");
      // Transparent upgrade: legacy-parameter rows re-hash at current policy.
      if (passwordNeedsRehash(user.passwordHash))
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password) } });
      await createSession(user.id);
      return ok({ email: user.email });
    }
    if (action === "logout") {
      await destroySession();
      return ok({ ok: true });
    }
    if (action === "change_password") {
      const auth = await getAuth();
      if (!auth) fail(401, "BAD_REQUEST", "Authentication required");
      const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      // Brute-force guard: same tight limit as login.
      await enforceRateLimit("login-ip", clientIp(req.headers), 20, 60_000);
      if (!currentPassword || !newPassword)
        fail(400, "VALIDATION", "currentPassword and newPassword required");
      if (newPassword.length < 10) fail(400, "VALIDATION", "newPassword must be at least 10 characters");
      const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
      if (!verifyPassword(currentPassword, user.passwordHash))
        fail(401, "BAD_REQUEST", "Current password is incorrect");
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: hashPassword(newPassword) },
      });
      // Session rotation: every other device/session dies immediately.
      await revokeOtherSessions(user.id);
      await prisma.auditLog.create({
        data: { actorId: user.id, action: "user.change_password", entity: "User", entityId: user.id },
      });
      return ok({ ok: true });
    }
    fail(400, "VALIDATION", "Unknown action");
  } catch (err) {
    return apiError(err);
  }
}

export async function GET() {
  try {
    const { getAuth } = await import("@/lib/auth");
    const auth = await getAuth();
    return ok(auth ?? { anonymous: true });
  } catch (err) {
    return apiError(err);
  }
}
