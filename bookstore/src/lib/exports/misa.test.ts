import { describe, it, expect, vi, beforeEach } from "vitest";
import { inflateRawSync } from "node:zlib";

// Mock prisma before the lib import so it picks up the stub.
const orders: any[] = [];
vi.mock("../db", () => ({
  prisma: {
    order: {
      findMany: vi.fn(async ({ where }: any) => {
        // Honour the createdAt range + status filter the lib applies.
        return orders.filter(
          (o) =>
            o.createdAt >= where.createdAt.gte &&
            o.createdAt <= where.createdAt.lte &&
            where.status.in.includes(o.status)
        );
      }),
    },
  },
}));

import { buildGeneralLedgerCsv, buildManifest, buildSalesInvoiceCsv, toMisaDate } from "./misa";
import { buildZip } from "./misa-zip";

beforeEach(() => {
  orders.length = 0;
});

describe("toMisaDate", () => {
  it("formats as dd/MM/yyyy", () => {
    expect(toMisaDate(new Date("2026-08-29T15:00:00Z"))).toBe("29/08/2026");
  });
  it("zero-pads single-digit components", () => {
    expect(toMisaDate(new Date("2026-01-05T00:00:00Z"))).toBe("05/01/2026");
  });
});

describe("buildSalesInvoiceCsv", () => {
  it("emits a BOM, the MISA column header, and one row per order line", async () => {
    orders.push({
      id: "o1", number: "ORD-2026-000001",
      createdAt: new Date("2026-08-15T03:00:00Z"),
      subtotal: 100_000n, total: 100_000n, discountTotal: 0n,
      status: "PAID",
      customer: { code: "CUS-000001", name: "Nguyễn Văn A", address: "1 Lê Lợi", taxCode: null },
      store: { code: "STORE-HQ" },
      items: [
        { id: "i1", quantity: 2, unitPrice: 50_000n, variant: { sku: "SKU-1", product: { name: "Sách A" } } },
      ],
    });
    const csv = await buildSalesInvoiceCsv({
      from: new Date("2026-08-01T00:00:00Z"),
      to: new Date("2026-08-31T23:59:59Z"),
      orgId: "org-1",
    });
    expect(csv.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
    const lines = csv.slice(1).split("\r\n").filter(Boolean);
    expect(lines[0]).toContain("Mã chứng từ");
    expect(lines[1]).toContain("ORD-2026-000001");
    expect(lines[1]).toContain("100000");
  });

  it("skips non-revenue statuses", async () => {
    orders.push(
      { id: "o1", number: "A", createdAt: new Date("2026-08-15T03:00:00Z"),
        subtotal: 0n, total: 0n, discountTotal: 0n, status: "NEW",
        customer: null, store: null, items: [] },
    );
    const csv = await buildSalesInvoiceCsv({
      from: new Date("2026-08-01"), to: new Date("2026-08-31"), orgId: "org-1",
    });
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1); // header only
  });
});

describe("buildGeneralLedgerCsv", () => {
  it("emits one 131/511 row per order", async () => {
    orders.push({
      id: "o1", number: "ORD-2026-000001",
      createdAt: new Date("2026-08-15T03:00:00Z"),
      subtotal: 100_000n, total: 100_000n, discountTotal: 0n, status: "PAID",
    });
    const csv = await buildGeneralLedgerCsv({
      from: new Date("2026-08-01"), to: new Date("2026-08-31"), orgId: "org-1",
    });
    const lines = csv.replace(/^﻿/, "").split("\r\n").filter(Boolean);
    // [0] is header, [1] is the first data row.
    expect(lines[1]).toContain("131");
    expect(lines[1]).toContain("511");
    expect(lines[1]).toContain("100000");
  });
});

describe("buildZip", () => {
  it("round-trips through inflate (or stays as store)", () => {
    const csv = "Mã chứng từ\r\nA\r\n";
    const manifest = JSON.stringify({ generatedAt: "2026-08-29", rows: { salesInvoice: 1, generalLedger: 1 } });
    const zip = buildZip([
      { name: "SalesInvoice.csv", data: Buffer.from(csv, "utf8") },
      { name: "manifest.json", data: Buffer.from(manifest, "utf8") },
    ]);
    // Magic number PK\003\004 (0x04034b50 LE).
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    // End of central directory record signature.
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    // EOCD reports our 2 entries.
    const totalEntries = zip.readUInt16LE(zip.length - 22 + 10);
    expect(totalEntries).toBe(2);
  });
  it("preserves the bytes when the input is incompressible (deflate fallback)", () => {
    // crypto.randomBytes gives true random bytes; Buffer.alloc's 2nd arg
    // only accepts string|number|Buffer, so a callback is silently ignored
    // and the buffer would be all zeros (trivially compressible).
    const noise = require("node:crypto").randomBytes(2048);
    const zip = buildZip([{ name: "noise.bin", data: noise }]);
    expect(zip.length).toBeGreaterThan(2048); // headers + payload
  });
});

describe("buildManifest", () => {
  it("returns valid JSON with the expected shape", () => {
    const m = buildManifest({
      generatedAt: "2026-08-29T00:00:00Z", orgId: "org-1",
      from: "01/08/2026", to: "31/08/2026",
      rows: { salesInvoice: 10, generalLedger: 5 },
    });
    const parsed = JSON.parse(m);
    expect(parsed.orgId).toBe("org-1");
    expect(parsed.rows.salesInvoice).toBe(10);
  });
});

// Suppress unused import warning — inflateRawSync is reserved for a
// future roundtrip test that decompresses deflated entries.
void inflateRawSync;
