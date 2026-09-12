import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, hashPassword, audit } from "@/lib/auth";
import { assertWithinPlanLimits } from "@/lib/plan-limits";
import { apiError, fail, reqStr } from "@/lib/api";

// POST /api/team/invite { email, password, role, storeId? } — R2: add staff
// to the caller's org. Requires admin.users (owner/admin). Guards:
//  - plan maxUsers (WS3.2 gap closed here — the users counter finally has a
//    growth path to guard);
//  - role allowlist: owner/admin can never be granted through invite (no
//    privilege-escalation clone of the inviter);
//  - storeId, when given, must belong to the caller's org;
//  - email is globally unique (schema) — inviting an existing account 409s
//    instead of hijacking it.
const INVITABLE_ROLES = [
  "cashier",
  "sales",
  "warehouse",
  "store_manager",
  "purchasing",
  "accountant",
  "marketing",
] as const;

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("admin.users");
    if (!auth.orgId)
      fail(403, "FORBIDDEN", "Invite requires an org-scoped account");
    const body = await req.json().catch(() => ({}));
    const email = reqStr(body.email, "email", 120).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail(400, "VALIDATION", "valid email required");
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 10)
      fail(400, "VALIDATION", "password must be at least 10 characters");
    const role = reqStr(body.role, "role", 32);
    if (!(INVITABLE_ROLES as readonly string[]).includes(role))
      fail(400, "VALIDATION", `role must be one of: ${INVITABLE_ROLES.join(", ")}`);

    let storeId: string | null = null;
    if (body.storeId != null) {
      if (typeof body.storeId !== "string" || !body.storeId)
        fail(400, "VALIDATION", "storeId must be a store id");
      const store = await prisma.store.findFirst({
        where: { id: body.storeId, orgId: auth.orgId as string },
        select: { id: true },
      });
      if (!store) fail(404, "NOT_FOUND", "Store not found in your organization");
      storeId = store.id;
    }

    if (await prisma.user.findUnique({ where: { email } }))
      fail(409, "CONFLICT", "Email already registered");

    // Plan gate BEFORE the create — the org pays per seat.
    await assertWithinPlanLimits(auth, { users: 1 });

    const roleRow = await prisma.role.findUnique({ where: { name: role } });
    if (!roleRow) fail(400, "VALIDATION", `Unknown role: ${role}`);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, passwordHash: hashPassword(password), orgId: auth.orgId as string },
      });
      await tx.userRole.create({
        data: {
          userId: created.id,
          roleId: roleRow.id,
          storeId,
          scopeKey: storeId ?? "*",
        },
      });
      return created;
    });
    await audit(auth.userId, "team.invite", "User", user.id, { email, role, storeId });
    return NextResponse.json({ id: user.id, email, role, storeId }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}

// GET /api/team/invite — list org members (same permission gate).
export async function GET() {
  try {
    const auth = await requirePermission("admin.users");
    const users = await prisma.user.findMany({
      where: auth.orgId ? { orgId: auth.orgId } : {},
      select: {
        id: true, email: true, active: true, createdAt: true,
        roles: { select: { storeId: true, role: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return NextResponse.json({ users });
  } catch (e) {
    return apiError(e);
  }
}
