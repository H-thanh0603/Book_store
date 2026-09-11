import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

// Mock fetch globally
global.fetch = vi.fn()

// Mock Prisma client
vi.mock('@/lib/db', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    customer: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    inventoryBalance: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn((fns: unknown) => {
      if (Array.isArray(fns)) {
        return Promise.all(fns)
      }
      return (fns as () => unknown)()
    }),
  },
}))

// next/headers dynamic APIs throw outside a request scope — unit tests
// invoke route handlers directly, so give them inert defaults. Individual
// tests that need specific header values override vi.mock in their own file
// (api-error-wiring.test.ts, customer-auth.test.ts pattern).
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: () => undefined })),
  cookies: vi.fn(async () => ({ get: () => undefined, getAll: () => [] })),
}))
