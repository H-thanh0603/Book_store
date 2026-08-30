import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createReservedOrder, type CreateOrderInput } from './orders'

vi.mock('./db', () => ({
  prisma: {
    productVariant: { findMany: vi.fn() },
    customer: { findUnique: vi.fn() },
    stockLocation: { findFirst: vi.fn() },
    order: { create: vi.fn() },
    promotion: { findMany: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  withTxRetry: vi.fn((fn: () => Promise<any>) => fn()),
  TX_OPTIONS: { timeout: 15000, maxWait: 5000 },
}))

vi.mock('./promotions', () => ({
  evaluatePromotions: vi.fn().mockResolvedValue([]),
  mergeLineDiscounts: vi.fn().mockReturnValue({
    byVariant: new Map(),
    total: 0n,
  }),
}))

vi.mock('./inventory', () => ({
  applyMovement: vi.fn(),
}))

describe('createReservedOrder - validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validInput: CreateOrderInput = {
    channel: 'WEB',
    customerId: 'cust-1',
    items: [{ variantId: 'v1', quantity: 1 }],
  }

  it('rejects invalid channel', async () => {
    await expect(
      createReservedOrder({ ...validInput, channel: 'INVALID' as any })
    ).rejects.toThrow('Invalid order channel')
  })

  it('rejects empty items', async () => {
    await expect(
      createReservedOrder({ ...validInput, items: [] })
    ).rejects.toThrow('customerId and items required')
  })

  it('rejects missing customerId', async () => {
    await expect(
      createReservedOrder({ ...validInput, customerId: '' })
    ).rejects.toThrow('customerId and items required')
  })

  it('rejects duplicate variantId', async () => {
    await expect(
      createReservedOrder({
        ...validInput,
        items: [
          { variantId: 'v1', quantity: 1 },
          { variantId: 'v1', quantity: 2 },
        ],
      })
    ).rejects.toThrow('A variant may appear only once')
  })

  it('rejects zero quantity', async () => {
    await expect(
      createReservedOrder({
        ...validInput,
        items: [{ variantId: 'v1', quantity: 0 }],
      })
    ).rejects.toThrow('positive integer quantity')
  })

  it('rejects negative quantity', async () => {
    await expect(
      createReservedOrder({
        ...validInput,
        items: [{ variantId: 'v1', quantity: -1 }],
      })
    ).rejects.toThrow('positive integer quantity')
  })

  it('rejects non-integer quantity', async () => {
    await expect(
      createReservedOrder({
        ...validInput,
        items: [{ variantId: 'v1', quantity: 1.5 }],
      })
    ).rejects.toThrow('positive integer quantity')
  })

  it('rejects invalid shipping for delivery', async () => {
    await expect(
      createReservedOrder({
        ...validInput,
        type: 'delivery',
        shipping: { recipientName: '', recipientPhone: '0901234567', address: '123 Test St' },
      })
    ).rejects.toThrow('Shipping recipient, phone and address are required')
  })
})
