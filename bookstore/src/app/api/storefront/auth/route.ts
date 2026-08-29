// Storefront customer auth: signup / login / logout / verify_email.
// Public route — listed in middleware PUBLIC_PREFIXES so no staff
// session is required. Mirrors src/app/api/auth/route.ts shape:
// action discriminator, rate-limited, bcrypt-equivalent scrypt
// hashing, audit on credential change. Cookie is `bs_customer`
// (set by customer-auth.ts), completely independent of the staff
// `bs_session` cookie.
//
// ponytail: 1 OTP channel (email) — phone verify ships in B3+ if a
// customer reports friction. Reuse mail.ts for the verify link; no
// new mail transport.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  checkCustomerPassword,
  consumeEmailVerifyToken,
  createCustomerSession,
  destroyCustomerSession,
  getCustomerAuth,
  issueEmailVerifyToken,
  setCustomerPassword,
} from "@/lib/customer-auth";
import { apiError, fail, ok } from "@/lib/api";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "signup") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!name || name.length > 120) fail(400, "VALIDATION", "name required (max 120)");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "VALIDATION", "valid email required");
      if (!/^[0-9+\-\s()]{8,20}$/.test(phone)) fail(400, "VALIDATION", "valid phone required");
      if (password.length < 10) fail(400, "VALIDATION", "password must be at least 10 characters");
      await Promise.all([
        enforceRateLimit("cust-signup-ip", clientIp(req.headers), 5, 60 * 60_000),
        enforceRateLimit("cust-signup-email", email, 3, 60 * 60_000),
      ]);
      // Two uniqueness checks (phone and email) before insert. Both
      // are covered by unique constraints in the DB; checking first
      // gives a clean 409 instead of a 500 from a constraint violation.
      const [existingEmail, existingPhone] = await Promise.all([
        email ? prisma.customer.findFirst({ where: { email }, select: { id: true } }) : null,
        prisma.customer.findUnique({ where: { phone }, select: { id: true } }),
      ]);
      if (existingEmail) fail(409, "CONFLICT", "Email already registered");
      if (existingPhone) fail(409, "CONFLICT", "Phone already registered");

      // Auto-increment the CUS-XXXXXX code so the unique index is
      // satisfied without coordinating with the staff-side code
      // generator (which the storefront may not be able to call).
      const last = await prisma.customer.findFirst({
        orderBy: { code: "desc" },
        select: { code: true },
        where: { code: { startsWith: "CUS-" } },
      });
      const nextNum = last ? Number(last.code.slice(4)) + 1 : 1;
      const code = "CUS-" + String(nextNum).padStart(6, "0");

      const token = issueEmailVerifyToken();
      const customer = await prisma.customer.create({
        data: {
          code,
          name,
          phone,
          email,
          passwordHash: null,
          emailVerifyTokenHash: token.hash,
          emailVerifyExpiresAt: token.expiresAt,
        },
        select: { id: true, email: true },
      });
      await setCustomerPassword(customer.id, password);
      await createCustomerSession(customer.id);

      // Fire-and-forget verify email. Failure to send is logged but
      // does not fail signup — the row is verifiable later via
      // resend (next iteration).
      const origin = process.env.APP_ORIGIN ?? new URL(req.url).origin;
      const link = `${origin}/shop/account?verify=${token.raw}`;
      if (email) {
        const { sendMail } = await import("@/lib/mail");
        void sendMail({
          to: email,
          subject: "Melio Bookstore — Xác nhận email",
          text: `Chào ${name},\n\nXác nhận email để mở khóa đầy đủ tính năng tài khoản (link 24h, dùng một lần):\n\n${link}\n\nNếu bạn không tạo tài khoản, hãy bỏ qua email này.`,
          html: `<p>Chào ${name},</p><p><a href="${link}">Xác nhận email</a> — link có hiệu lực 24h và dùng đúng một lần.</p><p>Nếu bạn không tạo tài khoản, hãy bỏ qua email này.</p>`,
        }).catch((mailErr: unknown) => {
          console.error(JSON.stringify({ level: "error", event: "cust_verify_mail_failed", message: String(mailErr) }));
        });
      }
      return ok({ customerId: customer.id, email: customer.email, verifySent: true }, 201);
    }

    if (action === "login") {
      // Login can use either email or phone; we try both.
      const id = typeof body.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!id || !password) fail(400, "VALIDATION", "identifier and password required");
      await Promise.all([
        enforceRateLimit("cust-login-ip", clientIp(req.headers), 20, 60_000),
        enforceRateLimit("cust-login-id", id, 10, 5 * 60_000),
      ]);
      const customer = id.includes("@")
        ? await prisma.customer.findFirst({ where: { email: id } })
        : await prisma.customer.findUnique({ where: { phone: id } });
      if (!customer) fail(401, "BAD_REQUEST", "Invalid credentials");
      const ok2 = await checkCustomerPassword(customer.id, password);
      if (!ok2) fail(401, "BAD_REQUEST", "Invalid credentials");
      await createCustomerSession(customer.id);
      return ok({ customerId: customer.id });
    }

    if (action === "logout") {
      await destroyCustomerSession();
      return ok({ ok: true });
    }

    if (action === "verify_email") {
      const token = typeof body.token === "string" ? body.token : "";
      if (!token) fail(400, "VALIDATION", "token required");
      const customerId = await consumeEmailVerifyToken(token);
      if (!customerId) fail(400, "VALIDATION", "Verify link is invalid or has expired");
      return ok({ customerId, verified: true });
    }

    if (action === "change_password") {
      const auth = await getCustomerAuth();
      if (!auth) fail(401, "BAD_REQUEST", "Authentication required");
      const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      if (!currentPassword || !newPassword) fail(400, "VALIDATION", "currentPassword and newPassword required");
      if (newPassword.length < 10) fail(400, "VALIDATION", "newPassword must be at least 10 characters");
      await enforceRateLimit("cust-login-ip", clientIp(req.headers), 20, 60_000);
      const ok3 = await checkCustomerPassword(auth.customerId, currentPassword);
      if (!ok3) fail(401, "BAD_REQUEST", "Current password is incorrect");
      await setCustomerPassword(auth.customerId, newPassword);
      // Kill every other device session for this customer.
      await prisma.customerSession.deleteMany({
        where: { customerId: auth.customerId, NOT: { expiresAt: { lt: new Date() } } },
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
    const auth = await getCustomerAuth();
    return ok(auth ?? { anonymous: true });
  } catch (err) {
    return apiError(err);
  }
}
