import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatValue } from '@/lib/format'
import type { CellValue, ChartSpec, ChatResponse, DataType } from '@/lib/types'
import { TableResult } from './table-result'

// Validated categorical slots (see styles.css); assigned in fixed order, never cycled.
const SERIES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]
const MAX_PIE_SLICES = SERIES.length

const axisProps = {
  stroke: 'var(--muted-foreground)',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const

const tooltipProps = {
  contentStyle: {
    background: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--popover-foreground)',
    fontSize: 12,
  },
  // dataKey is the column key, so year/ID-like series keep their plain format.
  formatter: (value: unknown, _name: unknown, item: { dataKey?: unknown }) =>
    formatValue(value as CellValue, 'number', String(item.dataKey ?? '')),
} as const

function chartType(
  requested: ChartSpec['type'],
  xType: DataType | undefined,
  rowCount: number,
): ChartSpec['type'] {
  // A pie with more slices than distinct colors is unreadable; show bars instead.
  if (requested === 'pie' && rowCount > MAX_PIE_SLICES) return 'bar'
  // A scatter needs a numeric x-axis. The server already converts these
  // (chat.py `_validate_chart`); this guard keeps the chart from rendering empty.
  if (requested === 'scatter' && xType !== 'number') {
    return xType === 'date' ? 'line' : 'bar'
  }
  return requested
}

export function ChartResult({ result }: { result: ChatResponse }) {
  const spec = result.chart
  if (!spec) return <TableResult result={result} />

  const columnOf = (key: string) => result.columns.find((c) => c.key === key)
  const labelOf = (key: string) => columnOf(key)?.label ?? key
  const xType = columnOf(spec.x)?.dataType
  const y = spec.y.slice(0, SERIES.length)
  const type = chartType(spec.type, xType, result.rows.length)
  const showLegend = y.length > 1
  // Axis ticks and tooltip labels use the same formatting as tables (dates, years, IDs).
  const formatX = (v: unknown) => formatValue(v as CellValue, xType, spec.x)
  const formatY = (v: unknown) => formatValue(v as CellValue, 'number', y[0])

  return (
    <figure className="space-y-2">
      {spec.title && (
        <figcaption className="text-sm font-medium">{spec.title}</figcaption>
      )}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'pie' ? (
            <PieChart>
              <Tooltip {...tooltipProps} />
              <Legend />
              <Pie
                data={result.rows}
                dataKey={y[0]}
                nameKey={spec.x}
                name={labelOf(y[0])}
                innerRadius="45%"
                stroke="var(--background)"
                strokeWidth={2}
              >
                {result.rows.map((_, i) => (
                  <Cell key={i} fill={SERIES[i]} />
                ))}
              </Pie>
            </PieChart>
          ) : type === 'line' ? (
            <LineChart
              data={result.rows}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey={spec.x} tickFormatter={formatX} {...axisProps} />
              <YAxis {...axisProps} tickFormatter={formatY} />
              <Tooltip {...tooltipProps} labelFormatter={formatX} />
              {showLegend && <Legend />}
              {y.map((key, i) => (
                <Line
                  key={key}
                  dataKey={key}
                  name={labelOf(key)}
                  stroke={SERIES[i]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  type="monotone"
                />
              ))}
            </LineChart>
          ) : type === 'scatter' ? (
            <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" />
              <XAxis
                dataKey={spec.x}
                name={labelOf(spec.x)}
                type="number"
                tickFormatter={formatX}
                {...axisProps}
              />
              <YAxis
                dataKey={y[0]}
                name={labelOf(y[0])}
                type="number"
                tickFormatter={formatY}
                {...axisProps}
              />
              <Tooltip {...tooltipProps} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter data={result.rows} fill={SERIES[0]} />
            </ScatterChart>
          ) : (
            <BarChart
              data={result.rows}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
              barGap={2}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey={spec.x} tickFormatter={formatX} {...axisProps} />
              <YAxis {...axisProps} tickFormatter={formatY} />
              <Tooltip
                {...tooltipProps}
                labelFormatter={formatX}
                cursor={{ fill: 'var(--muted)' }}
              />
              {showLegend && <Legend />}
              {y.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={labelOf(key)}
                  fill={SERIES[i]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
