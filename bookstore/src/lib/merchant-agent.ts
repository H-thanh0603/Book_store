// Merchant Agent shared frame — staff-only AI adapted from
// anthropics/commerce-agents merchant-agent (5 skills) onto any
// OpenAI-compatible gateway (see lib/llm.ts: LLM_* with DEEPSEEK_* fallback).
// READ tools only: the model explains and proposes; every write is a staged
// change the human applies through existing APIs (replenishment accept,
// promotion create, product PATCH). The model never calls a mutation.
//
// Skills: digest (daily ops digest), explain (performance-insights),
// inventory (inventory-operations Q&A), promo (pricing-promotions drafts),
// catalog (catalog-listings health).

import { prisma } from "./db";
import { callLlm, llmConfigured, type LlmMessage } from "./llm";

export type MerchantSkill = "digest" | "explain" | "inventory" | "promo" | "catalog";

/** Permission required to use each skill (checked in the route). */
export const SKILL_PERMISSION: Record<MerchantSkill, string> = {
  digest: "reports.store.view",
  explain: "reports.store.view",
  inventory: "reports.store.view",
  promo: "promotion.manage",
  catalog: "product.update",
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

const BASE_RULES = `Quy tắc BẮT BUỘC:
- Mọi con số, tên sản phẩm, mã, tồn kho bạn nêu PHẢI đến từ kết quả tool hoặc JSON ngữ cảnh được cấp. Không bịa số.
- Bạn không thể sửa dữ liệu — chỉ đề xuất; người dùng bấm nút duyệt mới có hiệu lực. Nói rõ điều này khi đề xuất hành động.
- Khi có tool propose_change: hành động cụ thể nào cũng stage qua nó (kind đúng, title rõ, payload đủ) thay vì chỉ nói suông.
- Trả lời tiếng Việt, ngắn gọn, tối đa 5 gạch đầu dòng chính.`;

export const SKILL_PROMPTS: Record<MerchantSkill, string> = {
  digest: `Bạn là trợ lý vận hành của Melio Bookstore. Đọc số liệu ca/kho từ tool và viết bản tin điều hành buổi sáng: hết hàng cần xử lý, gợi ý nhập nổi bật, PO chờ duyệt.
${BASE_RULES}`,
  explain: `Bạn là nhà phân tích của Melio Bookstore. Giải thích biến động kinh doanh từ JSON số liệu được cấp (doanh thu, đơn, top sản phẩm, tồn thấp).
${BASE_RULES}
- Chỉ trích số có trong JSON. Nêu 2-3 nguyên nhân khả dĩ kèm từ "có thể", không khẳng định.`,
  inventory: `Bạn là thủ kho AI của Melio Bookstore. Trả lời câu hỏi tồn kho/nhập hàng từ tool (gợi ý nhập, tồn theo SKU).
${BASE_RULES}
- Gợi ý nhập nào cũng phải kèm mã gợi ý để duyệt, và nhắc người dùng kiểm tra trước khi chấp nhận.`,
  promo: `Bạn là chuyên gia khuyến mãi của Melio Bookstore. Đề xuất đợt giảm giá cho hàng bán chậm từ tool slow_movers.
${BASE_RULES}
- Mỗi đề xuất: tên, loại (percentage/fixed), giá trị (percentage ≤ 30, fixed ≤ 50% giá), lý do tồn-bán. Mọi đợt đều tạo ở trạng thái NHÁP (active=false), người duyệt mới bật.`,
  catalog: `Bạn là biên tập viên catalogue của Melio Bookstore. Giải thích lỗi listing từ tool listing_issues theo nhóm, ưu tiên lỗi ảnh hưởng tìm kiếm/giá.
${BASE_RULES}
- Không tự sửa — liệt kê từng lỗi kèm cách sửa, người dùng thao tác trên giao diện.`,
};

// ── Read tools (DB-backed) ─────────────────────────────────────────────
// propose_change is the ONLY write-adjacent tool: it stages a PENDING change
// a human approves on /approvals. The model never applies anything itself.

export type ProposeChangeFn = (
  kind: string,
  title: string,
  payload: Record<string, unknown>,
) => Promise<unknown>;

export type DigestStats = {
  openSuggestions: number;
  outOfStockLines: number;
  pendingPO: number;
  openTransfers: number;
};

export async function getDigestStats(storeId?: string): Promise<DigestStats> {
  const locFilter = storeId ? { location: { storeId } } : {};
  const [openSuggestions, outOfStockLines, pendingPO, openTransfers] = await Promise.all([
    prisma.replenishmentSuggestion.count({ where: { status: "OPEN", recommendedQty: { gt: 0 }, ...locFilter } }),
    prisma.inventoryBalance.count({
      where: { onHand: { lte: 0 }, location: storeId ? { storeId } : { active: true } },
    }),
    prisma.purchaseOrder.count({ where: { status: "pending_approval" } }),
    prisma.stockTransfer.count({
      where: { status: { in: ["REQUESTED", "APPROVED", "PICKING", "IN_TRANSIT"] } },
    }),
  ]);
  return { openSuggestions, outOfStockLines, pendingPO, openTransfers };
}

export type SuggestionRow = {
  id: string;
  sku: string;
  name: string;
  location: string;
  recommendedQty: number;
  availableQty: number;
  daysOfCover: number | null;
  transferFrom: string | null;
};

export function toSuggestionRow(s: {
  id: string;
  recommendedQty: number;
  availableQty: number;
  variant: { sku: string; product: { name: string } };
  location: { name: string };
  rationale: unknown;
}): SuggestionRow {
  const r = (s.rationale ?? {}) as { daysOfCover?: number; balancedFrom?: { locationId: string; qty: number } };
  return {
    id: s.id,
    sku: s.variant.sku,
    name: s.variant.product.name,
    location: s.location.name,
    recommendedQty: s.recommendedQty,
    availableQty: s.availableQty,
    daysOfCover: typeof r.daysOfCover === "number" ? Math.round(r.daysOfCover * 10) / 10 : null,
    transferFrom: r.balancedFrom?.locationId ?? null,
  };
}

export async function getTopSuggestions(storeId?: string, take = 8): Promise<SuggestionRow[]> {
  const rows = await prisma.replenishmentSuggestion.findMany({
    where: { status: "OPEN", recommendedQty: { gt: 0 }, ...(storeId ? { location: { storeId } } : {}) },
    include: { variant: { include: { product: true } }, location: true },
    orderBy: { recommendedQty: "desc" },
    take: Math.min(Math.max(take, 1), 20),
  });
  return rows.map(toSuggestionRow);
}

export type SlowMover = {
  variantId: string;
  sku: string;
  name: string;
  onHand: number;
  sold30d: number;
  price: number | null;
};

/** Pure filter (unit-tested): high stock, no recent sales. */
export function filterSlowMovers(
  rows: { variantId: string; sku: string; name: string; onHand: number; sold30d: number; price: number | null }[],
  minOnHand = 10,
): SlowMover[] {
  return rows
    .filter((r) => r.onHand >= minOnHand && r.sold30d === 0)
    .sort((a, b) => b.onHand - a.onHand);
}

export async function getSlowMovers(take = 10): Promise<SlowMover[]> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [balances, sales, prices] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where: { onHand: { gte: 10 }, location: { active: true } },
      include: { variant: { include: { product: true } } },
      take: 300,
    }),
    prisma.inventoryMovement.groupBy({
      by: ["variantId"], where: { type: "SALE", createdAt: { gte: since } }, _sum: { quantity: true },
    }),
    prisma.price.findMany({ where: { validTo: null }, select: { variantId: true, amount: true }, take: 500 }),
  ]);
  const sold = new Map(sales.map((s) => [s.variantId, Math.max(0, -(s._sum.quantity ?? 0))]));
  const priceByVariant = new Map(prices.map((p) => [p.variantId, Number(p.amount)]));
  const agg = new Map<string, SlowMover>();
  for (const b of balances) {
    const cur = agg.get(b.variantId) ?? {
      variantId: b.variantId, sku: b.variant.sku, name: b.variant.product.name,
      onHand: 0, sold30d: sold.get(b.variantId) ?? 0, price: priceByVariant.get(b.variantId) ?? null,
    };
    cur.onHand += b.onHand - b.reserved;
    agg.set(b.variantId, cur);
  }
  return filterSlowMovers([...agg.values()]).slice(0, Math.min(Math.max(take, 1), 20));
}

export type ListingIssue = {
  kind: "missing_description" | "missing_author" | "missing_barcodes" | "missing_price";
  productId: string;
  variantId: string | null;
  name: string;
  detail: string;
};

/** Pure detector (unit-tested) over a compact product snapshot. */
export function detectListingIssues(
  rows: {
    productId: string; name: string; description: string | null; author: string | null;
    isBook: boolean; variants: { id: string; sku: string; barcodes: number; hasPrice: boolean }[];
  }[],
): ListingIssue[] {
  const out: ListingIssue[] = [];
  for (const p of rows) {
    if (!p.description?.trim()) out.push({ kind: "missing_description", productId: p.productId, variantId: null, name: p.name, detail: "Thiếu mô tả — trang chi tiết nghèo nội dung, SEO kém" });
    if (p.isBook && !p.author) out.push({ kind: "missing_author", productId: p.productId, variantId: null, name: p.name, detail: "Sách thiếu tác giả" });
    for (const v of p.variants) {
      if (v.barcodes === 0) out.push({ kind: "missing_barcodes", productId: p.productId, variantId: v.id, name: `${p.name} (${v.sku})`, detail: "Phiên bản chưa có mã vạch — POS không quét được" });
      if (!v.hasPrice) out.push({ kind: "missing_price", productId: p.productId, variantId: v.id, name: `${p.name} (${v.sku})`, detail: "Phiên bản chưa có giá bán lẻ" });
    }
  }
  return out;
}

export async function getListingIssues(take = 50): Promise<ListingIssue[]> {
  const products = await prisma.product.findMany({
    where: { status: "active" },
    include: {
      category: { select: { name: true } },
      author: { select: { name: true } },
      variants: { include: { barcodes: true, prices: { where: { validTo: null }, select: { id: true } } } },
    },
    take: 200,
  });
  const snapshot = products.map((p) => ({
    productId: p.id,
    name: p.name,
    description: p.description,
    author: p.author?.name ?? null,
    isBook: (p.category?.name ?? "").toLowerCase().includes("sách") || p.author !== null,
    variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, barcodes: v.barcodes.length, hasPrice: v.prices.length > 0 })),
  }));
  return detectListingIssues(snapshot).slice(0, Math.min(Math.max(take, 1), 100));
}

// ── LLM turn loop (2 rounds, mirrors concierge) ─────────────────────────

const PROPOSE_TOOL = {
  type: "function" as const,
  function: {
    name: "propose_change",
    description:
      "Stage một đề xuất chờ duyệt (không áp dụng ngay): promotion.create {name,type:percentage|fixed,value ≤30|≤100000}, product.patch {productId,description 10-2000 ký tự}, suggestion.accept {suggestionId}. Luôn stage thay vì chỉ nói suông.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", description: "promotion.create | product.patch | suggestion.accept" },
        title: { type: "string", description: "Tiêu đề ngắn cho người duyệt" },
        payload: { type: "object", description: "Payload theo kind" },
      },
      required: ["kind", "title", "payload"],
    },
  },
};

export const SKILL_TOOLS: Record<MerchantSkill, ({ type: "function"; function: { name: string; description: string; parameters: object } } | typeof PROPOSE_TOOL)[]> = {
  digest: [
    { type: "function", function: { name: "digest_stats", description: "Số liệu tổng quan ca/kho: gợi ý mở, dòng hết hàng, PO chờ duyệt, điều chuyển dở dang.", parameters: { type: "object", properties: { storeId: { type: "string" } } } } },
    { type: "function", function: { name: "top_suggestions", description: "Top gợi ý nhập hàng đang mở kèm tồn và ngày bao phủ.", parameters: { type: "object", properties: { storeId: { type: "string" }, take: { type: "number" } } } } },
    PROPOSE_TOOL,
  ],
  explain: [],
  inventory: [
    { type: "function", function: { name: "top_suggestions", description: "Gợi ý nhập hàng đang mở.", parameters: { type: "object", properties: { storeId: { type: "string" }, take: { type: "number" } } } } },
    { type: "function", function: { name: "digest_stats", description: "Số liệu tổng quan kho.", parameters: { type: "object", properties: { storeId: { type: "string" } } } } },
    PROPOSE_TOOL,
  ],
  promo: [
    { type: "function", function: { name: "slow_movers", description: "Hàng tồn cao nhưng 30 ngày không bán được — ứng viên giảm giá.", parameters: { type: "object", properties: { take: { type: "number" } } } } },
    PROPOSE_TOOL,
  ],
  catalog: [
    { type: "function", function: { name: "listing_issues", description: "Lỗi listing: thiếu mô tả, tác giả, mã vạch, giá.", parameters: { type: "object", properties: { take: { type: "number" } } } } },
    PROPOSE_TOOL,
  ],
};

async function execMerchantTool(
  name: string,
  args: Record<string, unknown>,
  propose?: ProposeChangeFn,
): Promise<unknown> {
  switch (name) {
    case "propose_change": {
      if (!propose) return { staged: false, reason: "propose chưa được host cấp (demo mode)" };
      try {
        return await propose(
          String(args.kind ?? ""),
          String(args.title ?? ""),
          (args.payload ?? {}) as Record<string, unknown>,
        );
      } catch {
        return { staged: false, reason: "tool failed" };
      }
    }
    case "digest_stats":
      return getDigestStats(typeof args.storeId === "string" ? args.storeId : undefined);
    case "top_suggestions":
      return getTopSuggestions(
        typeof args.storeId === "string" ? args.storeId : undefined,
        typeof args.take === "number" ? args.take : 8,
      );
    case "slow_movers":
      return getSlowMovers(typeof args.take === "number" ? args.take : 10);
    case "listing_issues":
      return getListingIssues(typeof args.take === "number" ? args.take : 50);
    default:
      return { error: "unknown tool" };
  }
}

export function merchantConfigured() {
  return llmConfigured();
}

export async function runMerchantTurn(
  skill: MerchantSkill,
  history: { role: "user" | "assistant"; content: string }[],
  contextJson?: string,
  opts?: {
    propose?: ProposeChangeFn;
    /** enable_* switches: a disabled system removes propose_change for its skills. */
    allowPropose?: boolean;
  },
): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  const allTools = SKILL_TOOLS[skill];
  const tools =
    opts?.allowPropose === false ? allTools.filter((t) => t.function.name !== "propose_change") : allTools;
  const messages: ChatMessage[] = [
    { role: "system", content: SKILL_PROMPTS[skill] + (contextJson ? `\n\n## Số liệu ngữ cảnh (chỉ trích số trong này):\n${contextJson.slice(0, 6000)}` : "") },
    ...history.map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
  ];
  for (let round = 0; round < 3; round++) {
    const { message: msg, usage } = await callLlm(messages as LlmMessage[], {
      tools: tools.length > 0 ? tools : undefined,
      maxTokens: 1000,
      temperature: 0.2,
      timeoutMs: 60_000,
    });
    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) return { text: (msg.content ?? "").slice(0, 3000), usage };
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
    for (const call of calls) {
      let result: unknown;
      try {
        result = await execMerchantTool(call.function.name, JSON.parse(call.function.arguments || "{}"), opts?.propose);
      } catch {
        result = { error: "tool failed" };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) });
    }
  }
  return { text: "Mình cần thêm thông tin — bạn mô tả cụ thể hơn được không?" };
}

export function merchantProvenance(by: string) {
  return {
    "@context": "https://www.w3.org/ns/prov#",
    "prov:wasGeneratedBy": by,
    "prov:generatedAtTime": new Date().toISOString(),
    humanVerified: false,
  };
}
