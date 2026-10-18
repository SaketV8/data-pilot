import { formatValue } from '@/lib/format'
import type { ChatResponse } from '@/lib/types'

/** A direct answer plus the supporting figures from the single result row. */
export function SummaryResult({ result }: { result: ChatResponse }) {
  const row = result.rows.at(0)
  if (!row || result.rows.length !== 1) return null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      {result.columns.map((col) => (
        <div key={col.key} className="contents">
          <dt className="text-muted-foreground">{col.label}</dt>
          <dd className="font-medium tabular-nums">
            {formatValue(row[col.key], col.dataType, col.key)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
