import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma + webhook bus so the scan logic is tested in isolation.
const mockPrisma = vi.hoisted(() => ({
  webPayment: {
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
}))

vi.mock('./db', () => ({
  prisma: mockPrisma,
}))

const mockEmit = vi.hoisted(() => vi.fn(async () => ({ delivered: 0, queued: 0 })))
vi.mock('./webhook-bus', () => ({
  emit: mockEmit,
}))

import { scanRefundRequired } from './payment-refunds'

describe('scanRefundRequired', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stamps unqueued REFUND_REQUIRED rows and reports the open queue', async () => {
    mockPrisma.webPayment.updateMany.mockResolvedValue({ count: 2 })
    mockPrisma.webPayment.findMany.mockResolvedValue([
      {
        id: 'wp-1',
        txnRef: 'VNP1700000001',
        amount: 150000n,
        paidAt: new Date('2026-09-01T08:00:00Z'),
        order: { id: 'o1', number: 'ORD-1', store: { region: { orgId: 'org-1' } } },
      },
      {
        id: 'wp-2',
        txnRef: 'VNP1700000002',
        amount: 250000n,
        paidAt: new Date('2026-09-02T08:00:00Z'),
        order: { id: 'o2', number: 'ORD-2', store: { region: { orgId: 'org-1' } } },
      },
    ])

    const result = await scanRefundRequired()

    // Claim: stamp exactly the unqueued rows.
    expect(mockPrisma.webPayment.updateMany).toHaveBeenCalledWith({
      where: { status: 'REFUND_REQUIRED', refundStatus: null },
      data: { refundStatus: 'PENDING' },
    })
    expect(result).toEqual({ queued: 2, pending: 2 })
    // One summary webhook per org (not per row).
    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'payment.refund_required',
        orgId: 'org-1',
        payload: expect.objectContaining({ count: 2, totalVnd: 400000 }),
      })
    )
  })

  it('is a no-op when the queue is empty', async () => {
    mockPrisma.webPayment.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.webPayment.findMany.mockResolvedValue([])

    const result = await scanRefundRequired()
    expect(result).toEqual({ queued: 0, pending: 0 })
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('skips webhook emission for already-queued rows (stamped.count === 0)', async () => {
    // Rows stamped by a previous pass (or the migration backfill) must not
    // re-emit webhooks on every scheduler tick — the fan-out is only for
    // NEW queue entries.
    mockPrisma.webPayment.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.webPayment.findMany.mockResolvedValue([
      {
        id: 'wp-1',
        txnRef: 'VNP1700000003',
        amount: 100n,
        paidAt: null,
        order: { id: 'o1', number: 'ORD-3', store: { region: { orgId: 'org-1' } } },
      },
    ])

    const result = await scanRefundRequired()
    expect(result).toEqual({ queued: 0, pending: 1 })
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('continues when a webhook emit throws (refund queue still accurate)', async () => {
    mockPrisma.webPayment.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.webPayment.findMany.mockResolvedValue([
      {
        id: 'wp-1',
        txnRef: 'VNP1700000004',
        amount: 500n,
        paidAt: null,
        order: { id: 'o1', number: 'ORD-4', store: { region: { orgId: 'org-1' } } },
      },
    ])
    mockEmit.mockRejectedValueOnce(new Error('redis down'))

    const result = await scanRefundRequired()
    expect(result).toEqual({ queued: 1, pending: 1 })
  })

  it('does not emit for orphaned rows (no org resolvable)', async () => {
    mockPrisma.webPayment.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.webPayment.findMany.mockResolvedValue([
      {
        id: 'wp-1',
        txnRef: 'VNP1700000005',
        amount: 100n,
        paidAt: null,
        order: { id: 'o1', number: 'ORD-5', store: { region: { orgId: null } } },
      },
    ])
    const result = await scanRefundRequired()
    expect(result).toEqual({ queued: 1, pending: 1 })
    expect(mockEmit).not.toHaveBeenCalled()
  })
})
