/* eslint-disable @typescript-eslint/no-explicit-any --
   The column maps are intentionally loosely-typed: each `format` callback
   projects a different prisma row shape and exportData() only needs
   key/header/format. Typing every projection precisely adds no safety
   here because the rows come straight from the fetch fns below. */
import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import type { ExportColumn } from './generic'
export type { ExportColumn } from './generic'

// PAY-004: one shared truncated-error factory — HTTP 413 with the overflow
// count so the UI can tell the accountant to narrow the export (date range,
// store) instead of silently shipping a partial file.
export function exportTruncated(remaining: number) {
  return Object.assign(
    new Error(`Export truncated: ${remaining} more rows beyond the 10000-row limit. Narrow the export (date range, store) and retry.`),
    { status: 413, code: 'EXPORT_TRUNCATED' }
  )
}

const productColumns: ExportColumn<any>[] = [
  { key: 'sku', header: 'SKU' },
  { key: 'name', header: 'Tên sản phẩm' },
  { key: 'category', header: 'Danh mục', format: (r) => r.category?.name ?? '' },
  { key: 'brand', header: 'Thương hiệu', format: (r) => r.brand?.name ?? '' },
  { key: 'author', header: 'Tác giả', format: (r) => r.author?.name ?? '' },
  { key: 'retailPrice', header: 'Giá bán (đ)', format: (r) => Number(r.retailPrice ?? 0) },
  { key: 'onHand', header: 'Tồn kho', format: (r) => r.onHand ?? 0 },
  { key: 'status', header: 'Trạng thái' },
]

const orderColumns: ExportColumn<any>[] = [
  { key: 'number', header: 'Mã đơn' },
  { key: 'channel', header: 'Kênh' },
  { key: 'status', header: 'Trạng thái' },
  { key: 'total', header: 'Tổng tiền (đ)', format: (r) => Number(r.total ?? 0) },
  { key: 'createdAt', header: 'Ngày tạo', format: (r) => new Date(r.createdAt).toLocaleDateString('vi-VN') },
  { key: 'customerName', header: 'Khách hàng', format: (r) => r.customer?.name ?? '' },
  { key: 'customerPhone', header: 'SĐT KH', format: (r) => r.customer?.phone ?? '' },
]

const inventoryColumns: ExportColumn<any>[] = [
  { key: 'sku', header: 'SKU' },
  { key: 'productName', header: 'Sản phẩm', format: (r) => r.variant?.product?.name ?? '' },
  { key: 'variantName', header: 'Biến thể', format: (r) => r.variant?.name ?? '' },
  { key: 'locationName', header: 'Vị trí', format: (r) => r.location?.name ?? '' },
  { key: 'onHand', header: 'Tồn thực tế' },
  { key: 'reserved', header: 'Đã giữ' },
  { key: 'available', header: 'Khả dụng', format: (r) => (r.onHand ?? 0) - (r.reserved ?? 0) },
  { key: 'damaged', header: 'Hỏng' },
]

const customerColumns: ExportColumn<any>[] = [
  { key: 'code', header: 'Mã KH' },
  { key: 'name', header: 'Tên khách hàng' },
  { key: 'phone', header: 'Số điện thoại' },
  { key: 'email', header: 'Email' },
  { key: 'points', header: 'Điểm tích lũy', format: (r) => r.loyalty?.points ?? 0 },
  { key: 'totalOrders', header: 'Số đơn hàng', format: (r) => r._count?.orders ?? 0 },
  { key: 'totalSpent', header: 'Tổng chi tiêu (đ)', format: (r) => Number(r._sum?.orders?.total ?? 0) },
]

const revenueColumns: ExportColumn<any>[] = [
  { key: 'date', header: 'Ngày' },
  { key: 'orders', header: 'Số đơn' },
  { key: 'revenue', header: 'Doanh thu (đ)' },
  { key: 'avgOrderValue', header: 'Giá trị TB/đơn (đ)' },
]

// Every export type requires the permission that would normally grant
// read access to the same data in the UI (audit 2026-08-30 SEC-002: the
// route previously accepted ANY authenticated account, so a cashier-tier
// user could walk out with the full cross-org customer PII base).
export const EXPORT_TYPES = {
  products: { permission: 'product.view', columns: () => productColumns, fetch: fetchProducts },
  orders: { permission: 'reports.store.view', columns: () => orderColumns, fetch: fetchOrders },
  inventory: { permission: 'inventory.view', columns: () => inventoryColumns, fetch: fetchInventory },
  customers: { permission: 'customer.view', columns: () => customerColumns, fetch: fetchCustomers },
  revenue: { permission: 'reports.financial.view', columns: () => revenueColumns, fetch: fetchRevenue },
} as const

async function fetchProducts(storeScope: string[] | null, orgId?: string | null) {
  const products = await prisma.product.findMany({
    where: {
      status: 'active',
      ...(orgId ? { orgId } : {}),
      ...(storeScope ? { variants: { some: { balances: { some: { location: { storeId: { in: storeScope } } } } } } } : {}),
    },
    include: {
      category: { select: { name: true } },
      brand: { select: { name: true } },
      author: { select: { name: true } },
      variants: {
        include: {
          prices: { where: { priceList: { kind: 'retail' } }, take: 1 },
          balances: { select: { onHand: true, reserved: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  })
  return products.flatMap((p) =>
    p.variants.filter((v) => v.active).map((v) => ({
      sku: v.sku,
      name: p.name,
      category: p.category,
      brand: p.brand,
      author: p.author,
      retailPrice: v.prices[0]?.amount ?? 0n,
      onHand: v.balances.reduce((s, b) => s + b.onHand, 0),
      status: 'active',
    }))
  )
}

async function fetchOrders(storeScope: string[] | null) {
  const orders = await prisma.order.findMany({
    where: storeScope ? { storeId: { in: storeScope } } : {},
    include: { customer: { select: { name: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  })
  const remaining = await prisma.order.count({
    where: {
      ...(storeScope ? { storeId: { in: storeScope } } : {}),
      createdAt: { lt: orders[orders.length - 1]?.createdAt ?? new Date() },
    },
  })
  if (remaining > 0) throw exportTruncated(remaining)
  return orders
}

async function fetchInventory(storeScope: string[] | null) {
  const balances = await prisma.inventoryBalance.findMany({
    where: {
      location: { active: true, ...(storeScope ? { storeId: { in: storeScope } } : {}) },
      variant: { active: true },
    },
    include: {
      variant: { include: { product: { select: { name: true } } } },
      location: { select: { name: true } },
    },
    orderBy: { onHand: 'desc' },
    take: 10000,
  })
  // PAY-004 (audit 2026-08-30): take:10000 silently truncated exports, so
  // accounting could file incomplete data without ever knowing. Each fetch
  // now counts past its last row's cursor and fails loudly instead.
  const remaining = await prisma.inventoryBalance.count({
    where: {
      location: { active: true, ...(storeScope ? { storeId: { in: storeScope } } : {}) },
      variant: { active: true },
      onHand: { lte: balances[balances.length - 1]?.onHand ?? 0 },
      id: { notIn: balances.map((b) => b.id) },
    },
  })
  if (remaining > 0) throw exportTruncated(remaining)
  return balances
}

async function fetchCustomers(_storeScope?: string[] | null, orgId?: string | null) {
  // SEC-004: Customer.orgId exists — scope the export instead of relying on
  // the permission alone. The old shape loaded up to 1000 orders PER customer
  // in one query — replaced with a single grouped aggregation over the same
  // take:10000 customer page.
  const customers = await prisma.customer.findMany({
    where: orgId ? { orgId } : {},
    select: {
      id: true, code: true, name: true, phone: true, email: true,
      loyalty: { select: { points: true } },
    },
    // Customer has no createdAt column — order by code (CUS-xxxxx) instead.
    orderBy: { code: 'asc' },
    take: 10000,
  })
  const remaining = await prisma.customer.count({
    where: { code: { gt: customers[customers.length - 1]?.code ?? '' } },
  })
  if (remaining > 0) throw exportTruncated(remaining)
  const agg = await prisma.order.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customers.map((c) => c.id) } },
    _count: { _all: true },
    _sum: { total: true },
  })
  const byCustomer = new Map(agg.map((a) => [a.customerId, a]))
  return customers.map((c) => {
    const a = byCustomer.get(c.id)
    return {
      ...c,
      _count: { orders: a?._count._all ?? 0 },
      _sum: { orders: { total: a?._sum.total ?? 0n } },
    }
  })
}

async function fetchRevenue(storeScope: string[] | null) {
  const since = new Date(Date.now() - 30 * 86_400_000)
  // Store-scope clamp mirrors fetchOrders — an unscoped caller still sees all.
  const storeFilter = storeScope ? Prisma.sql`AND "storeId" IN (${Prisma.join(storeScope)})` : Prisma.empty
  const rows = await prisma.$queryRaw<{ date: string; orders: number; revenue: number }[]>`
    SELECT DATE("createdAt") AS date, COUNT(*)::int AS orders, COALESCE(SUM(total), 0)::int AS revenue
    FROM "Order"
    WHERE "createdAt" >= ${since} AND status NOT IN ('CANCELLED')${storeFilter}
    GROUP BY DATE("createdAt")
    ORDER BY date DESC
  `
  return rows.map((r) => ({
    ...r,
    avgOrderValue: r.orders > 0 ? Math.round(r.revenue / r.orders) : 0,
  }))
}


export type ExportTypeName = keyof typeof EXPORT_TYPES;
