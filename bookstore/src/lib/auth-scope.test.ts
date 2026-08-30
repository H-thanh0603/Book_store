import { describe, it, expect, vi } from 'vitest'
import { resolveStoreScope, type AuthContext } from './auth'

describe('resolveStoreScope', () => {
  const unscopedAuth: AuthContext = {
    userId: 'u1',
    email: 'admin@test.com',
    roles: [{ role: 'admin', storeId: null, permissions: ['products.view', 'orders.view'] }],
  }

  const storeScopedAuth: AuthContext = {
    userId: 'u2',
    email: 'staff@test.com',
    roles: [
      { role: 'staff', storeId: 'store-1', permissions: ['products.view'] },
      { role: 'staff', storeId: 'store-2', permissions: ['products.view'] },
    ],
  }

  const noStoreAuth: AuthContext = {
    userId: 'u3',
    email: 'limited@test.com',
    roles: [{ role: 'limited', storeId: null, permissions: [] }],
  }

  describe('unscoped role (storeId = null)', () => {
    it('returns null when no storeId requested (all stores)', () => {
      const result = resolveStoreScope(unscopedAuth)
      expect(result).toBeNull()
    })

    it('returns requested storeId when specified', () => {
      const result = resolveStoreScope(unscopedAuth, 'store-1')
      expect(result).toEqual(['store-1'])
    })
  })

  describe('store-scoped role', () => {
    it('returns all own stores when no storeId requested', () => {
      const result = resolveStoreScope(storeScopedAuth)
      expect(result).toEqual(expect.arrayContaining(['store-1', 'store-2']))
    })

    it('returns requested store if user has access', () => {
      const result = resolveStoreScope(storeScopedAuth, 'store-1')
      expect(result).toEqual(['store-1'])
    })

    it('throws 403 for store user does not have access to', () => {
      expect(() => resolveStoreScope(storeScopedAuth, 'store-999')).toThrow('Forbidden: store store-999')
    })
  })

  describe('permission filtering', () => {
    it('filters roles by permission code', () => {
      const auth: AuthContext = {
        userId: 'u4',
        email: 'test@test.com',
        roles: [
          { role: 'staff', storeId: 'store-1', permissions: ['products.view'] },
          { role: 'manager', storeId: 'store-2', permissions: ['orders.view'] },
        ],
      }
      // Only staff role has products.view
      const result = resolveStoreScope(auth, 'store-1', 'products.view')
      expect(result).toEqual(['store-1'])
    })

    it('returns empty array when no role has the permission', () => {
      expect(() => resolveStoreScope(noStoreAuth, 'store-1', 'products.view')).toThrow('Forbidden: no store scope')
    })
  })
})
