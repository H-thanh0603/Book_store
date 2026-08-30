import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory cookie jar so we can exercise the same code path the browser
// would, without booting next/headers. Mirrors the minimal surface the
// auth code reads: get(name)?.value, set/delete.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const sessionStore: { rows: any[] } = { rows: [] };
const customerStore: Record<string, any> = {};

vi.mock("./db", () => ({
  prisma: {
    customerSession: {
      create: vi.fn(async ({ data }) => {
        const row = { id: "s-" + sessionStore.rows.length, ...data };
        sessionStore.rows.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where, include }) => {
        const row = sessionStore.rows.find((r) => r.token === where.token) ?? null;
        if (!row) return null;
        if (include?.customer) {
          return { ...row, customer: customerStore[row.customerId] ?? null };
        }
        return row;
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const before = sessionStore.rows.length;
        sessionStore.rows = sessionStore.rows.filter((r) => {
          if (where.token && r.token !== where.token) return true;
          if (where.expiresAt && r.expiresAt >= where.expiresAt.lt) return true;
          return false;
        });
        return { count: before - sessionStore.rows.length };
      }),
    },
    customer: {
      findUnique: vi.fn(async ({ where, select }) => {
        const c = customerStore[where.id];
        if (!c) return null;
        return select ? Object.fromEntries(Object.keys(select).map((k) => [k, c[k]])) : c;
      }),
      update: vi.fn(async ({ where, data }) => {
        customerStore[where.id] = { ...customerStore[where.id], ...data };
        return customerStore[where.id];
      }),
      findFirst: vi.fn(async ({ where }) => {
        const h = where?.emailVerifyTokenHash;
        return Object.values(customerStore).find(
          (c) => c.emailVerifyTokenHash === h && c.emailVerifyExpiresAt > new Date()
        ) ?? null;
      }),
    },
  },
}));

import {
  createCustomerSession,
  destroyCustomerSession,
  getCustomerAuth,
  setCustomerPassword,
  checkCustomerPassword,
  issueEmailVerifyToken,
  consumeEmailVerifyToken,
} from "./customer-auth";

beforeEach(() => {
  jar.clear();
  sessionStore.rows = [];
  for (const k of Object.keys(customerStore)) delete customerStore[k];
});

describe("createCustomerSession", () => {
  it("writes a hashed token to DB and sets the cookie", async () => {
    customerStore["c1"] = { id: "c1", email: "a@x.vn", phone: "0901", name: "A" };
    await createCustomerSession("c1");
    expect(sessionStore.rows).toHaveLength(1);
    const row = sessionStore.rows[0];
    // Token in DB is the SHA-256 of the cookie value.
    expect(row.token).toMatch(/^[0-9a-f]{64}$/);
    expect(jar.get("bs_customer")).toBeTruthy();
    expect(row.token).not.toBe(jar.get("bs_customer"));
  });
});

describe("getCustomerAuth", () => {
  it("returns the customer when session is valid", async () => {
    customerStore["c1"] = { id: "c1", email: "a@x.vn", phone: "0901", name: "Alice" };
    await createCustomerSession("c1");
    const auth = await getCustomerAuth();
    expect(auth?.customerId).toBe("c1");
    expect(auth?.email).toBe("a@x.vn");
  });
  it("returns null when no cookie", async () => {
    expect(await getCustomerAuth()).toBeNull();
  });
  it("returns null when session expired", async () => {
    customerStore["c1"] = { id: "c1", email: "a@x.vn", phone: "0901", name: "A" };
    // Plant an already-expired row directly so getCustomerAuth sees it.
    sessionStore.rows.push({
      id: "s0",
      customerId: "c1",
      token: "x".repeat(64),
      expiresAt: new Date(Date.now() - 1000),
    });
    jar.set("bs_customer", "anything");
    expect(await getCustomerAuth()).toBeNull();
  });
});

describe("destroyCustomerSession", () => {
  it("removes the DB row and the cookie", async () => {
    customerStore["c1"] = { id: "c1", email: null, phone: "0901", name: "A" };
    await createCustomerSession("c1");
    expect(sessionStore.rows).toHaveLength(1);
    await destroyCustomerSession();
    expect(sessionStore.rows).toHaveLength(0);
    expect(jar.get("bs_customer")).toBeUndefined();
  });
});

describe("password roundtrip", () => {
  it("checkCustomerPassword returns true after setCustomerPassword", async () => {
    customerStore["c1"] = { id: "c1", email: null, phone: "0901", name: "A" };
    await setCustomerPassword("c1", "verysecret123");
    expect(await checkCustomerPassword("c1", "verysecret123")).toBe(true);
    expect(await checkCustomerPassword("c1", "nope")).toBe(false);
  });
  it("returns false when no password set", async () => {
    customerStore["c1"] = { id: "c1", email: null, phone: "0901", name: "A" };
    expect(await checkCustomerPassword("c1", "anything")).toBe(false);
  });
});

describe("email verify token", () => {
  it("issueEmailVerifyToken returns a 24h-valid opaque token", () => {
    const t = issueEmailVerifyToken();
    expect(t.raw).toMatch(/^[0-9a-f]{64}$/);
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(t.hash).not.toBe(t.raw);
    expect(t.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
  it("consumeEmailVerifyToken marks verified on match", async () => {
    const { raw, hash, expiresAt } = issueEmailVerifyToken();
    customerStore["c1"] = {
      id: "c1",
      email: "a@x.vn",
      phone: "0901",
      name: "A",
      emailVerifyTokenHash: hash,
      emailVerifyExpiresAt: expiresAt,
    };
    const id = await consumeEmailVerifyToken(raw);
    expect(id).toBe("c1");
    expect(customerStore["c1"].emailVerifiedAt).toBeInstanceOf(Date);
    expect(customerStore["c1"].emailVerifyTokenHash).toBeNull();
  });
  it("consumeEmailVerifyToken returns null on bad token", async () => {
    expect(await consumeEmailVerifyToken("not-a-real-token")).toBeNull();
  });
});
