import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the module under test. The real DB is
// exercised by scripts/test-webhooks.ts; here we only verify the bus
// control flow (dedup, fan-out filter, retry scheduling, dead-letter).

const prismaMock = {
  webhookEndpoint: {
    findMany: vi.fn(),
  },
  webhookDelivery: {
    createMany: vi.fn(),
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("./db", () => ({ prisma: prismaMock }));
vi.mock("./einvoice", () => ({ hmacSign: (s: string, b: string) => `sig-${s.length}-${b.length}` }));

import { emit, processPendingDeliveries, rearmDelivery } from "./webhook-bus";

beforeEach(() => {
  vi.restoreAllMocks();
  for (const k of Object.values(prismaMock)) {
    for (const fn of Object.values(k)) {
      (fn as ReturnType<typeof vi.fn>).mockReset();
    }
  }
});

describe("emit", () => {
  it("queues one row per matching endpoint", async () => {
    prismaMock.webhookEndpoint.findMany.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
    prismaMock.webhookDelivery.createMany.mockResolvedValue({ count: 2 });
    const r = await emit({ eventType: "order.paid", orgId: "org1", payload: { x: 1 } });
    expect(r.queued).toBe(2);
    expect(prismaMock.webhookDelivery.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
  });

  it("returns 0 when no endpoints match the event type", async () => {
    prismaMock.webhookEndpoint.findMany.mockResolvedValue([]);
    const r = await emit({ eventType: "order.paid", orgId: "org1", payload: {} });
    expect(r).toEqual({ delivered: 0, queued: 0 });
  });

  it("only emits to endpoints that either have no filter or list the type", async () => {
    prismaMock.webhookEndpoint.findMany.mockResolvedValue([]);
    await emit({ eventType: "invoice.issued", orgId: "org1", payload: {} });
    const where = prismaMock.webhookEndpoint.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe("org1");
    expect(where.active).toBe(true);
    expect(where.OR).toEqual([
      { eventTypes: { isEmpty: true } },
      { eventTypes: { has: "invoice.issued" } },
    ]);
  });

  it("uses the caller's eventId for dedup when provided", async () => {
    prismaMock.webhookEndpoint.findMany.mockResolvedValue([{ id: "e1" }]);
    prismaMock.webhookDelivery.createMany.mockResolvedValue({ count: 1 });
    await emit({ eventId: "evt-abc", eventType: "x", orgId: "o", payload: {} });
    const data = prismaMock.webhookDelivery.createMany.mock.calls[0][0].data;
    expect(data[0].eventId).toBe("evt-abc");
  });
});

describe("processPendingDeliveries", () => {
  it("marks delivered on 2xx and increments attempts", async () => {
    prismaMock.webhookDelivery.findMany.mockResolvedValue([{
      id: "d1",
      eventId: "evt-1",
      eventType: "order.paid",
      payload: { a: 1 },
      attempts: 0,
      createdAt: new Date(),
      endpoint: { id: "e1", url: "https://hook.example.com", secret: "s3cret", active: true, eventTypes: [] },
    }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const r = await processPendingDeliveries();
    expect(r.delivered).toBe(1);
    const update = prismaMock.webhookDelivery.update.mock.calls[0][0];
    expect(update.data.deliveredAt).toBeInstanceOf(Date);
    expect(update.data.lastStatus).toBe(200);
  });

  it("reschedules with backoff on non-2xx", async () => {
    prismaMock.webhookDelivery.findMany.mockResolvedValue([{
      id: "d1",
      eventId: "evt-1",
      eventType: "x",
      payload: {},
      attempts: 0,
      createdAt: new Date(),
      endpoint: { id: "e1", url: "https://hook.example.com", secret: "s3cret", active: true, eventTypes: [] },
    }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const r = await processPendingDeliveries();
    expect(r.delivered).toBe(0);
    const update = prismaMock.webhookDelivery.update.mock.calls[0][0];
    expect(update.data.deliveredAt).toBeUndefined();
    expect(update.data.nextRetryAt).toBeInstanceOf(Date);
    expect(update.data.nextRetryAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("dead-letters after MAX_ATTEMPTS", async () => {
    prismaMock.webhookDelivery.findMany.mockResolvedValue([{
      id: "d1",
      eventId: "evt-1",
      eventType: "x",
      payload: {},
      attempts: 5,
      createdAt: new Date(),
      endpoint: { id: "e1", url: "https://hook.example.com", secret: "s3cret", active: true, eventTypes: [] },
    }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    const r = await processPendingDeliveries();
    expect(r.deadLettered).toBe(1);
    const update = prismaMock.webhookDelivery.update.mock.calls[0][0];
    expect(update.data.lastStatus).toBe(502);
    expect(update.data.nextRetryAt.getTime() - Date.now()).toBeGreaterThan(300 * 24 * 3600 * 1000);
  });

  it("skips inactive endpoints and marks them delivered with a note", async () => {
    prismaMock.webhookDelivery.findMany.mockResolvedValue([{
      id: "d1",
      eventId: "evt-1",
      eventType: "x",
      payload: {},
      attempts: 0,
      createdAt: new Date(),
      endpoint: { id: "e1", url: "https://hook.example.com", secret: "s3cret", active: false, eventTypes: [] },
    }]);
    const r = await processPendingDeliveries();
    expect(r.delivered).toBe(1);
    const update = prismaMock.webhookDelivery.update.mock.calls[0][0];
    expect(update.data.deliveredAt).toBeInstanceOf(Date);
    expect(update.data.lastError).toBe("endpoint inactive");
  });

  it("sends an HMAC signature header on the outgoing POST", async () => {
    prismaMock.webhookDelivery.findMany.mockResolvedValue([{
      id: "d1",
      eventId: "evt-sig",
      eventType: "x",
      payload: { hi: 1 },
      attempts: 0,
      createdAt: new Date(),
      endpoint: { id: "e1", url: "https://hook.example.com", secret: "topsecret", active: true, eventTypes: [] },
    }]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await processPendingDeliveries();
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-melio-event-id"]).toBe("evt-sig");
    expect(headers["x-melio-signature"]).toMatch(/^t=\d+,v1=sig-8-\d+$/);
  });
});

describe("rearmDelivery", () => {
  it("clears lastError and resets nextRetryAt to now", async () => {
    prismaMock.webhookDelivery.update.mockResolvedValue({});
    await rearmDelivery("d1");
    const call = prismaMock.webhookDelivery.update.mock.calls[0][0];
    expect(call.where.id).toBe("d1");
    expect(call.data.nextRetryAt).toBeInstanceOf(Date);
    expect(call.data.lastError).toBeNull();
  });
});
