import { NextRequest, NextResponse } from 'next/server'
import { exportData, exportFilename } from '@/lib/exports/generic'
import { EXPORT_TYPES } from '@/lib/exports/datasets'
import { enqueueExportJob } from '@/lib/exports/async-job'
import { requirePermission, resolveStoreScope } from '@/lib/auth'
import { enforceRateLimit } from '@/lib/rate-limit'
import { apiError } from '@/lib/api'

function parseTypeFormat(searchParams: URLSearchParams) {
  const type = searchParams.get('type') as keyof typeof EXPORT_TYPES | null
  const format = (searchParams.get('format') ?? 'csv') as 'csv' | 'xlsx'
  if (!type || !(type in EXPORT_TYPES)) {
    throw Object.assign(new Error('Invalid export type'), { status: 400, code: 'VALIDATION' })
  }
  if (!['csv', 'xlsx'].includes(format)) {
    throw Object.assign(new Error('Invalid format'), { status: 400, code: 'VALIDATION' })
  }
  return { type, format }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const { type, format } = parseTypeFormat(searchParams)

    const auth = await requirePermission(EXPORT_TYPES[type].permission)

    // P1-5: the sync path builds up to 10k rows in-request — bound it per
    // user so one account can't hold workers with back-to-back exports.
    // Large/recurring exports belong on POST (async job → var/exports/).
    await enforceRateLimit("export-sync", auth.userId, 5, 60_000)

    const scope = resolveStoreScope(auth)
    const storeScope = scope === null ? null : scope

    const { columns, fetch } = EXPORT_TYPES[type]
    const data = await fetch(storeScope, auth.orgId)
    const result = await exportData(data, columns(), type, format)

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${exportFilename(type, format)}"`,
      },
    })
  } catch (error: unknown) {
    return apiError(error)
  }
}

// POST /api/export { type, format?, params? } — enqueue an async export job
// (WS2.1): large exports build in the worker and land in var/exports/.
// Returns 202 { jobId, status }. Poll GET /api/export/jobs for completion.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      type?: string
      format?: string
      params?: { storeId?: string }
    }
    const sp = new URLSearchParams({
      type: body.type ?? '',
      format: body.format ?? 'csv',
    })
    const { type, format } = parseTypeFormat(sp)
    const auth = await requirePermission(EXPORT_TYPES[type].permission)
    if (!auth.orgId) {
      throw Object.assign(new Error('Export requires an org-scoped account'), { status: 403, code: 'FORBIDDEN' })
    }
    await enforceRateLimit("export-async", auth.userId, 20, 60_000)
    const job = await enqueueExportJob({
      orgId: auth.orgId,
      requestedBy: auth.userId,
      type,
      format,
      params: { storeId: body.params?.storeId },
    })
    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 })
  } catch (error: unknown) {
    return apiError(error)
  }
}
