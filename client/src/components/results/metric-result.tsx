import { Card, CardContent } from '@/components/ui/card'
import { formatValue } from '@/lib/format'
import type { ChatResponse } from '@/lib/types'

export function MetricResult({ result }: { result: ChatResponse }) {
  const row = result.rows.at(0)
  if (!row) return null
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {result.columns.map((col) => (
        <Card key={col.key} size="sm" className="gap-1">
          <CardContent>
            <div className="text-xs text-muted-foreground">{col.label}</div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatValue(row[col.key], col.dataType, col.key)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
