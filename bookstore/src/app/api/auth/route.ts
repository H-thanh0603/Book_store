import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { apiError, ok, fail } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const { action, email, password } = await req.json();
    if (!email || !password) fail(400, "VALIDATION", "email and password required");

    if (action === "login") {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.active || !verifyPassword(password, user.passwordHash))
        fail(401, "BAD_REQUEST", "Invalid credentials");
      await createSession(user.id);
      return ok({ email: user.email });
    }
    if (action === "logout") {
      await destroySession();
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
