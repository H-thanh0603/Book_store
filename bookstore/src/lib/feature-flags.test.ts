import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  orgFeatureFlag: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  subscription: { findUnique: vi.fn() },
}))

vi.mock('./db', () => ({ prisma: mockPrisma }))

import { orgFeatureOverride, setOrgFeature } from './feature-flags'
import { assertPlanFeature, planHasFeature } from './plan-limits'

const auth = { orgId: 'org-1' } as Parameters<typeof assertPlanFeature>[0]

function planFixture(overrides: Record<string, unknown> = {}) {
  return {
    code: 'FREE',
    name: 'Free',
    maxStores: 1,
    maxUsers: 3,
    features: { webhooks: false },
    ...overrides,
  }
}

describe('orgFeatureOverride', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null without an org (admin/legacy paths)', async () => {
    expect(await orgFeatureOverride(null, 'webhooks')).toBeNull()
    expect(mockPrisma.orgFeatureFlag.findUnique).not.toHaveBeenCalled()
  })

  it('returns the row value when an override exists', async () => {
    mockPrisma.orgFeatureFlag.findUnique.mockResolvedValue({ enabled: true })
    expect(await orgFeatureOverride('org-1', 'webhooks')).toBe(true)
    expect(mockPrisma.orgFeatureFlag.findUnique).toHaveBeenCalledWith({
      where: { orgId_feature: { orgId: 'org-1', feature: 'webhooks' } },
      select: { enabled: true },
    })
  })

  it('returns null when no row exists (plan decides)', async () => {
    mockPrisma.orgFeatureFlag.findUnique.mockResolvedValue(null)
    expect(await orgFeatureOverride('org-1', 'webhooks')).toBeNull()
  })
})

describe('setOrgFeature', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts the flag row', async () => {
    mockPrisma.orgFeatureFlag.upsert.mockResolvedValue({})
    await setOrgFeature('org-1', 'pos_fast_lane', true)
    expect(mockPrisma.orgFeatureFlag.upsert).toHaveBeenCalledWith({
      where: { orgId_feature: { orgId: 'org-1', feature: 'pos_fast_lane' } },
      create: { orgId: 'org-1', feature: 'pos_fast_lane', enabled: true },
      update: { enabled: true },
    })
  })
})

describe('plan feature checks with per-org override', () => {
  beforeEach(() => vi.clearAllMocks())

  it('override enables a plan-excluded feature (pilot)', async () => {
    mockPrisma.orgFeatureFlag.findUnique.mockResolvedValue({ enabled: true })
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: planFixture() })
    await expect(assertPlanFeature(auth, 'webhooks')).resolves.toBeUndefined()
    expect(await planHasFeature('org-1', 'webhooks')).toBe(true)
    // Override short-circuits: the plan is never even loaded.
    expect(mockPrisma.subscription.findUnique).not.toHaveBeenCalled()
  })

  it('override disables a plan-included feature (kill-switch)', async () => {
    mockPrisma.orgFeatureFlag.findUnique.mockResolvedValue({ enabled: false })
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: planFixture({ features: {} }) })
    await expect(assertPlanFeature(auth, 'webhooks')).rejects.toMatchObject({ code: 'FEATURE_DISABLED', status: 403 })
    expect(await planHasFeature('org-1', 'webhooks')).toBe(false)
  })

  it('no override falls through to the plan (FREE excludes webhooks)', async () => {
    mockPrisma.orgFeatureFlag.findUnique.mockResolvedValue(null)
    mockPrisma.subscription.findUnique.mockResolvedValue({ plan: planFixture() })
    await expect(assertPlanFeature(auth, 'webhooks')).rejects.toMatchObject({ code: 'PLAN_LIMIT' })
    expect(await planHasFeature('org-1', 'webhooks')).toBe(false)
  })

  it('no override and no plan defaults to allowed', async () => {
    mockPrisma.orgFeatureFlag.findUnique.mockResolvedValue(null)
    mockPrisma.subscription.findUnique.mockResolvedValue(null)
    await expect(assertPlanFeature(auth, 'webhooks')).resolves.toBeUndefined()
    expect(await planHasFeature('org-1', 'webhooks')).toBe(true)
  })
})
