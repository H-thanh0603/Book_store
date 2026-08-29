// Self-serve org signup. Creates Organization (TRIAL, +14d),
// one Region, one Store, one owner User, and an `owner` role +
// permission wiring in case the seed has never run.
//
// The owner role is the only role assigned to the new user; the
// other six (cashier, sales, warehouse, store_manager, purchasing,
// admin) are seeded by the same upsert path so a brand-new database
// with no seed still gets a working account.
//
// ponytail: password hashing + session creation reuse auth.ts. The
// only thing this module owns is the org/user bootstrap transaction
// and slug dedupe.

import { createHash } from "node:crypto";
import { prisma } from "./db";
import { createSession, hashPassword } from "./auth";

const TRIAL_DAYS = 14;

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "org";
}

const BASE_PERMS = [
  "product.view", "product.update", "inventory.view", "inventory.adjust",
  "inventory.transfer", "pos.sell", "pos.refund", "pos.override_price",
  "purchase.create", "purchase.approve", "purchase.receive",
  "customer.view", "customer.update", "promotion.manage",
  "reports.financial.view", "reports.store.view", "admin.users", "admin.config",
];

const ROLE_PERMS: Record<string, string[]> = {
  owner: BASE_PERMS,
};

async function ensureRolesAndPerms() {
  const perms = await Promise.all(
    BASE_PERMS.map((code) => prisma.permission.upsert({ where: { code }, create: { code }, update: {} }))
  );
  for (const [roleName, codes] of Object.entries(ROLE_PERMS)) {
    const role = await prisma.role.upsert({ where: { name: roleName }, create: { name: roleName }, update: {} });
    for (const code of codes) {
      const p = perms.find((x) => x.code === code)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
        create: { roleId: role.id, permissionId: p.id },
        update: {},
      });
    }
  }
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 1;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

export type SignupInput = {
  orgName: string;
  ownerName?: string;
  email: string;
  password: string;
  storeName?: string;
};

export async function signup(input: SignupInput): Promise<{ orgId: string; userId: string; slug: string }> {
  const org = await prisma.organization.create({
    data: {
      name: input.orgName,
      slug: await uniqueSlug(slugify(input.orgName)),
      status: "TRIAL",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
    },
  });
  const region = await prisma.region.create({ data: { name: "Miền Nam", orgId: org.id } });
  const storeCode = `STORE-${createHash("sha256").update(org.id).digest("hex").slice(0, 6).toUpperCase()}`;
  const store = await prisma.store.create({
    data: { name: input.storeName ?? `${input.orgName} - Trụ sở`, code: storeCode, regionId: region.id },
  });
  await ensureRolesAndPerms();
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: "owner" } });
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash: hashPassword(input.password),
      orgId: org.id,
    },
  });
  await prisma.userRole.create({
    data: { userId: user.id, roleId: ownerRole.id, storeId: store.id, scopeKey: store.id },
  });
  void store;
  await createSession(user.id);
  return { orgId: org.id, userId: user.id, slug: org.slug };
}
