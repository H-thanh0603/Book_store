import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scanLossPrevention, getRuleThreshold } from './loss-prevention'
import { prisma } from './db'
import { getSystemConfig } from './api'

const hoisted = vi.hoisted(() => {
  // SQL results per scan, set by each test. P2-1: shifts + cancelledPaid
  // scans are raw SQL now — route by a marker unique to each query.
  const sqlResults: Record<string, any[]> = {};
  const queryRaw = vi.fn(async (_tag: TemplateStringsArray, ..._rest: any[]) => {
    const sql = String(_tag);
    if (sql.includes('FROM "PosShift"')) return sqlResults.shifts ?? [];
    if (sql.includes('FROM "PosTransaction" t')) return sqlResults.cancelledPaid ?? [];
    return sqlResults.discountOffenders ?? [];
  });
  return { sqlResults, queryRaw };
});

vi.mock('./db', () => ({
  prisma: {
    $queryRaw: hoisted.queryRaw,
    return: { findMany: vi.fn().mockResolvedValue([]) },
    posShift: {
      findMany: vi.fn().mockImplementation((args: unknown) => {
        // Evidence re-read after the SQL scan (id IN [...])
        const where = (args as { where?: { id?: { in?: string[] } } })?.where;
        if (where?.id?.in) {
          return Promise.resolve(
            where.id.in.map((id: string) => ({ id, variance: 150000n })),
          );
        }
        return Promise.resolve([]);
      }),
    },
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
    vi.clearAllMocks();
    Object.keys(hoisted.sqlResults).forEach((k) => delete hoisted.sqlResults[k]);
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
    // P2-1: the SQL scan returns ids; evidence re-read supplies variance.
    hoisted.sqlResults.shifts = [{ id: 'shift-1' }];

    await scanLossPrevention()
    const calls = vi.mocked(prisma.lossAlert.upsert).mock.calls
    const cashVarianceCalls = calls.filter(c => (c[0] as any).where?.rule_entityType_entityId?.rule === 'CASH_VARIANCE')
    expect(cashVarianceCalls.length).toBe(1)
  })

  it('ignores shifts below threshold (SQL filters them out)', async () => {
    hoisted.sqlResults.shifts = [];

    await scanLossPrevention()
    // Should only be called for stock shrinkage (if any), not cash variance
    const calls = vi.mocked(prisma.lossAlert.upsert).mock.calls
    const cashVarianceCalls = calls.filter(c => (c[0] as any).where?.rule_entityType_entityId?.rule === 'CASH_VARIANCE')
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
