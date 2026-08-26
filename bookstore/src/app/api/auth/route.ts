import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
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

    if (action === "request_reset") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email) fail(400, "VALIDATION", "email required");
      await Promise.all([
        enforceRateLimit("reset-ip", clientIp(req.headers), 10, 15 * 60_000),
        enforceRateLimit("reset-account", email, 3, 15 * 60_000),
      ]);
      // Generic response regardless of account existence — no enumeration.
      const user = await prisma.user.findUnique({ where: { email } });
      if (user?.active) {
        const token = randomBytes(32).toString("hex");
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: createHash("sha256").update(token).digest("hex"),
            expiresAt: new Date(Date.now() + 30 * 60_000),
          },
        });
        const origin = process.env.APP_ORIGIN ?? new URL(req.url).origin;
        const link = `${origin}/login?reset=${token}`;
        const { sendMail } = await import("@/lib/mail");
        void sendMail({
          to: user.email,
          subject: "Melio Bookstore — Đặt lại mật khẩu",
          text: `Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu. Link có hiệu lực 30 phút, dùng đúng một lần:\n\n${link}\n\nNếu không phải bạn yêu cầu, hãy bỏ qua email này.`,
          html: `<p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu.</p><p><a href="${link}">Đặt lại mật khẩu</a> — link có hiệu lực 30 phút và dùng đúng một lần.</p><p>Nếu không phải bạn yêu cầu, hãy bỏ qua email này.</p>`,
        }).catch((mailErr: unknown) => {
          console.error(JSON.stringify({ level: "error", event: "reset_mail_failed", message: String(mailErr) }));
        });
      }
      return ok({ ok: true });
    }

    if (action === "reset_password") {
      const token = typeof body.token === "string" ? body.token : "";
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      if (!token || !newPassword) fail(400, "VALIDATION", "token and newPassword required");
      if (newPassword.length < 10) fail(400, "VALIDATION", "newPassword must be at least 10 characters");
      // Same per-account throttle as login attempts keeps brute force on the
      // token space bounded (token itself is 256-bit; this is belt-and-braces).
      await enforceRateLimit("reset-ip", clientIp(req.headers), 10, 15 * 60_000);
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const result = await prisma.$transaction(async (tx) => {
        // Atomic single-use claim: a racing second request finds usedAt set.
        const claimed = await tx.passwordResetToken.updateMany({
          where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1) fail(400, "VALIDATION", "Reset link is invalid or has expired");
        const record = await tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash } });
        await tx.user.update({
          where: { id: record.userId },
          data: { passwordHash: hashPassword(newPassword) },
        });
        // Kill every session — the credential just changed under them.
        await tx.session.deleteMany({ where: { userId: record.userId } });
        return record;
      });
      await prisma.auditLog.create({
        data: { actorId: result.userId, action: "user.reset_password", entity: "User", entityId: result.userId },
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
