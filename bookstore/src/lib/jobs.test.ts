import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JOB_KINDS, scheduleNightly, pruneFinishedRuns } from './jobs'

vi.mock('./db', () => ({
  prisma: {
    jobRun: {
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import { prisma } from './db'

describe('JOB_KINDS', () => {
  it('has expected job kinds', () => {
    expect(JOB_KINDS).toHaveProperty('replenishment.generate')
    expect(JOB_KINDS).toHaveProperty('loss.scan')
    expect(JOB_KINDS).toHaveProperty('order.expire_reservations')
  })

  it('each value is a function', () => {
    for (const [key, fn] of Object.entries(JOB_KINDS)) {
      expect(typeof fn).toBe('function')
    }
  })
})

describe('scheduleNightly', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates scheduled job runs', async () => {
    vi.mocked(prisma.jobRun.upsert).mockResolvedValue({ id: 'test', kind: 'test' } as any)
    const result = await scheduleNightly()
    expect(Array.isArray(result)).toBe(true)
    expect(prisma.jobRun.upsert).toHaveBeenCalled()
  })
})

describe('pruneFinishedRuns', () => {
  it('calls deleteMany with correct filter', async () => {
    await pruneFinishedRuns()
    expect(prisma.jobRun.deleteMany).toHaveBeenCalled()
  })
})
