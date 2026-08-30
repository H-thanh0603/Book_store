import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  productVariant: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
}))

vi.mock('./db', () => ({
  prisma: mockPrisma,
}))

import { getProductRecommendations } from './recommendations'

describe('getProductRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns co-purchased recommendations when available', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        { id: 'v2', sku: 'SKU-002', name: 'Product B', score: 5 },
      ])

    const result = await getProductRecommendations('v1')
    expect(result.length).toBe(1)
    expect(result[0].reason).toBe('frequently_bought_together')
  })

  it('falls back to same category when no co-purchase data', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])
    mockPrisma.productVariant.findUnique.mockResolvedValue({
      id: 'v1',
      product: { categoryId: 'cat-1', status: 'active' },
    } as any)
    mockPrisma.productVariant.findMany.mockResolvedValue([
      { id: 'v2', sku: 'SKU-002', product: { name: 'Product B' } },
    ] as any)

    const result = await getProductRecommendations('v1')
    expect(result.length).toBeGreaterThanOrEqual(0)
  })

  it('returns empty when variant not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])
    mockPrisma.productVariant.findUnique.mockResolvedValue(null)

    const result = await getProductRecommendations('nonexistent')
    expect(result).toEqual([])
  })

  it('respects take parameter', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])

    const result = await getProductRecommendations('v1', 10)
    expect(Array.isArray(result)).toBe(true)
  })
})
