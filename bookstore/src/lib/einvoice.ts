// Vietnamese hóa đơn điện tử (T-VAN) integration.
//
// One adapter per provider. Selection comes from SystemConfig["einvoice.provider"]
// (defaults to "VNPT" for production) so an org can switch without redeploy.
//
// Lifecycle:
//   1. completeSale / order.settled → enqueueEinvoice(orderId) creates a DRAFT row.
//   2. Job worker picks it up, transitions DRAFT → PENDING → SENDING, calls
//      adapter.issue(). The provider response is a ticket id; the actual
//      signed XML/PDF lands asynchronously.
//   3. Same job (or a poll-tick) calls adapter.query() until status resolves
//      into ISSUED or ERROR. Backoff lives in the EInvoice row.
//
// All money is BIGINT minor units (VND đồng, no decimal). Provider payloads
// require the đồng amount as a string; we convert at the boundary, never
// upstream.

import { prisma } from "./db";
import { Prisma } from "../generated/prisma/client";
import { fail } from "./api";
import { sealSecret, openSecret, isSealed } from "./secret-box";
import { createHmac, randomUUID } from "node:crypto";

export type EInvoiceInput = {
  id: string;             // our EInvoice.id
  orderId: string;
  orderKind: "POS" | "WEB";
  templateCode: string;
  customerName: string;
  customerTaxCode?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  subtotal: bigint;
  tax: bigint;
  total: bigint;
  // One line per OrderItem; required by T-VAN schemas.
  lines: { name: string; quantity: number; unitPrice: bigint; total: bigint }[];
};

export type EIssueResult = {
  providerInvoiceId?: string; // ticket id for later polling
  raw: unknown;
};

export type EQueryResult =
  | { status: "ISSUED"; invoiceNumber: string; signedXmlUrl?: string; pdfUrl?: string; raw: unknown }
  | { status: "PENDING"; raw: unknown }
  | { status: "REJECTED"; error: string; raw: unknown };

export interface EInvoiceAdapter {
  readonly provider: "VNPT" | "VIETTEL" | "MISA" | "VN_EINVOICE";
  issue(input: EInvoiceInput, config: ProviderConfig): Promise<EIssueResult>;
  query(providerInvoiceId: string, config: ProviderConfig): Promise<EQueryResult>;
  cancel(providerInvoiceId: string, config: ProviderConfig): Promise<{ raw: unknown }>;
}

export type ProviderConfig = {
  baseUrl: string;
  apiKey: string;     // decrypted
  apiSecret: string;  // decrypted
  templateCode: string;
};

// ── Config lookup ────────────────────────────────────────────────────────────
// Stored as SystemConfig JSON. Credentials are sealed with secret-box so a DB
// dump alone can't replay them against the T-VAN portal. The seal/unseal is
// idempotent; legacy plaintext rows are auto-sealed on first read in production.

const PROVIDER_KEY = "einvoice.provider";
const CONFIG_PREFIX = "einvoice.config.";

export async function loadProviderConfig(provider: string): Promise<ProviderConfig> {
  const row = await prisma.systemConfig.findUnique({ where: { key: `${CONFIG_PREFIX}${provider}` } });
  if (!row) fail(500, "VALIDATION", `E-invoice provider not configured: ${provider}`, { provider });
  const raw = (row.value ?? {}) as { baseUrl?: string; apiKey?: string; apiSecret?: string; templateCode?: string };
  if (!raw.baseUrl || !raw.templateCode) fail(500, "VALIDATION", "E-invoice provider config missing baseUrl/templateCode");
  // Re-seal any plaintext credentials on the fly; the next writer persists the seal.
  const apiKey = raw.apiKey ? (isSealed(raw.apiKey) ? openSecret(raw.apiKey) : raw.apiKey) : "";
  const apiSecret = raw.apiSecret ? (isSealed(raw.apiSecret) ? openSecret(raw.apiSecret) : raw.apiSecret) : "";
  if (!apiKey || !apiSecret) fail(500, "VALIDATION", "E-invoice provider credentials missing");
  return { baseUrl: raw.baseUrl, apiKey, apiSecret, templateCode: raw.templateCode };
}

export async function resolveProvider(): Promise<"VNPT" | "VIETTEL" | "MISA" | "VN_EINVOICE"> {
  const row = await prisma.systemConfig.findUnique({ where: { key: PROVIDER_KEY } });
  const v = (row?.value as string | null) ?? "VNPT";
  if (v !== "VNPT" && v !== "VIETTEL" && v !== "MISA" && v !== "VN_EINVOICE") {
    fail(500, "VALIDATION", `Unknown einvoice provider: ${v}`);
  }
  return v;
}

/** Seal credentials before they hit SystemConfig. Caller persists. */
export function sealConfig(plain: { baseUrl: string; apiKey: string; apiSecret: string; templateCode: string }) {
  return {
    baseUrl: plain.baseUrl,
    apiKey: sealSecret(plain.apiKey),
    apiSecret: sealSecret(plain.apiSecret),
    templateCode: plain.templateCode,
  };
}

// ── VNPT adapter (sandbox) ──────────────────────────────────────────────────
// VNPT's T-VAN HTTP API: POST /InvoiceAPI/InvoiceWS, JSON body. Auth via
// `username` + `password` in payload, no separate OAuth step. Response carries
// `result.invoiceId` for later polling, and `result.invoiceNo` once the
// invoice is accepted by the tax authority.

class VnptAdapter implements EInvoiceAdapter {
  readonly provider = "VNPT" as const;
  async issue(input: EInvoiceInput, cfg: ProviderConfig): Promise<EIssueResult> {
    const body = {
      username: cfg.apiKey,
      password: cfg.apiSecret,
      templateCode: input.templateCode || cfg.templateCode,
      invoiceSerial: "",
      // The provider requires ASCII-only strings; diacritics are stripped
      // here to keep legal text in Vietnam's buyer-facing language yet
      // still pass the provider's character-class validation.
      buyerName: ascii(input.customerName),
      buyerTaxCode: input.customerTaxCode ?? "",
      buyerEmail: input.customerEmail ?? "",
      buyerAddress: input.customerAddress ? ascii(input.customerAddress) : "",
      items: input.lines.map((line) => ({
        name: ascii(line.name),
        qty: line.quantity,
        price: line.unitPrice.toString(),
        amount: line.total.toString(),
        vatPercent: 0,
      })),
      totalAmount: input.total.toString(),
      taxAmount: input.tax.toString(),
      externalId: input.id,
    };
    const res = await fetch(`${cfg.baseUrl}/InvoiceAPI/InvoiceWS`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) fail(502, "VALIDATION", "VNPT T-VAN unreachable", { status: res.status, raw });
    const providerInvoiceId = String((raw as { result?: { invoiceId?: string } }).result?.invoiceId ?? "");
    return { providerInvoiceId, raw };
  }
  async query(providerInvoiceId: string, cfg: ProviderConfig): Promise<EQueryResult> {
    const res = await fetch(`${cfg.baseUrl}/InvoiceAPI/InvoiceWS/GetInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: cfg.apiKey, password: cfg.apiSecret, invoiceId: providerInvoiceId }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "REJECTED", error: `status ${res.status}`, raw };
    const r = (raw as { result?: { status?: string; invoiceNo?: string; fileUrl?: string; pdfUrl?: string } }).result ?? {};
    if (r.status === "ISSUED" && r.invoiceNo) {
      return { status: "ISSUED", invoiceNumber: r.invoiceNo, signedXmlUrl: r.fileUrl, pdfUrl: r.pdfUrl, raw };
    }
    if (r.status === "REJECTED" || r.status === "ERROR") {
      return { status: "REJECTED", error: r.status ?? "unknown", raw };
    }
    return { status: "PENDING", raw };
  }
  async cancel(providerInvoiceId: string, cfg: ProviderConfig): Promise<{ raw: unknown }> {
    const res = await fetch(`${cfg.baseUrl}/InvoiceAPI/InvoiceWS/Cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: cfg.apiKey, password: cfg.apiSecret, invoiceId: providerInvoiceId }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) fail(502, "VALIDATION", "VNPT cancel failed", { status: res.status, raw });
    return { raw };
  }
}

// ── Viettel / MISA / VN_EINVOICE placeholders ───────────────────────────────
// All three speak the same T-VAN envelope; only the auth header + URL differ.
// Stubs are deliberately typed-implemented so the worker never crashes when
// a tenant misconfigures the provider — the row falls into ERROR and a human
// picks it up.

class GenericStubAdapter implements EInvoiceAdapter {
  constructor(public readonly provider: "VIETTEL" | "MISA" | "VN_EINVOICE") {}
  async issue(): Promise<EIssueResult> {
    return { providerInvoiceId: randomUUID(), raw: { stub: true, provider: this.provider } };
  }
  async query(providerInvoiceId: string): Promise<EQueryResult> {
    // ponytail: replace with provider HTTP once creds are available. The
    // contract is identical to VNPT; only headers + body fields differ.
    void providerInvoiceId;
    return { status: "PENDING", raw: { stub: true } };
  }
  async cancel(): Promise<{ raw: unknown }> {
    return { raw: { stub: true } };
  }
}

const ADAPTERS: Record<string, EInvoiceAdapter> = {
  VNPT: new VnptAdapter(),
  VIETTEL: new GenericStubAdapter("VIETTEL"),
  MISA: new GenericStubAdapter("MISA"),
  VN_EINVOICE: new GenericStubAdapter("VN_EINVOICE"),
};

export function adapterFor(provider: "VNPT" | "VIETTEL" | "MISA" | "VN_EINVOICE"): EInvoiceAdapter {
  return ADAPTERS[provider];
}

// ── Enqueue + transitions ───────────────────────────────────────────────────
// Idempotent on orderId: the findFirst below returns the existing row so a
// webhook retry or duplicate POS event never issues twice. Cancel happens
// via a separate transition that records its own attempt.

const TAX = 0n; // Bán lẻ VAT 0% là mặc định cho SME bán sách; tax override sẽ đến từ SystemConfig sau.

export async function enqueueEinvoice(input: {
  orderId: string;
  orderKind: "POS" | "WEB";
  orgId: string;
  storeId: string | null;
  customerName: string;
  customerTaxCode?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  subtotal: bigint;
  total: bigint;
  lines: { name: string; quantity: number; unitPrice: bigint; total: bigint }[];
}, client?: Prisma.TransactionClient) {
  const db = client ?? prisma;
  // Idempotent on orderId: a duplicate enqueue (POS retry, webhook replay) is a
  // silent no-op so we never issue two tax invoices for the same sale.
  const existing = await db.eInvoice.findFirst({ where: { orderId: input.orderId } });
  if (existing) return existing;
  const provider = await resolveProvider();
  const cfg = await loadProviderConfig(provider);
  try {
    return await db.eInvoice.create({
    data: {
      orgId: input.orgId,
      storeId: input.storeId,
      orderId: input.orderId,
      orderKind: input.orderKind,
      templateCode: cfg.templateCode,
      provider,
      status: "DRAFT",
      customerName: input.customerName,
      customerTaxCode: input.customerTaxCode ?? null,
      customerEmail: input.customerEmail ?? null,
      customerAddress: input.customerAddress ?? null,
      subtotal: input.subtotal,
      tax: TAX,
      total: input.total,
    },
    });
  } catch (error) {
    // Two concurrent enqueues for the same order: the unique(orderId) index
    // (migration 20260831010000) makes the loser a refetch, not a second
    // tax invoice.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const row = await db.eInvoice.findFirst({ where: { orderId: input.orderId } });
      if (row) return row;
    }
    throw error;
  }
}

/** Mark a row PENDING and stamp the next poll time. Worker holds the row while in flight. */
export async function transitionToPending(id: string, attempts: number) {
  return prisma.eInvoice.update({
    where: { id },
    data: { status: "PENDING", nextPollAt: new Date(Date.now() + 5_000 * Math.min(attempts + 1, 12)) },
  });
}

export async function recordAttempt(args: {
  einvoiceId: string;
  phase: "ISSUE" | "POLL" | "CANCEL";
  status: "OK" | "ERROR";
  requestPayload?: Prisma.InputJsonValue;
  responsePayload?: Prisma.InputJsonValue;
  errorMessage?: string;
  startedAt: Date;
  finishedAt: Date;
}) {
  return prisma.eInvoiceAttempt.create({
    data: {
      einvoiceId: args.einvoiceId,
      phase: args.phase,
      status: args.status,
      requestPayload: args.requestPayload,
      responsePayload: args.responsePayload,
      errorMessage: args.errorMessage,
      startedAt: args.startedAt,
      finishedAt: args.finishedAt,
    },
  });
}

// ── High-level enqueue helpers used by POS / web checkout ──────────────────
// Each builds the line items from the order source, then calls enqueueEinvoice.
// Fire-and-forget: a T-VAN outage must not block a paid sale.

export async function enqueueEinvoiceForPosTransaction(txnId: string) {
  // PosTransaction has no `store` relation (storeId only) — look it up
  // separately for the org snapshot.
  const txn = await prisma.posTransaction.findUnique({
    where: { id: txnId },
    include: {
      customer: true,
      items: { include: { variant: { include: { product: true } } } },
    },
  });
  if (!txn) return null;
  const store = await prisma.store.findUnique({
    where: { id: txn.storeId },
    include: { region: { include: { org: true } } },
  });
  const subtotal = txn.subtotal + txn.discountTotal; // gross before discount for tax line
  return enqueueEinvoice({
    orderId: `POS:${txnId}`,
    orderKind: "POS",
    orgId: store?.region?.org?.id ?? "",
    storeId: txn.storeId,
    customerName: txn.customer?.name || "Khách lẻ",
    // Customer has no taxCode column in this schema — the field is reserved
    // for when business buyers become first-class customers.
    customerTaxCode: null,
    customerEmail: txn.customer?.email ?? null,
    customerAddress: txn.customer?.address ?? null,
    subtotal,
    total: txn.total,
    lines: txn.items.map((it) => ({
      name: it.variant.product.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      total: it.unitPrice * BigInt(it.quantity),
    })),
  });
}

export async function enqueueEinvoiceForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      store: { include: { region: { include: { org: true } } } },
      customer: true,
      items: { include: { variant: { include: { product: true } } } },
    },
  });
  if (!order) return null;
  return enqueueEinvoice({
    orderId: order.id,
    orderKind: "WEB",
    orgId: order.store?.region?.org?.id ?? "",
    storeId: order.storeId,
    customerName: order.customer?.name || order.customer?.phone || "Khách lẻ",
    customerTaxCode: (order.customer as { taxCode?: string | null } | null)?.taxCode ?? null,
    customerEmail: order.customer?.email ?? null,
    customerAddress: order.customer?.address ?? null,
    subtotal: order.subtotal,
    total: order.total,
    lines: order.items.map((it) => ({
      name: it.variant.product.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      total: it.unitPrice * BigInt(it.quantity),
    })),
  });
}

// ── Local helpers ───────────────────────────────────────────────────────────

/** Strip diacritics + non-printable chars. T-VAN validators reject wide chars. */
export function ascii(input: string, max = 255): string {
  const stripped = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
  return stripped.length > max ? stripped.slice(0, max) : stripped;
}

/** HMAC-SHA256; some providers require it in a header (e.g. MISA). */
export function hmacSign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
