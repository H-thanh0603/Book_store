import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => {
  const state = {
    configs: { "replenishment.historyDays": 30, "replenishment.safetyStock": 10, "replenishment.defaultLeadTimeDays": 7, "replenishment.priceLookbackDays": 180 } as Record<string, number>,
    balances: [] as any[],
    sales: [] as any[],
    priorSales: [] as any[],
    prices: [] as any[],
    // upsert() calls land here (mock returns the promise directly)
    upserts: [] as any[],
    // findMany calls land here; each test presets the queue of return values
    findManyQueue: [] as any[][],
    suggestionById: null as any,
    persistedSuggestion: null as any,
    txResult: { kind: "transfer", id: "tr-1" } as any,
  };
  const prismaMock: any = {
    inventoryBalance: { findMany: vi.fn(async () => state.balances) },
    inventoryMovement: {
      groupBy: vi.fn(async (args: any) => (args?.where?.createdAt?.lt ? state.priorSales : state.sales)),
    },
    $queryRaw: vi.fn(async () => state.prices),
    replenishmentSuggestion: {
      upsert: vi.fn(async (args: any) => {
        state.upserts.push(args);
        return { id: "rs-1", status: "OPEN", ...args.create };
      }),
      findMany: vi.fn(async () => (state.findManyQueue.length > 0 ? state.findManyQueue.shift()! : [])),
      findUnique: vi.fn(async () => state.suggestionById),
      update: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(async (fn: any) => fn({
      replenishmentSuggestion: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      stockLocation: {
        findUnique: vi.fn(async () => ({ id: "l2", storeId: "s1", store: { orgId: "org-1" } })),
      },
      stockTransfer: {
        create: vi.fn(async (args: any) => ({ id: "tr-1", ...args.data })),
      },
      purchaseOrder: {
        create: vi.fn(async (args: any) => ({ id: "po-1", ...args.data })),
      },
    })),
  };
  return { state, prismaMock };
});

vi.mock("./db", () => ({ prisma: hoisted.prismaMock, TX_OPTIONS: { timeout: 15000, maxWait: 5000 } }));
vi.mock("./api", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./api")>();
  return {
    ...orig,
    getSystemConfig: vi.fn(async (k: string, d: number) => hoisted.state.configs[k] ?? d),
  };
});
vi.mock("./auth", () => ({ assertStoreAccess: vi.fn() }));
vi.mock("./purchasing", () => ({
  createPurchaseOrder: vi.fn(async (args: any) => ({ id: "po-1", number: "PO-1", ...args })),
  createTransfer: vi.fn(async (args: any) => ({ id: "tr-1", number: "TR-1", ...args })),
}));

import { generateReplenishmentSuggestions, applySuggestionDecision } from "./replenishment";

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(hoisted.state, {
    balances: [], sales: [], priorSales: [], prices: [],
    upserts: [], findManyQueue: [], suggestionById: null, persistedSuggestion: null,
  });
});

function balance(over: Partial<any> = {}): any {
  return {
    id: "b1", variantId: "v1", locationId: "l1", inTransit: 0,
    onHand: 4, reserved: 0,
    variant: { id: "v1", active: true, orgId: "org-1", sku: "S1", product: { name: "Sách" } },
    location: { id: "l1", storeId: "s1" },
    ...over,
  };
}

describe("generateReplenishmentSuggestions", () => {
  it("upserts one suggestion per balance and returns the final list", async () => {
    hoisted.state.balances = [balance()];
    hoisted.state.sales = [{ variantId: "v1", locationId: "l1", _sum: { quantity: -60 } }];
    hoisted.state.priorSales = [];
    hoisted.state.prices = [{ variantId: "v1", supplierId: "sup1", leadTimeDays: 5, unitCost: 80000n }];
    // openSuggestions (empty) → final list
    hoisted.state.findManyQueue = [[], [{ id: "rs-1", variantId: "v1", recommendedQty: 11 }]];

    const out = await generateReplenishmentSuggestions("org-1");
    expect(hoisted.state.upserts).toHaveLength(1);
    expect(hoisted.state.upserts[0].create).toMatchObject({ variantId: "v1", locationId: "l1" });
    expect(out).toHaveLength(1);
  });

  it("stays org-scoped even with orgId=null (all keys still computed)", async () => {
    hoisted.state.balances = [balance()];
    hoisted.state.findManyQueue = [[], []];
    const out = await generateReplenishmentSuggestions(null);
    expect(out).toEqual([]);
    expect(hoisted.prismaMock.inventoryBalance.findMany).toHaveBeenCalled();
  });
});

describe("applySuggestionDecision", () => {
  const auth = { orgId: "org-1", userId: "u1", storeIds: ["s1"] } as any;

  it("ACCEPTED with balancedFrom creates a transfer, not a PO", async () => {
    hoisted.state.suggestionById = {
      id: "s1", variantId: "v1", locationId: "l1", recommendedQty: 4, status: "OPEN",
      variant: { id: "v1", orgId: "org-1", sku: "S1" },
      location: { id: "l1", storeId: "s1", store: { orgId: "org-1" } },
      rationale: { balancedFrom: { locationId: "l2", qty: 4 } },
    };
    const out = await applySuggestionDecision("s1", "ACCEPTED", auth);
    expect(out.status).toBe("ACCEPTED");
    expect(out.created?.kind).toBe("transfer");
  });

  it("DISMISSED creates nothing and still claims the row", async () => {
    hoisted.state.suggestionById = {
      id: "s2", variantId: "v1", locationId: "l1", recommendedQty: 4, status: "OPEN",
      variant: { id: "v1", orgId: "org-1", sku: "S1" },
      location: { id: "l1", storeId: "s1", store: { orgId: "org-1" } },
      rationale: {},
    };
    const out = await applySuggestionDecision("s2", "DISMISSED", auth);
    expect(out.status).toBe("DISMISSED");
    expect(out.created).toBeNull();
  });

  it("404s on a foreign-org suggestion", async () => {
    hoisted.state.suggestionById = {
      id: "evil", variantId: "v9", locationId: "l9", recommendedQty: 4, status: "OPEN",
      variant: { id: "v9", orgId: "org-2", sku: "X" },
      location: { id: "l9", storeId: "s9", store: { orgId: "org-2" } },
      rationale: {},
    };
    await expect(applySuggestionDecision("evil", "ACCEPTED", auth)).rejects.toMatchObject({ status: 404 });
  });
});
