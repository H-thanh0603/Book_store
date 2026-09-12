import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  zones: [] as any[],
  defaultFee: 30000,
  freeThreshold: 250000,
}));

vi.mock("./api", () => ({
  getSystemConfig: vi.fn(async (k: string, fallback: any) => {
    if (k === "shipping.zones") return hoisted.zones;
    if (k === "shipping.defaultFee") return hoisted.defaultFee;
    if (k === "shipping.freeThreshold") return hoisted.freeThreshold;
    return fallback;
  }),
}));

import { quoteShipping } from "./shipping";

describe("quoteShipping", () => {
  beforeEach(() => {
    hoisted.zones = [];
    hoisted.defaultFee = 30000;
    hoisted.freeThreshold = 250000;
  });

  it("free-ships orders at/above threshold regardless of zone", async () => {
    await expect(quoteShipping({ address: "Hà Nội", subtotal: 250000n })).resolves.toEqual({
      zone: "FREESHIP",
      fee: 0n,
      freeShip: true,
    });
  });

  it("matches the first zone by address substring", async () => {
    hoisted.zones = [
      { match: "hồ chí minh", fee: 15000, label: "Nội thành HCM" },
      { match: "hà nội", fee: 20000, label: "Nội thành HN" },
    ];
    await expect(
      quoteShipping({ address: "124 Nguyễn Huệ, Hồ Chí Minh", subtotal: 100000n })
    ).resolves.toEqual({ zone: "Nội thành HCM", fee: 15000n, freeShip: false });
  });

  it("falls back to the default fee when no zone matches", async () => {
    hoisted.zones = [{ match: "hồ chí minh", fee: 15000, label: "HCM" }];
    await expect(quoteShipping({ address: "Đà Lạt", subtotal: 100000n })).resolves.toEqual({
      zone: "DEFAULT",
      fee: 30000n,
      freeShip: false,
    });
  });
});
