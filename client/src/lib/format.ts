import type { CellValue, DataType } from './types'

const numberFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
})

// Values between -1 and 1 keep three significant digits, so 0.0012 doesn't round to 0.
const smallNumberFormat = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 3,
})

// Years, IDs and codes are labels, not quantities: no thousands separator (2024, not 2,024).
const plainNumberFormat = new Intl.NumberFormat(undefined, {
  useGrouping: false,
  maximumFractionDigits: 2,
})
const PLAIN_NUMBER_COLUMN = /(^|_)(id|year|yr|code|zip|zipcode|pincode|phone)$/i

/**
 * Formats a cell for display. Pass the column `key` so year/ID-like columns
 * are printed without grouping.
 */
export function formatValue(
  value: CellValue | undefined,
  dataType?: DataType,
  key?: string,
): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') {
    if (key && PLAIN_NUMBER_COLUMN.test(key)) {
      return plainNumberFormat.format(value)
    }
    if (value !== 0 && Math.abs(value) < 1) {
      return smallNumberFormat.format(value)
    }
    return numberFormat.format(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') {
    if (dataType === 'date' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      // 2024-03-05T14:30:00.123456 → 2024-03-05 14:30:00
      return value.replace('T', ' ').replace(/\.\d+/, '')
    }
    return value
  }
  return JSON.stringify(value)
}
