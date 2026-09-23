import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => {
  const state = {
    alerts: [] as any[],
    stocked: [] as string[],
    variants: [] as any[],
    carts: [] as any[],
    wishes: [] as any[],
    recent: null as any,
    birthdayRows: [] as any[],
    created: [] as any[],
  };
  const mkTx: any = {
    findMany: vi.fn(async (args: any) => {
      const s = String(args?.include?.customer ?? args?.include?.variant ?? "");
      void s;
      return [];
    }),
    findFirst: vi.fn(async () => state.recent),
    create: vi.fn(async (args: any) => {
      state.created.push(args.data);
      return { id: "n1", ...args.data };
    }),
    update: vi.fn(async () => ({})),
  };
  const mkRead: any = {
    stockAlert: { findMany: vi.fn(async () => state.alerts) },
    $queryRaw: vi.fn(async () => state.stocked.map((variantId) => ({ variantId }))),
    productVariant: { findMany: vi.fn(async () => state.variants) },
    serverCart: { findMany: vi.fn(async () => state.carts) },
    wishlistItem: { findMany: vi.fn(async () => state.wishes) },
    shopperNotification: { findFirst: vi.fn(async () => state.recent) },
  };
  return { state, mkTx, mkRead };
});

vi.mock("./db", () => ({
  prisma: {
    shopperNotification: hoisted.mkTx,
    stockAlert: { update: vi.fn(async () => ({})) },
    serverCart: { update: vi.fn(async () => ({})) },
  },
  prismaRead: hoisted.mkRead,
}));
vi.mock("./mail", () => ({ sendMail: vi.fn(async () => ({})) }));

import { scanBackInStock, scanAbandonedCarts, scanWishlistPriceDrops, scanBirthdayReminders } from "./shopper-notify";

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(hoisted.state, {
    alerts: [], stocked: [], variants: [], carts: [], wishes: [],
    recent: null, birthdayRows: [], created: [],
  });
  // birthday scan uses $queryRaw too — route by SQL shape later per-test
  hoisted.mkRead.$queryRaw.mockImplementation(async () =>
    hoisted.state.stocked.map((variantId) => ({ variantId })));
});

describe("scanBackInStock", () => {
  it("notifies only alerts whose variant is restocked", async () => {
    hoisted.state.alerts = [
      { id: "a1", variantId: "v1", orgId: "o1", customerId: "c1", email: null, phone: null, customer: { email: "a@x.vn", phone: null, name: "A" } },
      { id: "a2", variantId: "v9", orgId: "o1", customerId: "c2", email: null, phone: null, customer: { email: "b@x.vn", phone: null, name: "B" } },
    ];
    hoisted.state.stocked = ["v1"];
    hoisted.state.variants = [{ id: "v1", product: { name: "Sách hot" } }];
    const out = await scanBackInStock();
    expect(out).toEqual({ alerts: 2, notified: 1 });
    expect(hoisted.state.created).toHaveLength(1);
    expect(hoisted.state.created[0]).toMatchObject({ kind: "back_in_stock", refId: "v1" });
  });

  it("returns zeros when nothing pending", async () => {
    expect(await scanBackInStock()).toEqual({ alerts: 0, notified: 0 });
  });
});

describe("scanAbandonedCarts", () => {
  it("nudges stale carts with items and skips empty ones", async () => {
    hoisted.state.carts = [
      { id: "cart1", orgId: "o1", customerId: "c1", phone: null, items: [{ variantId: "v1", quantity: 2 }], customer: { email: "a@x.vn", name: "A" } },
      { id: "cart2", orgId: "o1", customerId: null, phone: "0901", items: [], customer: null },
    ];
    const out = await scanAbandonedCarts();
    expect(out).toEqual({ carts: 2, nudged: 1 });
    expect(hoisted.state.created[0]).toMatchObject({ kind: "abandoned_cart" });
  });
});

describe("scanWishlistPriceDrops", () => {
  it("pings when current price falls below 30d average", async () => {
    hoisted.state.wishes = [{
      variantId: "v1", customerId: "c1",
      customer: { email: "a@x.vn", name: "A" },
      variant: {
        id: "v1", orgId: "o1", product: { name: "Sách sale" },
        prices: [
          { amount: 80_000n, validFrom: new Date(), priceList: { kind: "online" } },
          { amount: 100_000n, validFrom: new Date(Date.now() - 20 * 86_400_000), priceList: { kind: "online" } },
        ],
      },
    }];
    const out = await scanWishlistPriceDrops();
    expect(out).toEqual({ checked: 1, notified: 1 });
    expect(hoisted.state.created[0].kind).toBe("wishlist_price_drop");
  });

  it("skips when recent notification exists or price rose", async () => {
    hoisted.state.recent = { id: "old" };
    hoisted.state.wishes = [{
      variantId: "v1", customerId: "c1",
      customer: { email: "a@x.vn", name: "A" },
      variant: {
        id: "v1", orgId: "o1", product: { name: "Sách" },
        prices: [
          { amount: 80_000n, validFrom: new Date(), priceList: { kind: "online" } },
          { amount: 100_000n, validFrom: new Date(Date.now() - 20 * 86_400_000), priceList: { kind: "online" } },
        ],
      },
    }];
    const out = await scanWishlistPriceDrops();
    expect(out).toEqual({ checked: 1, notified: 0 });
  });
});

describe("scanBirthdayReminders", () => {
  it("issues one BDAY ping per birthday customer, deduped by code", async () => {
    hoisted.mkRead.$queryRaw.mockResolvedValueOnce([
      { id: "c1c1c1c1-0000-0000-0000-000000000001", orgId: "o1", name: "An", email: "an@x.vn" },
      { id: "c1c1c1c1-0000-0000-0000-000000000002", orgId: "o1", name: "Bình", email: null },
    ]);
    const out = await scanBirthdayReminders();
    expect(out).toEqual({ checked: 2, notified: 2 });
    expect(hoisted.state.created.map((c: any) => c.kind)).toEqual(["birthday_voucher", "birthday_voucher"]);
    expect(hoisted.state.created[0].refId).toMatch(/^BDAY-\d{4}-[0-9A-F]{8}$/);
  });

  it("returns zeros when nobody has a birthday today", async () => {
    hoisted.mkRead.$queryRaw.mockResolvedValueOnce([]);
    expect(await scanBirthdayReminders()).toEqual({ checked: 0, notified: 0 });
  });
});
