// MISA SME.NET import exports. Two CSVs, both UTF-8 with BOM so Excel
// on Windows opens the Vietnamese diacritics without the import wizard:
//
//   SalesInvoice.csv   — per order line, what MISA calls "Hóa đơn bán"
//   GeneralLedger.csv  — per revenue + tax entry, the GL side
//
// Money is in đồng (VND, no decimals). MISA expects bare integers in
// its CSV cells — no thousands separator, no "đ" suffix. We serialize
// bigint to string and let Excel coerce. Dates are dd/MM/yyyy — MISA's
// standard for VN.
//
// ponytail: this is the smallest viable export. Real MISA deployments
// want customer-level master rows (Mã KH, Tên KH, MST, Địa chỉ) and
// inventory master rows in separate files; that's a follow-up. The
// per-line shape here is what MISA's "Nhập từ Excel" needs for the
// SalesInvoice book.

import { prisma } from "../db";

const BOM = "﻿";

function pad2(n: number) { return n < 10 ? "0" + n : "" + n; }

export function toMisaDate(d: Date): string {
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** RFC 4180 quoting: wrap in quotes, double any inner quote. */
function csvCell(v: string | number | bigint | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "bigint" ? v.toString() : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: (string | number | bigint | null | undefined)[]): string {
  return cells.map(csvCell).join(",") + "\r\n";
}

// ── SalesInvoice ──────────────────────────────────────────────────────────
// MISA column order — match exactly or the import wizard's auto-map
// breaks. Header row is required.

const SALES_HEADERS = [
  "Mã chứng từ", "Ngày chứng từ", "Mã khách hàng", "Tên khách hàng",
  "Mã số thuế", "Địa chỉ", "Mã hàng", "Tên hàng", "Đơn vị tính",
  "Số lượng", "Đơn giá", "Tiền hàng", "Thuế suất (%)", "Tiền thuế", "Thành tiền",
  "Mã kho", "Diễn giải",
] as const;

export async function buildSalesInvoiceCsv(opts: { from: Date; to: Date; orgId: string }): Promise<string> {
  const orders = await prisma.order.findMany({
    where: {
      store: { region: { orgId: opts.orgId } },
      createdAt: { gte: opts.from, lte: opts.to },
      status: { in: ["CONFIRMED", "PAID", "SHIPPED", "DELIVERED"] },
    },
    include: {
      customer: true,
      items: { include: { variant: { include: { product: true } } } },
      store: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let out = BOM;
  out += row(SALES_HEADERS as unknown as string[]);
  for (const o of orders) {
    const date = toMisaDate(o.createdAt);
    const docCode = o.number;
    const custCode = o.customer?.code ?? "KH-LE";
    const custName = o.customer?.name ?? "Khách lẻ";
    const custTax = (o.customer as { taxCode?: string | null } | null)?.taxCode ?? "";
    const custAddr = o.customer?.address ?? "";
    const stockCode = o.store?.code ?? "";
    for (const it of o.items) {
      const lineTotal = it.unitPrice * BigInt(it.quantity);
      out += row([
        docCode, date, custCode, custName, custTax, custAddr,
        it.variant?.sku ?? "", it.variant?.product?.name ?? "",
        "cái", it.quantity, it.unitPrice, lineTotal,
        0, 0, lineTotal, stockCode, "",
      ]);
    }
  }
  return out;
}

// ── GeneralLedger ─────────────────────────────────────────────────────────
// Two rows per order: Nợ 131 / Có 511 (revenue) and Nợ 131 / Có 3331
// (output VAT). VAT 0% means the tax line is omitted — most SME book
// shops are direct sellers, not VAT-liable. The 0% / VAT-liable split
// comes from SystemConfig["tax.vatPercent"] in a later phase.

const GL_HEADERS = [
  "Ngày chứng từ", "Số chứng từ", "Diễn giải",
  "Tài khoản nợ", "Tài khoản có", "Số tiền nợ", "Số tiền có",
] as const;

export async function buildGeneralLedgerCsv(opts: { from: Date; to: Date; orgId: string }): Promise<string> {
  const orders = await prisma.order.findMany({
    where: {
      store: { region: { orgId: opts.orgId } },
      createdAt: { gte: opts.from, lte: opts.to },
      status: { in: ["CONFIRMED", "PAID", "SHIPPED", "DELIVERED"] },
    },
    select: { id: true, number: true, createdAt: true, total: true, discountTotal: true },
    orderBy: { createdAt: "asc" },
  });

  let out = BOM;
  out += row(GL_HEADERS as unknown as string[]);
  for (const o of orders) {
    const date = toMisaDate(o.createdAt);
    const memo = `Doanh thu đơn ${o.number}`;
    const revenue = o.total;
    out += row([date, o.number, memo, "131", "511", revenue, revenue]);
  }
  return out;
}

// ── Manifest ─────────────────────────────────────────────────────────────
// The SFTP drop needs a manifest file so the bookkeeper can see what's
// in each archive without unzipping.

export type MisaManifest = {
  generatedAt: string;
  orgId: string;
  from: string;
  to: string;
  rows: { salesInvoice: number; generalLedger: number };
};

export function buildManifest(m: MisaManifest): string {
  return JSON.stringify(m, null, 2);
}
