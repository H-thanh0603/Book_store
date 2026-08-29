// MoMo settlement unit test. The create path requires a live MoMo
// sandbox, so we only cover the deterministic signature/idem path.
import { describe, it, expect, vi, beforeEach } from "vitest";

const payments: any[] = [];
const orders: any[] = [];
const enqueue = vi.fn();

vi.mock("./db", () => ({
  prisma: {
    webPayment: {
      findUnique: vi.fn(async ({ where: { txnRef } }: any) =>
        payments.find((p) => p.txnRef === txnRef) ?? null
      ),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const p = payments.find((x) => x.id === where.id);
        if (!p) return { count: 0 };
        if (p.status !== "PENDING") return { count: 0 };
        Object.assign(p, data);
        return { count: 1 };
      }),
    },
    order: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const o = orders.find((x) => x.id === where.id);
        if (!o) return { count: 0 };
        if (where.status && o.status !== where.status) return { count: 0 };
        Object.assign(o, data);
        return { count: 1 };
      }),
    },
  },
}));

vi.mock("./einvoice", () => ({ enqueueEinvoiceForOrder: enqueue }));

beforeEach(() => {
  payments.length = 0; orders.length = 0; enqueue.mockReset();
  process.env.MOMO_PARTNER_CODE = "MOMO";
  process.env.MOMO_ACCESS_KEY = "AK";
  process.env.MOMO_SECRET_KEY = "SK";
  process.env.MOMO_RETURN_URL = "https://app.test/momo/return";
  process.env.MOMO_IPN_URL = "https://app.test/momo/ipn";
});

describe("settleMomoResponse", () => {
  it("rejects mismatched signatures", async () => {
    const { settleMomoResponse } = await import("./momo");
    const result = await settleMomoResponse(new URLSearchParams({
      signature: "deadbeef",
      orderId: "o1", amount: "100", resultCode: "0",
      partnerCode: "MOMO", accessKey: "AK", requestId: "r1", orderInfo: "x",
      requestType: "captureWallet", extraData: "",
    }));
    expect(result.ok).toBe(false);
    expect(result.rspCode).toBe("97");
  });

  it("rejects unknown orderId", async () => {
    const { settleMomoResponse } = await import("./momo");
    const sp = new URLSearchParams({ orderId: "missing", amount: "0", resultCode: "0" });
    const result = await settleMomoResponse(sp);
    expect(result.rspCode).toBe("01");
  });

  it("is idempotent on duplicate callbacks (PENDING → PAID only once)", async () => {
    payments.push({ id: "p1", orderId: "o1", txnRef: "o1", amount: 100n, status: "PENDING" });
    orders.push({ id: "o1", status: "CONFIRMED" });
    const { settleMomoResponse } = await import("./momo");
    const sp = new URLSearchParams({
      orderId: "o1", amount: "100", resultCode: "0", requestId: "r1",
      partnerCode: "MOMO", accessKey: "AK", orderInfo: "x", requestType: "captureWallet", extraData: "",
    });
    const a = await settleMomoResponse(sp);
    const b = await settleMomoResponse(sp);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
