import type { ChatResponse } from '@/lib/types'
import { ChartResult } from './chart-result'
import { ClarificationResult } from './clarification-result'
import { MetricResult } from './metric-result'
import { SummaryResult } from './summary-result'
import { TableResult } from './table-result'

/** Picks the result component from the server-validated display type. */
export function QueryResultRenderer({ result }: { result: ChatResponse }) {
  switch (result.display.type) {
    case 'summary':
      return <SummaryResult result={result} />
    case 'metrics':
      return <MetricResult result={result} />
    case 'table':
      return <TableResult result={result} />
    case 'chart':
      return <ChartResult result={result} />
    case 'clarification':
      return <ClarificationResult result={result} />
  }
}
