// Plan-limit enforcement (audit BILL-001 follow-up).
//
// requirePermission centrally gates org STATUS (TRIAL/ACTIVE/SUSPENDED)
// since the P0 batch — but the Plan's quantitative limits (maxStores,
// maxUsers, features) were never checked anywhere: an org on the FREE
// plan could open unlimited stores, invite unlimited users and use
// webhook integrations a paid plan pays for. SaaS revenue leaked by
// quantity, not by status.
//
// Usage — call before the create in every growth path:
//   await assertWithinPlanLimits(auth, { stores: 1 })       // POST /api/stores
//   await assertWithinPlanLimits(auth, { users: 1 })        // invite/create user
//   await assertWithinPlanLimits(auth, { webhookEndpoints: 1 })
//   await assertPlanFeature(auth, "webhooks")
//
// Orgs without a Subscription row (legacy/admin orgs) are unlimited —
// limits are a billing construct, not a hard system cap.
//
// Known gap (WS3.2 audit): maxUsers has no growth path to guard — there is
// no staff-invite route (users only arrive via self-signup into their own
// org), so the users counter can never increment today. When an invite API
// lands, it must call assertWithinPlanLimits(auth, { users: 1 }) first.

import { prisma } from "./db";
import type { AuthContext } from "./auth";

function limitError(limit: string, current: number, max: number, planCode: string): never {
  throw Object.assign(
    new Error(
      `Gói ${planCode} chỉ cho phép tối đa ${max} ${limit} (hiện tại ${current}). Nâng cấp gói để tiếp tục.`
    ),
    { status: 403, code: "PLAN_LIMIT" }
  );
}

function featureError(feature: string, planCode: string): never {
  throw Object.assign(
    new Error(`Gói ${planCode} không bao gồm tính năng "${feature}". Nâng cấp gói để sử dụng.`),
    { status: 403, code: "PLAN_LIMIT" }
  );
}

export type PlanLimitsInput = {
  /** additional stores the caller is about to create */
  stores?: number;
  /** additional org users the caller is about to create/invite */
  users?: number;
  /** additional webhook endpoints the caller is about to register */
  webhookEndpoints?: number;
};

/** Load the org's subscription + plan, or null when unbounded (no sub). */
async function loadPlan(orgId: string | null | undefined) {
  if (!orgId) return null;
  const sub = await prisma.subscription.findUnique({
    where: { orgId },
    select: {
      plan: {
        select: { code: true, name: true, maxStores: true, maxUsers: true, features: true },
      },
    },
  });
  return sub?.plan ?? null;
}

/**
 * Assert the org's post-increment counts stay within the plan's limits.
 * Throws 403 PLAN_LIMIT (Vietnamese message for the admin UI) when exceeded.
 */
export async function assertWithinPlanLimits(auth: AuthContext, increment: PlanLimitsInput): Promise<void> {
  const plan = await loadPlan(auth.orgId);
  if (!plan) return; // no subscription — legacy/admin org, unbounded

  if (increment.stores) {
    const current = await prisma.store.count({
      where: { region: { orgId: auth.orgId! } },
    });
    if (current + increment.stores > plan.maxStores)
      limitError("cửa hàng", current, plan.maxStores, plan.code);
  }

  if (increment.users) {
    const current = await prisma.user.count({
      where: { orgId: auth.orgId! },
    });
    if (current + increment.users > plan.maxUsers)
      limitError("người dùng", current, plan.maxUsers, plan.code);
  }

  if (increment.webhookEndpoints) {
    const current = await prisma.webhookEndpoint.count({
      where: { orgId: auth.orgId! },
    });
    const max = featureNumber(plan.features, "maxWebhookEndpoints", 10);
    if (current + increment.webhookEndpoints > max)
      limitError("webhook endpoint", current, max, plan.code);
  }
}

/**
 * Assert a boolean plan feature (features JSON: { webhooks: true, ... }).
 * Unknown/missing features default to allowed — plans opt OUT of things,
 * they don't have to enumerate everything they include.
 */
export async function assertPlanFeature(auth: AuthContext, feature: string): Promise<void> {
  const plan = await loadPlan(auth.orgId);
  if (!plan) return;
  const features = (plan.features ?? {}) as Record<string, unknown>;
  if (feature in features && features[feature] === false) featureError(feature, plan.code);
}

function featureNumber(features: unknown, key: string, fallback: number): number {
  if (!features || typeof features !== "object") return fallback;
  const v = (features as Record<string, unknown>)[key];
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  return fallback;
}

/**
 * Background-path feature check (WS3.2): fire-and-forget jobs have no session,
 * so they can't use assertPlanFeature(auth). Returns false when the org's plan
 * excludes the feature — the caller must skip quietly (log, never throw:
 * billing gates must not break paid sales). Orgs without a subscription are
 * unlimited, same rule as the request path.
 */
export async function planHasFeature(orgId: string | null | undefined, feature: string): Promise<boolean> {
  const plan = await loadPlan(orgId);
  if (!plan) return true;
  const features = (plan.features ?? {}) as Record<string, unknown>;
  return !(feature in features && features[feature] === false);
}
