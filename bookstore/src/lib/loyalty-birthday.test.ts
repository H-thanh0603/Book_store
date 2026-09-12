import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  customers: [] as any[],
  promos: new Map<string, any>(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(async () => hoisted.customers),
    promotion: {
      findUnique: vi.fn(async (args: any) => hoisted.promos.get(args.where.code) ?? null),
      create: vi.fn(async (args: any) => {
        hoisted.promos.set(args.data.code, args.data);
        return args.data;
      }),
    },
  },
}));

vi.mock("./api", () => ({
  getSystemConfig: vi.fn(async (_k: string, fallback: any) => fallback),
}));

import { issueBirthdayVouchers } from "./loyalty-birthday";

describe("issueBirthdayVouchers", () => {
  beforeEach(() => {
    hoisted.customers = [];
    hoisted.promos.clear();
  });

  it("issues one voucher per birthday customer and is idempotent", async () => {
    hoisted.customers = [{ id: "cust-12345678", orgId: "org-1", name: "An" }];
    await expect(issueBirthdayVouchers()).resolves.toEqual({ issued: 1 });
    await expect(issueBirthdayVouchers()).resolves.toEqual({ issued: 0 });
    const codes = [...hoisted.promos.keys()];
    expect(codes).toHaveLength(1);
    expect(codes[0]).toMatch(/^BDAY-\d{4}-CUST-123/);
  });

  it("issues nothing when no birthdays today", async () => {
    await expect(issueBirthdayVouchers()).resolves.toEqual({ issued: 0 });
  });
});
