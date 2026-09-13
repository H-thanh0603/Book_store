// Staged changes — the merchant approval surface. Adapted from
// anthropics/commerce-agents merchant-agent change guardrails: the model
// explains and proposes; every write is a staged change the host's approval
// surface applies. The model never calls a mutation.
//
// Kinds (each reuses the manual flow's code — never a parallel write path):
// - promotion.create: draft promotion (active=false), human enables it.
// - product.patch: listing fix (description only), the catalog skill's write.
// - suggestion.accept: replenishment accept via applySuggestionDecision.

import { prisma } from "./db";
import { Prisma } from "../generated/prisma/client";
import { audit } from "./auth";
import { applySuggestionDecision } from "./replenishment";

export const STAGED_KINDS = ["promotion.create", "product.patch", "suggestion.accept"] as const;
export type StagedKind = (typeof STAGED_KINDS)[number];

export const STAGED_STATUS = ["PENDING", "APPROVED", "APPLIED", "REJECTED", "FAILED"] as const;
export type StagedStatus = (typeof STAGED_STATUS)[number];

/** Permission required to PROPOSE and to REVIEW each kind. */
export const STAGED_PERMISSION: Record<StagedKind, string> = {
  "promotion.create": "promotion.manage",
  "product.patch": "product.update",
  "suggestion.accept": "purchase.create",
};

export type PromotionCreatePayload = {
  name: string;
  type: "percentage" | "fixed";
  value: number;
  reason?: string;
};

export type ProductPatchPayload = {
  productId: string;
  description: string;
};

export type SuggestionAcceptPayload = {
  suggestionId: string;
};

export type StagedPayload = PromotionCreatePayload | ProductPatchPayload | SuggestionAcceptPayload;

// ── Pure validation (shared by propose path and tests) ──

export function validatePromotionCreate(
  payload: Record<string, unknown>,
): { ok: true; value: PromotionCreatePayload } | { ok: false; reason: string } {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const type = payload.type;
  const value = payload.value;
  if (!name || name.length > 120) return { ok: false, reason: "name 1–120 ký tự" };
  if (type !== "percentage" && type !== "fixed") return { ok: false, reason: "type phải là percentage|fixed" };
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return { ok: false, reason: "value phải là số dương" };
  // Agent-side caps (mirror the promo skill prompt): drafts never go live
  // with aggressive discounts — the reviewer can still edit after.
  if (type === "percentage" && value > 30)
    return { ok: false, reason: "percentage draft tối đa 30 — giá trị lớn hơn cần tạo tay" };
  if (type === "fixed" && value > 100_000)
    return { ok: false, reason: "fixed draft tối đa 100.000₫ — giá trị lớn hơn cần tạo tay" };
  const reason = typeof payload.reason === "string" ? payload.reason.slice(0, 300) : undefined;
  return { ok: true, value: { name, type, value: Math.round(value), ...(reason ? { reason } : {}) } };
}

export function validateProductPatch(
  payload: Record<string, unknown>,
): { ok: true; value: ProductPatchPayload } | { ok: false; reason: string } {
  const productId = typeof payload.productId === "string" ? payload.productId : "";
  const description = typeof payload.description === "string" ? payload.description.trim() : "";
  if (!productId) return { ok: false, reason: "thiếu productId" };
  // Listing fix only: meaningful but bounded — no HTML/script smuggling.
  if (description.length < 10 || description.length > 2000)
    return { ok: false, reason: "description 10–2000 ký tự" };
  if (/<script|on\w+\s*=/i.test(description))
    return { ok: false, reason: "description chứa markup động — từ chối" };
  return { ok: true, value: { productId, description } };
}

export function validateSuggestionAccept(
  payload: Record<string, unknown>,
): { ok: true; value: SuggestionAcceptPayload } | { ok: false; reason: string } {
  const suggestionId = typeof payload.suggestionId === "string" ? payload.suggestionId : "";
  if (!suggestionId) return { ok: false, reason: "thiếu suggestionId" };
  return { ok: true, value: { suggestionId } };
}

export function validateStagedPayload(
  kind: string,
  payload: Record<string, unknown>,
): { ok: true; value: StagedPayload } | { ok: false; reason: string } {
  switch (kind) {
    case "promotion.create":
      return validatePromotionCreate(payload);
    case "product.patch":
      return validateProductPatch(payload);
    case "suggestion.accept":
      return validateSuggestionAccept(payload);
    default:
      return { ok: false, reason: `kind lạ: ${kind} — chỉ nhận ${STAGED_KINDS.join(", ")}` };
  }
}

/** Pure status machine: which review transitions are legal. */
export function canTransition(from: string, to: string): boolean {
  switch (from) {
    case "PENDING":
      return to === "APPROVED" || to === "REJECTED";
    case "APPROVED":
      return to === "APPLIED" || to === "FAILED";
    case "FAILED":
      return to === "APPROVED"; // re-approve retries a failed apply
    default:
      return false;
  }
}

// ── Propose / review (DB) ──

export type ReviewerContext = {
  orgId: string;
  userId: string;
  permissions: string[];
};

function hasPerm(ctx: ReviewerContext, perm: string): boolean {
  return ctx.permissions.includes(perm);
}

export async function proposeStagedChange(
  kind: string,
  title: string,
  payload: Record<string, unknown>,
  ctx: ReviewerContext,
) {
  if (!(STAGED_KINDS as readonly string[]).includes(kind)) {
    return { proposed: false as const, reason: `kind lạ: ${kind}` };
  }
  const needed = STAGED_PERMISSION[kind as StagedKind];
  if (!hasPerm(ctx, needed)) {
    return { proposed: false as const, reason: `Cần quyền ${needed}` };
  }
  const cleanTitle = title.trim().slice(0, 120);
  if (!cleanTitle) return { proposed: false as const, reason: "thiếu title" };
  const validated = validateStagedPayload(kind, payload);
  if (!validated.ok) return { proposed: false as const, reason: validated.reason };
  const row = await prisma.stagedChange.create({
    data: {
      orgId: ctx.orgId,
      kind,
      title: cleanTitle,
      payload: validated.value as unknown as Prisma.InputJsonValue,
      status: "PENDING",
      requestedBy: ctx.userId,
    },
  });
  await audit(ctx.userId, "staged.propose", "staged_change", row.id, { kind });
  return { proposed: true as const, id: row.id, kind };
}

export async function listStagedChanges(orgId: string, status?: string) {
  return prisma.stagedChange.findMany({
    where: { orgId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

async function applyPromotionCreate(
  value: PromotionCreatePayload,
  ctx: ReviewerContext,
): Promise<string> {
  const promo = await prisma.promotion.create({
    data: {
      name: value.name,
      orgId: ctx.orgId,
      type: value.type as "percentage" | "fixed",
      value: BigInt(value.value),
      minQty: 0,
      channel: "ALL",
      stackable: false,
      memberOnly: false,
      priority: 0,
      // Drafts never go live: the reviewer enables them on the promotions page.
      active: false,
      startAt: new Date(),
    },
  });
  return promo.id;
}

async function applyProductPatch(
  value: ProductPatchPayload,
  ctx: ReviewerContext,
): Promise<string> {
  const product = await prisma.product.findFirst({
    where: { id: value.productId, orgId: ctx.orgId },
    select: { id: true },
  });
  if (!product) throw Object.assign(new Error("Product not found in org"), { status: 404 });
  await prisma.product.update({
    where: { id: product.id },
    data: { description: value.description },
  });
  return product.id;
}

async function applySuggestionAccept(
  value: SuggestionAcceptPayload,
  ctx: ReviewerContext & { roles: { permissions: string[]; storeId: string | null }[] },
): Promise<string> {
  // Same atomic flow as POST /api/replenishment — one code path, no parallel
  // write logic. assertStoreAccess inside enforces the reviewer's store scope.
  const res = await applySuggestionDecision(value.suggestionId, "ACCEPTED", {
    userId: ctx.userId,
    roles: ctx.roles,
  } as Parameters<typeof applySuggestionDecision>[2]);
  return res.created?.id ?? res.suggestionId;
}

export async function reviewStagedChange(
  id: string,
  decision: "APPROVE" | "REJECT",
  ctx: ReviewerContext & { roles?: { permissions: string[]; storeId: string | null }[] },
  note?: string,
) {
  const row = await prisma.stagedChange.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!row) return { reviewed: false as const, reason: "Staged change không tồn tại" };
  if (row.status !== "PENDING")
    return { reviewed: false as const, reason: `Đã ở trạng thái ${row.status} — không thể duyệt lại` };
  const needed = STAGED_PERMISSION[row.kind as StagedKind] ?? null;
  if (!needed) return { reviewed: false as const, reason: `kind lạ: ${row.kind}` };
  if (!hasPerm(ctx, needed)) {
    return { reviewed: false as const, reason: `Cần quyền ${needed}` };
  }

  if (decision === "REJECT") {
    // Atomic claim: only one reviewer wins a PENDING row.
    const claimed = await prisma.stagedChange.updateMany({
      where: { id: row.id, status: "PENDING" },
      data: { status: "REJECTED", reviewedBy: ctx.userId, reviewNote: note?.slice(0, 300) ?? null },
    });
    if (claimed.count !== 1) return { reviewed: false as const, reason: "Đã có người duyệt trước" };
    await audit(ctx.userId, "staged.reject", "staged_change", row.id, { kind: row.kind });
    return { reviewed: true as const, status: "REJECTED" as const };
  }

  // APPROVE: claim first, then apply. A crash between claim and apply leaves
  // APPROVED (not half-applied) — re-approve retries via FAILED→APPROVED.
  const claimed = await prisma.stagedChange.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: { status: "APPROVED", reviewedBy: ctx.userId, reviewNote: note?.slice(0, 300) ?? null },
  });
  if (claimed.count !== 1) return { reviewed: false as const, reason: "Đã có người duyệt trước" };

  try {
    const payload = row.payload as unknown as Record<string, unknown>;
    let appliedRef: string;
    if (row.kind === "promotion.create") {
      const v = validatePromotionCreate(payload);
      if (!v.ok) throw Object.assign(new Error(v.reason), { status: 400 });
      appliedRef = await applyPromotionCreate(v.value, ctx);
    } else if (row.kind === "product.patch") {
      const v = validateProductPatch(payload);
      if (!v.ok) throw Object.assign(new Error(v.reason), { status: 400 });
      appliedRef = await applyProductPatch(v.value, ctx);
    } else {
      const v = validateSuggestionAccept(payload);
      if (!v.ok) throw Object.assign(new Error(v.reason), { status: 400 });
      appliedRef = await applySuggestionAccept(v.value, ctx as ReviewerContext & {
        roles: { permissions: string[]; storeId: string | null }[];
      });
    }
    await prisma.stagedChange.update({
      where: { id: row.id },
      data: { status: "APPLIED", appliedRef },
    });
    await audit(ctx.userId, "staged.apply", "staged_change", row.id, { kind: row.kind, appliedRef });
    return { reviewed: true as const, status: "APPLIED" as const, appliedRef };
  } catch (err) {
    const message = err instanceof Error ? err.message : "apply failed";
    await prisma.stagedChange.update({
      where: { id: row.id },
      data: { status: "FAILED", error: message.slice(0, 500) },
    });
    await audit(ctx.userId, "staged.failed", "staged_change", row.id, { kind: row.kind, error: message.slice(0, 200) });
    return { reviewed: true as const, status: "FAILED" as const, error: message };
  }
}
