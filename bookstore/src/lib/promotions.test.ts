import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluatePromotions, mergeLineDiscounts, type CartLine } from './promotions'

const mockPrisma = vi.hoisted(() => ({
  store: {
    findUnique: vi.fn().mockResolvedValue({ region: { orgId: 'org-1' } }),
  },
  customer: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
  promotion: {
    findMany: vi.fn(),
  },
  promotionRedemption: {
    findMany: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('./db', () => ({
  prisma: mockPrisma,
}))

import {} from './db'

describe('evaluatePromotions', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const lines: CartLine[] = [
    { variantId: 'v1', productId: 'p1', categoryId: 'cat-1', quantity: 2, unitPrice: 100000n },
    { variantId: 'v2', productId: 'p2', categoryId: 'cat-1', quantity: 1, unitPrice: 50000n },
  ]

  it('returns empty when no active promotions', async () => {
    mockPrisma.promotion.findMany.mockResolvedValue([])
    const result = await evaluatePromotions({ lines, channel: 'POS', storeId: 's1' })
    expect(result).toEqual([])
  })

  it('applies percentage promotion', async () => {
    mockPrisma.promotion.findMany.mockResolvedValue([{
      id: 'promo1', name: '10% OFF', type: 'percentage', value: 10n,
      active: true, startAt: new Date('2020-01-01'), endAt: null,
      channel: 'POS', stores: [], memberOnly: false, code: null,
      stackable: false, priority: 0, usageLimit: null, usedCount: 0, perCustomerLimit: null,
      minQty: 0, buyQty: null, getQty: null, categoryId: null,
    }])
    const result = await evaluatePromotions({ lines, channel: 'POS', storeId: 's1' })
    expect(result.length).toBe(1)
    expect(result[0].discountTotal).toBe(25000n) // 10% of 250000
  })

  it('applies fixed promotion', async () => {
    mockPrisma.promotion.findMany.mockResolvedValue([{
      id: 'promo1', name: '50k OFF', type: 'fixed', value: 50000n,
      active: true, startAt: new Date('2020-01-01'), endAt: null,
      channel: 'ALL', stores: [], memberOnly: false, code: null,
      stackable: false, priority: 0, usageLimit: null, usedCount: 0, perCustomerLimit: null,
      minQty: 0, buyQty: null, getQty: null, categoryId: null,
    }])
    const result = await evaluatePromotions({ lines, channel: 'POS', storeId: 's1' })
    expect(result.length).toBe(1)
    expect(result[0].discountTotal).toBe(50000n)
  })

  it('applies buy_x_get_y promotion', async () => {
    mockPrisma.promotion.findMany.mockResolvedValue([{
      id: 'promo1', name: 'Buy 2 Get 1', type: 'buy_x_get_y', value: 0n,
      active: true, startAt: new Date('2020-01-01'), endAt: null,
      channel: 'ALL', stores: [], memberOnly: false, code: null,
      stackable: false, priority: 0, usageLimit: null, usedCount: 0, perCustomerLimit: null,
      minQty: 0, buyQty: 2, getQty: 1, categoryId: null,
    }])
    const result = await evaluatePromotions({ lines, channel: 'POS', storeId: 's1' })
    expect(result.length).toBe(1)
  })

  it('filters by store scope', async () => {
    mockPrisma.promotion.findMany.mockResolvedValue([{
      id: 'promo1', name: 'Store only', type: 'percentage', value: 10n,
      active: true, startAt: new Date('2020-01-01'), endAt: null,
      channel: 'ALL', stores: [{ storeId: 'other-store' }], memberOnly: false,
      code: null, stackable: false, priority: 0, usageLimit: null, usedCount: 0, perCustomerLimit: null,
      minQty: 0, buyQty: null, getQty: null, categoryId: null,
    }])
    const result = await evaluatePromotions({ lines, channel: 'POS', storeId: 's1' })
    expect(result).toEqual([])
  })

  it('filters member-only promos when no customer', async () => {
    mockPrisma.promotion.findMany.mockResolvedValue([{
      id: 'promo1', name: 'Members', type: 'percentage', value: 10n,
      active: true, startAt: new Date('2020-01-01'), endAt: null,
      channel: 'ALL', stores: [], memberOnly: true, code: null,
      stackable: false, priority: 0, usageLimit: null, usedCount: 0, perCustomerLimit: null,
      minQty: 0, buyQty: null, getQty: null, categoryId: null,
    }])
    const result = await evaluatePromotions({ lines, channel: 'POS', storeId: 's1' })
    expect(result).toEqual([])
  })

  it('filters by coupon code', async () => {
    mockPrisma.promotion.findMany.mockResolvedValue([{
      id: 'promo1', name: 'Coupon', type: 'percentage', value: 10n,
      active: true, startAt: new Date('2020-01-01'), endAt: null,
      channel: 'ALL', stores: [], memberOnly: false, code: 'SAVE10',
      stackable: false, priority: 0, usageLimit: null, usedCount: 0, perCustomerLimit: null,
      minQty: 0, buyQty: null, getQty: null, categoryId: null,
    }])
    const result = await evaluatePromotions({ lines, channel: 'POS', storeId: 's1', couponCode: 'WRONG' })
    expect(result).toEqual([])
  })

  it('accepts correct coupon code', async () => {
    mockPrisma.promotion.findMany.mockResolvedValue([{
      id: 'promo1', name: 'Coupon', type: 'percentage', value: 10n,
      active: true, startAt: new Date('2020-01-01'), endAt: null,
      channel: 'ALL', stores: [], memberOnly: false, code: 'SAVE10',
      stackable: false, priority: 0, usageLimit: null, usedCount: 0, perCustomerLimit: null,
      minQty: 0, buyQty: null, getQty: null, categoryId: null,
    }])
    const result = await evaluatePromotions({ lines, channel: 'POS', storeId: 's1', couponCode: 'save10' })
    expect(result.length).toBe(1)
  })

  it('skips when per-customer limit reached (PROMO-001)', async () => {
    mockPrisma.promotion.findMany.mockResolvedValue([{
      id: 'promo1', name: 'Once per customer', type: 'percentage', value: 10n,
      active: true, startAt: new Date('2020-01-01'), endAt: null,
      channel: 'ALL', stores: [], memberOnly: false, code: null,
      stackable: false, priority: 0, usageLimit: null, usedCount: 0, perCustomerLimit: 1,
      minQty: 0, buyQty: null, getQty: null, categoryId: null,
    }])
    mockPrisma.promotionRedemption.findMany.mockResolvedValue([{ promotionId: 'promo1', count: 1 }])
    const result = await evaluatePromotions({ lines, channel: 'POS', storeId: 's1', customerId: 'c1' })
    expect(result).toEqual([])
  })

  it('skips when usage limit reached', async () => {
    mockPrisma.promotion.findMany.mockResolvedValue([{
      id: 'promo1', name: 'Limited', type: 'percentage', value: 10n,
      active: true, startAt: new Date('2020-01-01'), endAt: null,
      channel: 'ALL', stores: [], memberOnly: false, code: null,
      stackable: false, priority: 0, usageLimit: 10, usedCount: 10, perCustomerLimit: null,
      minQty: 0, buyQty: null, getQty: null, categoryId: null,
    }])
    const result = await evaluatePromotions({ lines, channel: 'POS', storeId: 's1' })
    expect(result).toEqual([])
  })

  it('picks highest priority non-stackable promo', async () => {
    mockPrisma.promotion.findMany.mockResolvedValue([
      {
        id: 'low', name: 'Low', type: 'percentage', value: 5n,
        active: true, startAt: new Date('2020-01-01'), endAt: null,
        channel: 'ALL', stores: [], memberOnly: false, code: null,
        stackable: false, priority: 1, usageLimit: null, usedCount: 0, perCustomerLimit: null,
        minQty: 0, buyQty: null, getQty: null, categoryId: null,
      },
      {
        id: 'high', name: 'High', type: 'fixed', value: 30000n,
        active: true, startAt: new Date('2020-01-01'), endAt: null,
        channel: 'ALL', stores: [], memberOnly: false, code: null,
        stackable: false, priority: 10, usageLimit: null, usedCount: 0, perCustomerLimit: null,
        minQty: 0, buyQty: null, getQty: null, categoryId: null,
      },
    ])
    const result = await evaluatePromotions({ lines, channel: 'POS', storeId: 's1' })
    expect(result.length).toBe(1)
    expect(result[0].promoId).toBe('high')
  })

  it('filters by category', async () => {
    mockPrisma.promotion.findMany.mockResolvedValue([{
      id: 'promo1', name: 'Cat only', type: 'percentage', value: 20n,
      active: true, startAt: new Date('2020-01-01'), endAt: null,
      channel: 'ALL', stores: [], memberOnly: false, code: null,
      stackable: false, priority: 0, usageLimit: null, usedCount: 0, perCustomerLimit: null,
      minQty: 0, buyQty: null, getQty: null, categoryId: 'other-cat',
    }])
    const result = await evaluatePromotions({ lines, channel: 'POS', storeId: 's1' })
    expect(result).toEqual([])
  })

  it('applies stackable promos after non-stackable', async () => {
    mockPrisma.promotion.findMany.mockResolvedValue([
      {
        id: 'nonstack', name: 'NonStack', type: 'percentage', value: 10n,
        active: true, startAt: new Date('2020-01-01'), endAt: null,
        channel: 'ALL', stores: [], memberOnly: false, code: null,
        stackable: false, priority: 5, usageLimit: null, usedCount: 0, perCustomerLimit: null,
        minQty: 0, buyQty: null, getQty: null, categoryId: null,
      },
      {
        id: 'stack', name: 'Stack', type: 'fixed', value: 5000n,
        active: true, startAt: new Date('2020-01-01'), endAt: null,
        channel: 'ALL', stores: [], memberOnly: false, code: null,
        stackable: true, priority: 0, usageLimit: null, usedCount: 0, perCustomerLimit: null,
        minQty: 0, buyQty: null, getQty: null, categoryId: null,
      },
    ])
    const result = await evaluatePromotions({ lines, channel: 'POS', storeId: 's1' })
    expect(result.length).toBe(2)
  })
})

describe('mergeLineDiscounts', () => {
  it('caps discount at line value', () => {
    const lines: CartLine[] = [
      { variantId: 'v1', productId: 'p1', categoryId: 'cat-1', quantity: 1, unitPrice: 100000n },
    ]
    const applied = [{
      promoId: 'p1', name: 'big', discountTotal: 150000n,
      lineDiscounts: new Map([['v1', 150000n]]),
    }]
    const result = mergeLineDiscounts(applied, lines)
    expect(result.byVariant.get('v1')).toBe(100000n)
  })

  it('handles multi-variant cart', () => {
    const lines: CartLine[] = [
      { variantId: 'v1', productId: 'p1', categoryId: 'cat-1', quantity: 1, unitPrice: 100000n },
      { variantId: 'v2', productId: 'p2', categoryId: 'cat-1', quantity: 1, unitPrice: 50000n },
    ]
    const applied = [{
      promoId: 'p1', name: 'pct', discountTotal: 15000n,
      lineDiscounts: new Map([['v1', 10000n], ['v2', 5000n]]),
    }]
    const result = mergeLineDiscounts(applied, lines)
    expect(result.total).toBe(15000n)
  })
})
