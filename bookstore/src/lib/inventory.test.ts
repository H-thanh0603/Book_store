import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAvailable, getAvailableForStore } from './inventory'

vi.mock('./db', () => ({
  prisma: {
    inventoryBalance: {
      findUnique: vi.fn(),
    },
    inventoryMovement: {
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}))

import { prisma } from './db'

describe('getAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns available stock when balance exists', async () => {
    vi.mocked(prisma.inventoryBalance.findUnique).mockResolvedValue({
      onHand: 100,
      reserved: 20,
    } as any)

    const result = await getAvailable('variant-1', 'location-1')
    expect(result).toBe(80)
  })

  it('returns 0 when no balance exists', async () => {
    vi.mocked(prisma.inventoryBalance.findUnique).mockResolvedValue(null as any)

    const result = await getAvailable('variant-1', 'location-1')
    expect(result).toBe(0)
  })
})

describe('getAvailableForStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns total available across store locations', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ total: 150 }])

    const result = await getAvailableForStore('variant-1', 'store-1')
    expect(result).toBe(150)
  })

  it('returns 0 when no data', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([])

    const result = await getAvailableForStore('variant-1', 'store-1')
    expect(result).toBe(0)
  })
})
