import ExcelJS from 'exceljs'

export type ExportFormat = 'csv' | 'xlsx'

export type ExportColumn<T> = {
  key: string
  header: string
  format?: (value: T) => string | number | null
}

function cellValue<T extends Record<string, unknown>>(
  col: ExportColumn<T>,
  item: T,
): string | number {
  if (col.format) return col.format(item) ?? ''
  return ((item as Record<string, unknown>)[col.key] as string | number) ?? ''
}

/** Quote a CSV field per RFC 4180. */
function csvField(value: string | number): string {
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Export an array of data to CSV or Excel format.
 * Returns a Buffer that can be sent as a file download response.
 */
export async function exportData<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string,
  format: ExportFormat = 'csv',
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  const rows = data.map((item) => columns.map((col) => cellValue(col, item)))

  if (format === 'csv') {
    // ponytail: no BOM — add if Excel users report utf-8 mojibake
    const lines = [
      columns.map((c) => csvField(c.header)).join(','),
      ...rows.map((r) => r.map(csvField).join(',')),
    ]
    return {
      buffer: Buffer.from(lines.join('\r\n'), 'utf-8'),
      contentType: 'text/csv; charset=utf-8',
      extension: 'csv',
    }
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Data')
  ws.addRow(columns.map((c) => c.header))
  for (const r of rows) ws.addRow(r)
  // Auto-size: header length vs first 100 row values (same heuristic as old xlsx impl)
  columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = Math.max(
      col.header.length,
      ...rows.map((r) => String(r[i] ?? '').length).slice(0, 100),
    )
  })

  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  }
}

/**
 * Generate a filename with date and extension.
 */
export function exportFilename(base: string, format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10)
  return `${base}_${date}.${format}`
}
