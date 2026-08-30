// ZaloPay settlement unit test. Same coverage shape as momo.test:
// signature failure, unknown trans, and idempotent re-callbacks.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const payments: any[] = [];
const orders: any[] = [];
const enqueue = vi.fn(async () => {});

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
  process.env.ZALOPAY_KEY2 = "key2";
});

function sign(data: string, key: string) {
  return createHmac("sha256", key).update(data).digest("hex");
}

describe("settleZaloPayResponse", () => {
  it("rejects a forged mac", async () => {
    const { settleZaloPayResponse } = await import("./zalopay");
    const result = await settleZaloPayResponse("{}", { data: { app_trans_id: "x" }, mac: "bad" });
    expect(result.return_code).toBe(-1);
  });

  it("rejects unknown app_trans_id", async () => {
    const { settleZaloPayResponse } = await import("./zalopay");
    const data = JSON.stringify({ app_trans_id: "20260829_missing", status: "1" });
    const result = await settleZaloPayResponse(data, { data: { app_trans_id: "20260829_missing", status: "1" }, mac: sign(data, "key2") });
    expect(result.return_code).toBe(2);
  });

  it("is idempotent on duplicate callbacks", async () => {
    payments.push({ id: "p1", orderId: "o1", txnRef: "o1", amount: 100n, status: "PENDING" });
    orders.push({ id: "o1", status: "CONFIRMED" });
    const { settleZaloPayResponse } = await import("./zalopay");
    const inner = { app_trans_id: "20260829_o1", status: "1", amount: "100" };
    const data = JSON.stringify(inner);
    const mac = sign(data, "key2");
    const a = await settleZaloPayResponse(data, { data: { data }, mac });
    const b = await settleZaloPayResponse(data, { data: { data }, mac });
    // settlement fires the einvoice enqueue via a fire-and-forget
    // dynamic import; flush microtasks before asserting.
    await new Promise((r) => setTimeout(r, 20));
    expect(a.return_code).toBe(1);
    expect(b.return_code).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
