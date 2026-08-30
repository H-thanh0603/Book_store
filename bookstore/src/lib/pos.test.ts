import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openShift, closeShift, quoteSale } from './pos'

const mockPrisma = vi.hoisted(() => ({
  posShift: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  posTransaction: {
    findMany: vi.fn(),
  },
  payment: {
    findUnique: vi.fn(),
  },
  productVariant: {
    findMany: vi.fn(),
  },
  loyaltyAccount: {
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('./db', () => ({
  prisma: mockPrisma,
  withTxRetry: vi.fn((fn: () => Promise<any>) => fn()),
  TX_OPTIONS: { timeout: 15000, maxWait: 5000 },
}))

vi.mock('./api', () => ({
  fail: vi.fn().mockImplementation((status, code, msg) => {
    throw Object.assign(new Error(msg), { status, code })
  }),
  nextBusinessNumber: vi.fn().mockResolvedValue('TXN-2026-000001'),
  getSystemConfig: vi.fn().mockResolvedValue(10000),
}))

vi.mock('./inventory', () => ({
  applyMovement: vi.fn(),
}))

vi.mock('./promotions', () => ({
  evaluatePromotions: vi.fn().mockResolvedValue([]),
  mergeLineDiscounts: vi.fn().mockReturnValue({
    byVariant: new Map(),
    total: 0n,
  }),
}))

describe('openShift', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('creates a new shift successfully', async () => {
    mockPrisma.posShift.findFirst.mockResolvedValue(null)
    mockPrisma.posShift.create.mockResolvedValue({
      id: 'shift-1', terminalId: 'terminal-1', cashierId: 'cashier-1',
      openingCash: 500000n, status: 'OPEN',
    })

    const result = await openShift('terminal-1', 'cashier-1', 500000n)
    expect(result.status).toBe('OPEN')
  })

  it('rejects when terminal already has open shift', async () => {
    mockPrisma.posShift.findFirst.mockResolvedValue({ id: 'existing', status: 'OPEN' })
    await expect(openShift('terminal-1', 'cashier-1', 500000n)).rejects.toThrow('Terminal already has an open shift')
  })
})

describe('closeShift', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('closes shift with zero variance', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        posShift: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'shift-1', status: 'OPEN', openingCash: 500000n,
            transactions: [{ status: 'COMPLETED', payments: [{ method: 'CASH', amount: 100000n }] }],
          }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: 'shift-1', status: 'CLOSED', closingCash: 600000n, expectedCash: 600000n, variance: 0n,
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        auditLog: { create: vi.fn() },
      }
      return fn(tx)
    })

    const result = await closeShift('shift-1', 600000n)
    expect(result.variance).toBe(0n)
  })

  it('rejects when shift is not open', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        posShift: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'shift-1', status: 'CLOSED', openingCash: 500000n, transactions: [],
          }),
        },
      }
      return fn(tx)
    })
    await expect(closeShift('shift-1', 500000n)).rejects.toThrow('Shift not open')
  })
})

describe('quoteSale', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns price quote for valid cart', async () => {
    mockPrisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'v1', productId: 'p1', active: true,
        product: { categoryId: 'cat-1' },
        prices: [{ amount: 100000n }],
      },
    ])
    mockPrisma.loyaltyAccount.findUnique.mockResolvedValue(null)

    const result = await quoteSale({
      items: [{ variantId: 'v1', quantity: 2 }],
      storeId: 'store-1',
    })
    expect(result.subtotal).toBe(200000)
    expect(result.total).toBe(200000)
    expect(result.lines.length).toBe(1)
  })

  it('throws for unknown variant', async () => {
    mockPrisma.productVariant.findMany.mockResolvedValue([])
    await expect(
      quoteSale({
        items: [{ variantId: 'nonexistent', quantity: 1 }],
        storeId: 'store-1',
      })
    ).rejects.toThrow('Unknown or inactive variant')
  })

  it('applies loyalty redemption discount', async () => {
    mockPrisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'v1', productId: 'p1', active: true,
        product: { categoryId: 'cat-1' },
        prices: [{ amount: 500000n }],
      },
    ])
    mockPrisma.loyaltyAccount.findUnique.mockResolvedValue({
      customerId: 'c1', points: 500,
    })

    const result = await quoteSale({
      items: [{ variantId: 'v1', quantity: 1 }],
      storeId: 'store-1',
      customerId: 'c1',
      redeemPoints: 100,
    })
    expect(result.redeemable).toBeGreaterThan(0)
    expect(result.total).toBeGreaterThanOrEqual(0)
  })

  it('caps loyalty redemption so total never goes negative', async () => {
    mockPrisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'v1', productId: 'p1', active: true,
        product: { categoryId: 'cat-1' },
        prices: [{ amount: 10000n }],
      },
    ])
    mockPrisma.loyaltyAccount.findUnique.mockResolvedValue({
      customerId: 'c1', points: 99999,
    })

    const result = await quoteSale({
      items: [{ variantId: 'v1', quantity: 1 }],
      storeId: 'store-1',
      customerId: 'c1',
      redeemPoints: 99999,
    })
    expect(result.total).toBeGreaterThanOrEqual(0)
  })
})
