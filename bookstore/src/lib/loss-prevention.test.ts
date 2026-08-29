import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scanLossPrevention, getRuleThreshold } from './loss-prevention'
import { prisma } from './db'
import { getSystemConfig } from './api'

vi.mock('./db', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    return: { findMany: vi.fn().mockResolvedValue([]) },
    posShift: { findMany: vi.fn().mockResolvedValue([]) },
    inventoryMovement: { findMany: vi.fn().mockResolvedValue([]) },
    posTransaction: { findMany: vi.fn().mockResolvedValue([]) },
    lossAlert: {
      upsert: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    organization: { findFirst: vi.fn().mockResolvedValue(null) },
    lossPreventionRule: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock('./api', () => ({
  getSystemConfig: vi.fn().mockImplementation((key: string, fallback: any) => {
    const defaults: Record<string, any> = {
      'loss.maxRefund': 500000,
      'loss.maxDiscountPercent': 30,
      'loss.maxCashVariance': 100000,
      'loss.maxStockLoss': 10,
    }
    return Promise.resolve(defaults[key] ?? fallback)
  }),
}))

describe('scanLossPrevention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs without errors on empty data', async () => {
    const result = await scanLossPrevention()
    expect(Array.isArray(result)).toBe(true)
  })

  it('detects large refunds', async () => {
    vi.mocked(prisma.return.findMany).mockResolvedValue([
      { id: 'ret-1', number: 'RET-001', refundTotal: 600000n },
    ] as any)

    await scanLossPrevention()
    expect(prisma.lossAlert.upsert).toHaveBeenCalled()
  })

  it('detects cash variance exceeding threshold', async () => {
    vi.mocked(prisma.posShift.findMany).mockResolvedValue([
      { id: 'shift-1', variance: 150000n },
    ] as any)

    await scanLossPrevention()
    expect(prisma.lossAlert.upsert).toHaveBeenCalled()
  })

  it('ignores small cash variance', async () => {
    vi.mocked(prisma.posShift.findMany).mockResolvedValue([
      { id: 'shift-1', variance: 50000n },
    ] as any)

    await scanLossPrevention()
    // Should only be called for stock shrinkage (if any), not cash variance
    const calls = vi.mocked(prisma.lossAlert.upsert).mock.calls
    const cashVarianceCalls = calls.filter(c => c[0].where?.rule === 'CASH_VARIANCE')
    expect(cashVarianceCalls.length).toBe(0)
  })
})

describe('getRuleThreshold', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns the active per-org override when present', async () => {
    vi.mocked(prisma.lossPreventionRule.findUnique).mockResolvedValue({
      id: 'r1', orgId: 'orgA', kind: 'LARGE_REFUND', threshold: 1_500_000n, active: true,
      createdAt: new Date(), updatedAt: new Date(),
    } as any)
    const v = await getRuleThreshold('orgA', 'LARGE_REFUND')
    expect(v).toBe(1_500_000n)
    expect(getSystemConfig).not.toHaveBeenCalled()
  })

  it('falls back to SystemConfig when per-org rule is inactive', async () => {
    vi.mocked(prisma.lossPreventionRule.findUnique).mockResolvedValue({
      id: 'r1', orgId: 'orgA', kind: 'LARGE_REFUND', threshold: 1n, active: false,
      createdAt: new Date(), updatedAt: new Date(),
    } as any)
    const v = await getRuleThreshold('orgA', 'LARGE_REFUND')
    expect(v).toBe(500_000n)
    expect(getSystemConfig).toHaveBeenCalledWith('loss.maxRefund', 500_000)
  })

  it('falls back to SystemConfig when no per-org row exists', async () => {
    vi.mocked(prisma.lossPreventionRule.findUnique).mockResolvedValue(null)
    const v = await getRuleThreshold('orgA', 'EXCESSIVE_DISCOUNT')
    expect(v).toBe(30n)
  })
})
