import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRawUnsafe: vi.fn(),
}))

vi.mock('./db', () => ({ prisma: mockPrisma }))

import { detachOldInventoryPartitions } from './partitions'

// Freeze time at 2026-09-11 so the 18-month retention cutoff is 2025-03-01:
// partitions 2025-02 and older detach; 2025-03 and newer stay.
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-09-11T00:00:00Z'))

describe('detachOldInventoryPartitions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('detaches only partitions older than the retention window', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { relname: 'InventoryMovement_p_2024_12' }, // old → detach
      { relname: 'InventoryMovement_p_2025_02' }, // old → detach (cutoff 2025-03)
      { relname: 'InventoryMovement_p_2025_03' }, // boundary → keep (== cutoff month)
      { relname: 'InventoryMovement_p_2026_08' }, // current → keep
    ])
    const res = await detachOldInventoryPartitions()
    expect(res.detached).toEqual(['InventoryMovement_p_2024_12', 'InventoryMovement_p_2025_02'])
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(2)
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'ALTER TABLE "InventoryMovement" DETACH PARTITION "InventoryMovement_p_2024_12"'
    )
  })

  it('never detaches partitions with unexpected names', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ relname: 'InventoryMovement' }, { relname: 'something_else_p_2020_01' }])
    const res = await detachOldInventoryPartitions()
    expect(res.detached).toEqual([])
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled()
  })

  it('is a no-op when everything is within the window', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ relname: 'InventoryMovement_p_2026_09' }])
    const res = await detachOldInventoryPartitions()
    expect(res.detached).toEqual([])
  })
})
