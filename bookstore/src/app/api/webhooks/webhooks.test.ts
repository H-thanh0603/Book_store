// Endpoints CRUD + rotate + deliveries rearm coverage. We mock the
// whole prisma + requirePermission surface so the route's auth/where
// logic runs against a deterministic in-memory store.

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- in-memory fakes ---------------------------------------------------------

const endpoints = new Map<string, any>();
const deliveries = new Map<string, any>();
const auth = { orgId: "org-A", userId: "u1", permissions: new Set(["settings.write"]) };

vi.mock("@/lib/db", () => ({
  prisma: {
    webhookEndpoint: {
      findMany: vi.fn(async ({ where }: any) => {
        const list = [...endpoints.values()].filter((e) => !where || (where.orgId ? e.orgId === where.orgId : true));
        return list;
      }),
      create: vi.fn(async ({ data, select }: any) => {
        const id = `ep-${endpoints.size + 1}`;
        const row = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        endpoints.set(id, row);
        const out: any = { id: row.id, provider: row.provider, url: row.url, eventTypes: row.eventTypes, active: row.active, description: row.description, createdAt: row.createdAt, updatedAt: row.updatedAt };
        if (select?.secret) out.secret = row.secret;
        return out;
      }),
      findUniqueOrThrow: vi.fn(async ({ where, select }: any) => {
        const e = endpoints.get(where.id);
        if (!e) throw new Error("not found");
        const out: any = { id: e.id, provider: e.provider, url: e.url, eventTypes: e.eventTypes, active: e.active, description: e.description, createdAt: e.createdAt, updatedAt: e.updatedAt };
        if (select?.secret) out.secret = e.secret;
        return out;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const e = endpoints.get(where.id);
        if (!e || (where.orgId && e.orgId !== where.orgId)) return { count: 0 };
        Object.assign(e, data, { updatedAt: new Date() });
        return { count: 1 };
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const e = endpoints.get(where.id);
        if (!e || (where.orgId && e.orgId !== where.orgId)) return { count: 0 };
        endpoints.delete(where.id);
        return { count: 1 };
      }),
    },
    webhookDelivery: {
      findMany: vi.fn(async ({ where, take = 200 }: any) => {
        let list = [...deliveries.values()];
        if (where?.endpointId) list = list.filter((d) => d.endpointId === where.endpointId);
        if (where?.eventType) list = list.filter((d) => d.eventType === where.eventType);
        if (where?.endpoint?.orgId) list = list.filter((d) => endpoints.get(d.endpointId)?.orgId === where.endpoint.orgId);
        if (where?.deliveredAt) {
          if ("not" in where.deliveredAt) list = list.filter((d) => d.deliveredAt !== null);
          else list = list.filter((d) => d.deliveredAt === null);
        }
        if (where?.nextRetryAt) {
          if (where.nextRetryAt.lte) list = list.filter((d) => d.nextRetryAt <= where.nextRetryAt.lte);
          if (where.nextRetryAt.gt) list = list.filter((d) => d.nextRetryAt > where.nextRetryAt.gt);
        }
        return list.slice(0, take);
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const d = deliveries.get(where.id);
        if (!d) return { count: 0 };
        if (where.endpoint?.orgId && endpoints.get(d.endpointId)?.orgId !== where.endpoint.orgId) return { count: 0 };
        Object.assign(d, data);
        return { count: 1 };
      }),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ requirePermission: vi.fn(async () => auth) }));

// --- tests -------------------------------------------------------------------

beforeEach(() => {
  endpoints.clear();
  deliveries.clear();
});

describe("POST /api/webhooks/endpoints", () => {
  it("returns the secret once and only once", async () => {
    const { POST, GET } = await import("./endpoints/route");
    const created = await POST({
      json: async () => ({ provider: "custom", url: "https://x.test/hook", eventTypes: ["order.paid"] }),
    } as any);
    const body = await (created as Response).json();
    expect(body.endpoint.secret).toMatch(/^[0-9a-f]{64}$/);
    const listed = await GET();
    const list = await (listed as Response).json();
    expect(list.endpoints[0]).not.toHaveProperty("secret");
  });

  it("rejects non-http urls", async () => {
    const { POST } = await import("./endpoints/route");
    const res = await POST({ json: async () => ({ provider: "x", url: "ftp://x" }) } as any);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/webhooks/endpoints/[id]/rotate", () => {
  it("replaces the secret and the old one no longer matches", async () => {
    const { POST: create } = await import("./endpoints/route");
    const c = await create({ json: async () => ({ provider: "x", url: "https://x.test/h" }) } as any);
    const { endpoint } = await (c as Response).json();
    const { POST: rotate } = await import("./endpoints/[id]/rotate/route");
    const r = await rotate({} as any, { params: Promise.resolve({ id: endpoint.id }) });
    const out = await (r as Response).json();
    expect(out.secret).not.toBe(endpoint.secret);
    expect(out.secret).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("DELETE /api/webhooks/endpoints/[id]", () => {
  it("returns 404 for a foreign org's endpoint", async () => {
    endpoints.set("ep-other", { id: "ep-other", orgId: "org-B", secret: "s", url: "https://x.test", eventTypes: [], active: true, createdAt: new Date() });
    const { DELETE } = await import("./endpoints/[id]/route");
    const res = await DELETE({} as any, { params: Promise.resolve({ id: "ep-other" }) });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/webhooks/deliveries/[id]/rearm", () => {
  it("moves nextRetryAt to now and clears lastError", async () => {
    endpoints.set("ep1", { id: "ep1", orgId: "org-A", secret: "s" });
    deliveries.set("d1", { id: "d1", endpointId: "ep1", nextRetryAt: new Date(Date.now() + 365 * 86400_000), lastError: "dead" });
    const { POST } = await import("./deliveries/[id]/rearm/route");
    const res = await POST({} as any, { params: Promise.resolve({ id: "d1" }) });
    expect(res.status).toBe(204);
    expect(deliveries.get("d1").lastError).toBeNull();
    expect(deliveries.get("d1").nextRetryAt.getTime()).toBeLessThan(Date.now() + 1000);
  });
});
