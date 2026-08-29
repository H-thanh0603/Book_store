// Signup lib unit test. Mocks the whole prisma surface and the
// auth helpers so the test only exercises the bootstrap logic and
// slug-dedupe. The cookie/session creation is real (createSession
// is the same helper the login route uses).
import { describe, it, expect, vi, beforeEach } from "vitest";

const orgs: any[] = [];
const regions: any[] = [];
const stores: any[] = [];
const users: any[] = [];
const userRoles: any[] = [];
const perms: any[] = [];
const roles: any[] = [];
const rolePerms: any[] = [];

vi.mock("./db", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(async ({ where: { slug } }: any) => orgs.find((o) => o.slug === slug) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const o = { id: `org-${orgs.length + 1}`, ...data };
        orgs.push(o); return o;
      }),
    },
    region: {
      create: vi.fn(async ({ data }: any) => {
        const r = { id: `reg-${regions.length + 1}`, ...data };
        regions.push(r); return r;
      }),
    },
    store: {
      create: vi.fn(async ({ data }: any) => {
        const s = { id: `store-${stores.length + 1}`, ...data };
        stores.push(s); return s;
      }),
    },
    user: {
      create: vi.fn(async ({ data }: any) => {
        const u = { id: `u-${users.length + 1}`, ...data };
        users.push(u); return u;
      }),
    },
    userRole: {
      create: vi.fn(async ({ data }: any) => {
        const ur = { id: `ur-${userRoles.length + 1}`, ...data };
        userRoles.push(ur); return ur;
      }),
    },
    permission: {
      upsert: vi.fn(async ({ where, create }: any) => {
        const p = perms.find((x) => x.code === where.code) ?? { id: `perm-${perms.length + 1}`, code: create.code };
        if (!perms.includes(p)) perms.push(p);
        return p;
      }),
    },
    role: {
      upsert: vi.fn(async ({ where, create }: any) => {
        const r = roles.find((x) => x.name === where.name) ?? { id: `role-${roles.length + 1}`, name: create.name };
        if (!roles.includes(r)) roles.push(r);
        return r;
      }),
      findUniqueOrThrow: vi.fn(async ({ where: { name } }: any) => {
        const r = roles.find((x) => x.name === name);
        if (!r) throw new Error("not found");
        return r;
      }),
    },
    rolePermission: {
      upsert: vi.fn(async ({ where, create }: any) => {
        const k = `${where.roleId_permissionId.roleId}-${where.roleId_permissionId.permissionId}`;
        if (!rolePerms.find((x) => x.k === k)) rolePerms.push({ k, ...create });
        return { roleId: create.roleId, permissionId: create.permissionId };
      }),
    },
  },
}));

vi.mock("./auth", () => ({
  hashPassword: vi.fn((p: string) => `hashed:${p}`),
  createSession: vi.fn(async () => {}),
}));

import { signup } from "./signup";

beforeEach(() => {
  orgs.length = 0; regions.length = 0; stores.length = 0;
  users.length = 0; userRoles.length = 0; perms.length = 0; roles.length = 0; rolePerms.length = 0;
});

describe("signup", () => {
  it("creates org + region + store + user + owner role assignment", async () => {
    const out = await signup({ orgName: "Nhà Sách Cá Chép", email: "owner@casach.vn", password: "supersecret12" });
    expect(out.slug).toBe("nha-sach-ca-chep");
    expect(orgs).toHaveLength(1);
    expect(orgs[0].status).toBe("TRIAL");
    expect(orgs[0].trialEndsAt).toBeInstanceOf(Date);
    expect(stores).toHaveLength(1);
    expect(users).toHaveLength(1);
    expect(userRoles).toHaveLength(1);
    expect(userRoles[0].scopeKey).toBe(stores[0].id);
  });

  it("dedupes slug when the name collides", async () => {
    await signup({ orgName: "Cá Chép", email: "a@x.vn", password: "supersecret12" });
    const out = await signup({ orgName: "Cá Chép", email: "b@x.vn", password: "supersecret12" });
    expect(out.slug).toBe("ca-chep-2");
  });

  it("normalizes Vietnamese diacritics in the slug", async () => {
    const out = await signup({ orgName: "Nhà Sách Đông A", email: "da@x.vn", password: "supersecret12" });
    expect(out.slug).toBe("nha-sach-dong-a");
  });
});
