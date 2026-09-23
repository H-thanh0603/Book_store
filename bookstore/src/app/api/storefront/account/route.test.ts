import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  customer: { findUnique: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/customer-auth", () => ({
  requireCustomerAuth: vi.fn(async () => ({ customerId: "customer-1" })),
}));

import { GET } from "./route";

describe("GET /api/storefront/account", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the signed-in member's points, tier, and newest point activity", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({
      code: "CUS-001",
      loyalty: {
        points: 125,
        tier: "Gold",
        transactions: [
          { id: "tx-1", points: 20, balanceAfter: 125, type: "EARN", createdAt: new Date("2026-09-19T08:00:00Z") },
        ],
      },
    });

    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({
      member: {
        code: "CUS-001",
        birthday: null,
        points: 125,
        tier: "Gold",
        transactions: [{ id: "tx-1", points: 20, balanceAfter: 125, type: "EARN", createdAt: "2026-09-19T08:00:00.000Z" }],
      },
    });
    expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "customer-1" },
    }));
  });
});
