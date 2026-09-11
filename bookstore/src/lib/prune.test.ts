import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  auditLog: { deleteMany: vi.fn() },
  webhookDelivery: { deleteMany: vi.fn() },
}))

vi.mock('./db', () => ({ prisma: mockPrisma }))

import { pruneAuditLogs, pruneWebhookDeliveries } from './prune'

describe('pruneAuditLogs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes rows older than the 90-day default window', async () => {
    mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 5 })
    const res = await pruneAuditLogs()
    expect(res).toEqual({ deleted: 5 })
    const where = mockPrisma.auditLog.deleteMany.mock.calls[0][0].where
    const cutoff: Date = where.createdAt.lt
    expect(cutoff).toBeInstanceOf(Date)
    const ageDays = (Date.now() - cutoff.getTime()) / 86_400_000
    expect(ageDays).toBeCloseTo(90, 0)
  })

  it('honours AUDIT_LOG_RETENTION_DAYS', async () => {
    process.env.AUDIT_LOG_RETENTION_DAYS = '365'
    mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 0 })
    await pruneAuditLogs()
    const cutoff: Date = mockPrisma.auditLog.deleteMany.mock.calls[0][0].where.createdAt.lt
    const ageDays = (Date.now() - cutoff.getTime()) / 86_400_000
    expect(ageDays).toBeCloseTo(365, 0)
    delete process.env.AUDIT_LOG_RETENTION_DAYS
  })

  it('ignores invalid retention values (falls back to default)', async () => {
    process.env.AUDIT_LOG_RETENTION_DAYS = 'soon'
    mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 0 })
    await pruneAuditLogs()
    const cutoff: Date = mockPrisma.auditLog.deleteMany.mock.calls[0][0].where.createdAt.lt
    expect((Date.now() - cutoff.getTime()) / 86_400_000).toBeCloseTo(90, 0)
    delete process.env.AUDIT_LOG_RETENTION_DAYS
  })
})

describe('pruneWebhookDeliveries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes only DELIVERED rows past the window (retry queue untouched)', async () => {
    mockPrisma.webhookDelivery.deleteMany.mockResolvedValue({ count: 3 })
    const res = await pruneWebhookDeliveries()
    expect(res).toEqual({ deleted: 3 })
    const where = mockPrisma.webhookDelivery.deleteMany.mock.calls[0][0].where
    // deliveredAt NOT NULL and < cutoff — pending/retrying rows must survive
    expect(where.deliveredAt).toEqual({ not: null, lt: expect.any(Date) })
  })

  it('honours WEBHOOK_DELIVERY_RETENTION_DAYS', async () => {
    process.env.WEBHOOK_DELIVERY_RETENTION_DAYS = '7'
    mockPrisma.webhookDelivery.deleteMany.mockResolvedValue({ count: 0 })
    await pruneWebhookDeliveries()
    const cutoff: Date = mockPrisma.webhookDelivery.deleteMany.mock.calls[0][0].where.deliveredAt.lt
    expect((Date.now() - cutoff.getTime()) / 86_400_000).toBeCloseTo(7, 0)
    delete process.env.WEBHOOK_DELIVERY_RETENTION_DAYS
  })
})
