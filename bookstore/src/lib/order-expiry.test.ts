import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  order: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  inventoryMovement: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('./db', () => ({
  prisma: mockPrisma,
}))

vi.mock('./api', () => ({
  getSystemConfig: vi.fn().mockResolvedValue(60),
  fail: vi.fn().mockImplementation((status, code, msg) => {
    throw new Error(msg)
  }),
}))

vi.mock('./inventory', () => ({
  applyMovement: vi.fn(),
}))

vi.mock('./auth', () => ({
  audit: vi.fn(),
}))

import { expireStaleReservations } from './order-expiry'

describe('expireStaleReservations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns zero counts when no stale orders exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'sys-1' })
    mockPrisma.order.findMany.mockResolvedValue([])

    const result = await expireStaleReservations()
    expect(result.scanned).toBe(0)
    expect(result.expired).toBe(0)
  })

  it('expires stale orders and releases reservations', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'sys-1' })
    mockPrisma.order.findMany.mockResolvedValue([
      {
        id: 'order-1',
        number: 'ORD-001',
        items: [{ variantId: 'v1' }],
      },
    ])
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        order: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn(),
        },
        inventoryMovement: {
          findMany: vi.fn().mockResolvedValue([
            { variantId: 'v1', locationId: 'loc-1' },
          ]),
        },
      }
      return fn(tx)
    })

    const result = await expireStaleReservations()
    expect(result.scanned).toBe(1)
    expect(result.expired).toBe(1)
  })
})
