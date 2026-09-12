import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  keys: new Map<string, any>(),
  events: [] as any[],
}));

vi.mock("./db", () => ({
  prisma: {
    agentKey: {
      create: vi.fn(async (args: any) => {
        const row = { id: "key-1", quotaPerMin: args.data.quotaPerMin ?? 120, status: "ACTIVE", ...args.data };
        hoisted.keys.set(args.data.keyHash, row);
        return { id: row.id, quotaPerMin: row.quotaPerMin };
      }),
      findUnique: vi.fn(async (args: any) => hoisted.keys.get(args.where.keyHash) ?? null),
      update: vi.fn(async () => ({})),
    },
    agentEvent: {
      findFirst: vi.fn(async () => {
        const last = hoisted.events[hoisted.events.length - 1];
        return last ? { eventHash: last.eventHash } : null;
      }),
      findMany: vi.fn(async () => hoisted.events),
      create: vi.fn(async (args: any) => {
        const row = { id: `ev-${hoisted.events.length}`, ...args.data };
        hoisted.events.push(row);
        return { id: row.id };
      }),
    },
    $transaction: vi.fn(async (fn: any) =>
      fn({
        $executeRaw: vi.fn(async () => []),
        agentKey: {
          updateMany: vi.fn(),
          findFirst: vi.fn(),
        },
        agentEvent: {
          findFirst: vi.fn(async () => {
            const last = hoisted.events[hoisted.events.length - 1];
            return last ? { eventHash: last.eventHash } : null;
          }),
          create: vi.fn(async (args: any) => {
            const row = { id: `ev-${hoisted.events.length}`, ...args.data };
            hoisted.events.push(row);
            return { id: row.id };
          }),
          findMany: vi.fn(async () => hoisted.events),
        },
      })
    ),
  },
}));

vi.mock("./rate-limit", () => ({
  clientIp: vi.fn(() => "127.0.0.1"),
  enforceRateLimit: vi.fn(async () => {}),
}));

import {
  issueAgentKey,
  resolveAgentKey,
  agentRateLimit,
  logAgentEvent,
  verifyAgentChain,
  hashAgentKey,
} from "./agent-auth";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://x.test/api/storefront", { headers });
}

describe("agent keys", () => {
  beforeEach(() => {
    hoisted.keys.clear();
    hoisted.events = [];
  });

  it("issues a key whose plaintext verifies exactly once", async () => {
    const issued = await issueAgentKey({ label: "partner bot" });
    expect(issued.plaintext).toMatch(/^mk_[0-9a-f]{32}$/);
    const resolved = await resolveAgentKey(req({ "x-agent-key": issued.plaintext }));
    expect(resolved?.id).toBe("key-1");
    // Wrong key resolves to nothing (no oracle difference vs missing).
    await expect(resolveAgentKey(req({ "x-agent-key": "mk_deadbeef" }))).resolves.toBeNull();
    await expect(resolveAgentKey(req())).resolves.toBeNull();
  });

  it("keyed callers get their own quota namespace", async () => {
    const { enforceRateLimit } = await import("@/lib/rate-limit");
    const issued = await issueAgentKey({ label: "bot", quotaPerMin: 500 });
    const key = await agentRateLimit(req({ "x-agent-key": issued.plaintext }), "search_products", "storefront-catalog", 60);
    expect(key?.quotaPerMin).toBe(500);
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.stringMatching(/^agent:key-1:search_products$/),
      "key:key-1",
      500,
      60_000
    );
  });

  it("anonymous callers keep the legacy IP bucket", async () => {
    const { enforceRateLimit } = await import("@/lib/rate-limit");
    const key = await agentRateLimit(req(), "track_order", "storefront-track", 20);
    expect(key).toBeNull();
    expect(enforceRateLimit).toHaveBeenCalledWith("storefront-track", "127.0.0.1", 20, 60_000);
  });
});

describe("hash-chained session log", () => {
  beforeEach(() => {
    hoisted.keys.clear();
    hoisted.events = [];
  });

  it("appends linked events and verifies clean", async () => {
    await logAgentEvent({ keyId: null, tool: "search_products", status: "OK" });
    await logAgentEvent({ keyId: null, tool: "quote_order", status: "OK" });
    expect(hoisted.events).toHaveLength(2);
    expect(hoisted.events[1].prevHash).toBe(hoisted.events[0].eventHash);
    const day = new Date().toISOString().slice(0, 10);
    await expect(verifyAgentChain(null, day)).resolves.toMatchObject({ ok: true, checked: 2 });
  });

  it("detects a tampered event", async () => {
    await logAgentEvent({ keyId: null, tool: "search_products", status: "OK" });
    await logAgentEvent({ keyId: null, tool: "quote_order", status: "OK" });
    hoisted.events[1] = { ...hoisted.events[1], status: "RATE_LIMITED" };
    const day = new Date().toISOString().slice(0, 10);
    const verdict = await verifyAgentChain(null, day);
    expect(verdict.ok).toBe(false);
    expect(verdict.brokenAt).toBe(hoisted.events[1].id);
  });

  it("hashAgentKey is deterministic sha256", async () => {
    const { createHash } = await import("crypto");
    expect(hashAgentKey("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
  });
});
