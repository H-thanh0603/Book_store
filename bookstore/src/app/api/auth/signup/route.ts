// Public signup. Rate-limited by IP at 5/h. No CSRF token check
// because the form posts JSON and the cookie is set on success —
// the form must render with sameSite=lax and the response carries
// a 201 status; cross-site POSTs from a third-party origin won't
// carry the new cookie back to the user's browser.
//
// Validation: orgName 2-80, email RFC-ish (loose regex; the mail
// library's MX probe is the real check), password >= 10 chars.

import { NextRequest, NextResponse } from "next/server";
import { signup } from "@/lib/signup";
import { apiError, ok } from "@/lib/api";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { Prisma } from "@/generated/prisma/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    await enforceRateLimit("signup", clientIp(req.headers), 5, 3_600_000);
    const body = (await req.json().catch(() => ({}))) as {
      orgName?: string; email?: string; password?: string; storeName?: string;
    };
    if (!body.orgName || body.orgName.trim().length < 2 || body.orgName.length > 80)
      return ok({ error: "VALIDATION", message: "orgName 2-80 chars" }, 400);
    if (!body.email || !EMAIL_RE.test(body.email))
      return ok({ error: "VALIDATION", message: "valid email required" }, 400);
    if (!body.password || body.password.length < 10)
      return ok({ error: "VALIDATION", message: "password >= 10 chars" }, 400);
    const result = await signup({
      orgName: body.orgName.trim(),
      email: body.email,
      password: body.password,
      storeName: body.storeName?.trim() || undefined,
    });
    return NextResponse.json({ orgId: result.orgId, slug: result.slug }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
      return ok({ error: "CONFLICT", message: "email or org slug already taken" }, 409);
    return apiError(err);
  }
}
