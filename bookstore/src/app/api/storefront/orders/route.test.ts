import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  order: { findMany: vi.fn() },
}));
const getSystemConfig = vi.hoisted(() => vi.fn(async () => 120));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/customer-auth", () => ({
  requireCustomerAuth: vi.fn(async () => ({ customerId: "customer-1" })),
}));
vi.mock("@/lib/api", () => ({
  getSystemConfig,
  ok: (data: unknown) => Response.json(data),
  apiError: (error: Error) => Response.json({ message: error.message }, { status: 500 }),
}));

import { GET } from "./route";

describe("GET /api/storefront/orders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a pickup reservation's store and expiry time", async () => {
    mockPrisma.order.findMany.mockResolvedValue([{
      id: "order-1",
      number: "ORD-001",
      status: "CONFIRMED",
      type: "pickup",
      total: 125000n,
      createdAt: new Date("2026-09-19T08:00:00Z"),
      store: { name: "Melio Quận 1" },
      shipment: null,
      items: [{ id: "item-1", quantity: 1, unitPrice: 125000n, variant: { product: { name: "Dế Mèn" } } }],
    }]);

    const response = await GET(new Request("https://book.test/api/storefront/orders") as never);
    const body = await response.json();

    expect(body[0]).toMatchObject({
      number: "ORD-001",
      fulfillment: "pickup",
      storeName: "Melio Quận 1",
      reservationExpiresAt: "2026-09-19T10:00:00.000Z",
    });
    expect(getSystemConfig).toHaveBeenCalledWith("orders.reservationTtlMinutes", 60);
  });
});
