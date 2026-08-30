import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  order: {
    findFirst: vi.fn(),
  },
  store: {
    findFirst: vi.fn(),
  },
  productVariant: {
    findMany: vi.fn(),
  },
  customer: {
    upsert: vi.fn(),
  },
}))

vi.mock('./db', () => ({
  prisma: mockPrisma,
  prismaRead: mockPrisma,
  withTxRetry: vi.fn((fn: () => Promise<any>) => fn()),
  TX_OPTIONS: { timeout: 15000, maxWait: 5000 },
}))

vi.mock('./orders', () => ({
  createReservedOrder: vi.fn(),
}))

vi.mock('./vnpay', () => ({
  buildVnpayUrl: vi.fn(),
  vnpayConfigured: vi.fn().mockReturnValue(false),
}))

vi.mock('./mail', () => ({
  sendMail: vi.fn(),
}))

vi.mock('./embeddings', () => ({
  embedText: vi.fn(),
}))

vi.mock('./api', () => ({
  fail: vi.fn().mockImplementation((status, code, msg) => {
    throw Object.assign(new Error(msg), { status, code })
  }),
  nextBusinessNumber: vi.fn().mockResolvedValue('CUS-2026-000001'),
}))

import { checkoutStorefrontOrder } from './storefront'
import { createReservedOrder } from './orders'

describe('checkoutStorefrontOrder', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const validInput = {
    idempotencyKey: 'a'.repeat(16),
    storeId: 'store-1',
    fulfillment: 'delivery' as const,
    customer: { name: 'Test', phone: '0901234567', address: '123 Test St' },
    items: [{ variantId: 'v1', quantity: 1 }],
  }

  it('rejects invalid idempotency key', async () => {
    await expect(
      checkoutStorefrontOrder({ ...validInput, idempotencyKey: 'short' })
    ).rejects.toThrow('Invalid idempotency key')
  })

  it('rejects delivery without address', async () => {
    await expect(
      checkoutStorefrontOrder({
        ...validInput,
        customer: { name: 'Test', phone: '0901234567' },
      })
    ).rejects.toThrow('Delivery address is required')
  })

  it('rejects invalid phone', async () => {
    await expect(
      checkoutStorefrontOrder({
        ...validInput,
        customer: { name: 'Test', phone: '123' },
      })
    ).rejects.toThrow('Valid customer name and phone')
  })

  it('rejects empty items', async () => {
    await expect(
      checkoutStorefrontOrder({ ...validInput, items: [] })
    ).rejects.toThrow('Cart must contain 1-50 items')
  })

  it('rejects too many items', async () => {
    await expect(
      checkoutStorefrontOrder({
        ...validInput,
        items: Array.from({ length: 51 }, (_, i) => ({ variantId: `v${i}`, quantity: 1 })),
      })
    ).rejects.toThrow('Cart must contain 1-50 items')
  })

  it('rejects invalid email', async () => {
    await expect(
      checkoutStorefrontOrder({
        ...validInput,
        customer: { ...validInput.customer, email: 'bad' },
      })
    ).rejects.toThrow('Invalid email address')
  })

  it('creates order successfully on first checkout', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null)
    mockPrisma.store.findFirst.mockResolvedValue({ id: 'store-1', active: true })
    mockPrisma.customer.upsert.mockResolvedValue({ id: 'cust-1' })
    mockPrisma.productVariant.findMany.mockResolvedValue([
      { id: 'v1', product: { name: 'Test Book' } },
    ])
    vi.mocked(createReservedOrder).mockResolvedValue({
      id: 'order-1', number: 'ORD-001', subtotal: 100000n, discountTotal: 0n,
      total: 100000n, items: [{ variantId: 'v1', quantity: 1, unitPrice: 100000n, discount: 0n }],
    } as any)

    const result = await checkoutStorefrontOrder(validInput)
    expect(result.number).toBe('ORD-001')
  })

  it('returns existing order on idempotent retry', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({
      id: 'existing-order', number: 'ORD-EX', total: 100000n, status: 'CONFIRMED',
      customer: { phone: '0901234567' },
    })

    const result = await checkoutStorefrontOrder(validInput)
    expect(result.number).toBe('ORD-EX')
  })

  it('rejects when idempotency key belongs to another customer', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({
      id: 'other-order', total: 100000n, customer: { phone: '0999999999' },
    })

    await expect(checkoutStorefrontOrder(validInput)).rejects.toThrow('another order')
  })

  it('validates pickup fulfillment without address', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null)
    mockPrisma.store.findFirst.mockResolvedValue({ id: 'store-1', active: true })
    mockPrisma.customer.upsert.mockResolvedValue({ id: 'cust-1' })
    mockPrisma.productVariant.findMany.mockResolvedValue([
      { id: 'v1', product: { name: 'Test Book' } },
    ])
    vi.mocked(createReservedOrder).mockResolvedValue({
      id: 'order-1', number: 'ORD-002', subtotal: 100000n, discountTotal: 0n,
      total: 100000n, items: [{ variantId: 'v1', quantity: 1, unitPrice: 100000n, discount: 0n }],
    } as any)

    const result = await checkoutStorefrontOrder({
      ...validInput,
      fulfillment: 'pickup',
      customer: { name: 'Test', phone: '0901234567' },
    })
    expect(result.number).toBe('ORD-002')
  })
})
