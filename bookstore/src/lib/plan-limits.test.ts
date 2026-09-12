import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  subscription: { findUnique: vi.fn() },
  store: { count: vi.fn() },
  user: { count: vi.fn() },
  webhookEndpoint: { count: vi.fn() },
}))

vi.mock('./db', () => ({ prisma: mockPrisma }))

import { assertWithinPlanLimits, assertPlanFeature, planHasFeature } from './plan-limits'

const auth = { orgId: 'org-1' } as Parameters<typeof assertWithinPlanLimits>[0]

function planFixture(overrides: Record<string, unknown> = {}) {
  return {
    code: 'FREE',
    name: 'Free',
    maxStores: 1,
    maxUsers: 3,
    features: { webhooks: false, maxWebhookEndpoints: 2 },
    ...overrides,
  }
}

describe('assertWithinPlanLimits', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes when under the limit', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: planFixture() })
    mockPrisma.store.count.mockResolvedValue(0) // 0 + 1 <= 1
    await expect(assertWithinPlanLimits(auth, { stores: 1 })).resolves.toBeUndefined()
  })

  it('throws 403 PLAN_LIMIT when the increment would exceed maxStores', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: planFixture() })
    mockPrisma.store.count.mockResolvedValue(1) // 1 + 1 > 1
    await expect(assertWithinPlanLimits(auth, { stores: 1 })).rejects.toMatchObject({
      status: 403,
      code: 'PLAN_LIMIT',
    })
  })

  it('throws when users would exceed maxUsers', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: planFixture({ maxUsers: 5 }) })
    mockPrisma.user.count.mockResolvedValue(5) // 5 + 1 > 5
    await expect(assertWithinPlanLimits(auth, { users: 1 })).rejects.toMatchObject({
      status: 403,
      code: 'PLAN_LIMIT',
    })
  })

  it('enforces webhook endpoint count from features.maxWebhookEndpoints', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: planFixture() })
    mockPrisma.webhookEndpoint.count.mockResolvedValue(2) // 2 + 1 > 2 (FREE cap)
    await expect(assertWithinPlanLimits(auth, { webhookEndpoints: 1 })).rejects.toMatchObject({
      code: 'PLAN_LIMIT',
    })
  })

  it('is unbounded for orgs without a subscription (legacy/admin)', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null)
    await expect(assertWithinPlanLimits(auth, { stores: 99, users: 99 })).resolves.toBeUndefined()
    // No count queries issued when there is no plan to check against.
    expect(mockPrisma.store.count).not.toHaveBeenCalled()
  })

  it('is unbounded for callers without an org (legacy superuser)', async () => {
    await expect(
      assertWithinPlanLimits({ orgId: null } as unknown as typeof auth, { stores: 5 })
    ).resolves.toBeUndefined()
    expect(mockPrisma.subscription.findUnique).not.toHaveBeenCalled()
  })

  it('checks only the limits the caller asks for', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: planFixture() })
    mockPrisma.user.count.mockResolvedValue(2) // 2 + 1 <= 3, passes
    await assertWithinPlanLimits(auth, { users: 1 })
    expect(mockPrisma.store.count).not.toHaveBeenCalled()
    expect(mockPrisma.user.count).toHaveBeenCalledOnce()
  })
})

describe('assertPlanFeature', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects a feature explicitly set to false', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: planFixture() })
    await expect(assertPlanFeature(auth, 'webhooks')).rejects.toMatchObject({
      status: 403,
      code: 'PLAN_LIMIT',
    })
  })

  it('allows features set to true', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      plan: planFixture({ features: { webhooks: true } }),
    })
    await expect(assertPlanFeature(auth, 'webhooks')).resolves.toBeUndefined()
  })

  it('allows unknown features (plans opt OUT of things, not into everything)', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: planFixture() })
    await expect(assertPlanFeature(auth, 'semanticSearch')).resolves.toBeUndefined()
  })

  it('is a no-op without a subscription', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null)
    await expect(assertPlanFeature(auth, 'webhooks')).resolves.toBeUndefined()
  })
})

describe('planHasFeature (background path)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns false when the plan excludes the feature', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      plan: planFixture({ features: { eInvoice: false } }),
    })
    await expect(planHasFeature('org-1', 'eInvoice')).resolves.toBe(false)
  })

  it('returns true when the plan includes the feature', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      plan: planFixture({ features: { eInvoice: true } }),
    })
    await expect(planHasFeature('org-1', 'eInvoice')).resolves.toBe(true)
  })

  it('returns true without a subscription (unlimited legacy orgs)', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null)
    await expect(planHasFeature('org-1', 'eInvoice')).resolves.toBe(true)
  })
})
