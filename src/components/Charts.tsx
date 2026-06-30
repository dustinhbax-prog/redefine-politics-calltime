// Lightweight SVG chart components styled to terminal theme. No external library.

export const fmtK = (n: number): string => {
  if (n == null || isNaN(n)) return '$0'
  const a = Math.abs(n)
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export interface BarDatum  { label: string; value: number; color: string }
export interface GroupDatum { label: string; bars: { value: number; color: string; key: string }[] }

// ── Vertical bar chart ────────────────────────────────────────────────────────
export function VBarChart({ data, height = 90, showValues = false }: {
  data: BarDatum[]; height?: number; showValues?: boolean
}) {
  if (!data.length) return null
  const W = 300, PAD = 4
  const max = Math.max(...data.map(d => d.value), 1)
  const n = data.length
  const barW = Math.max(8, Math.floor((W - PAD * (n + 1)) / n))
  const step = barW + PAD

  return (
    <svg viewBox={`0 0 ${n * step + PAD} ${height + 28}`} className="w-full overflow-visible">
      {data.map((d, i) => {
        const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * height)
        const x = PAD + i * step
        return (
          <g key={i}>
            {showValues && h > 14 && (
              <text x={x + barW / 2} y={height - h + 10} textAnchor="middle" fontSize="7" fill="white" opacity={0.7}>{fmtK(d.value)}</text>
            )}
            <rect x={x} y={height - h} width={barW} height={h} fill={d.color} opacity={0.85} rx={1} />
            <text x={x + barW / 2} y={height + 12} textAnchor="middle" fontSize="8" fill="var(--color-muted)">{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Grouped bar chart (e.g. raised / spent per cycle) ────────────────────────
export function GroupedBarChart({ data, height = 90, legend }: {
  data: GroupDatum[]; height?: number; legend?: { key: string; color: string; label: string }[]
}) {
  if (!data.length) return null
  const vn = data[0].bars.length
  const max = Math.max(...data.flatMap(g => g.bars.map(b => b.value)), 1)
  const W = 320, PAD = 6
  const groupW = (W - PAD) / data.length
  const barW = Math.max(6, (groupW - PAD * (vn + 1)) / vn)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height + 28}`} className="w-full overflow-visible">
        {data.map((g, gi) => (
          <g key={gi}>
            {g.bars.map((b, bi) => {
              const h = Math.max(b.value > 0 ? 2 : 0, (b.value / max) * height)
              const x = PAD + gi * groupW + PAD + bi * (barW + 2)
              return <rect key={bi} x={x} y={height - h} width={barW} height={h} fill={b.color} opacity={0.85} rx={1} />
            })}
            <text x={PAD + gi * groupW + groupW / 2} y={height + 12} textAnchor="middle" fontSize="8" fill="var(--color-muted)">{g.label}</text>
          </g>
        ))}
      </svg>
      {legend && (
        <div className="flex gap-3 flex-wrap mt-1">
          {legend.map(l => (
            <span key={l.key} className="flex items-center gap-1 text-xs text-terminal-muted">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Horizontal ranked bar chart ───────────────────────────────────────────────
export function HBarChart({ data, maxItems = 7, labelWidth = 120 }: {
  data: BarDatum[]; maxItems?: number; labelWidth?: number
}) {
  const shown = data.slice(0, maxItems)
  if (!shown.length) return null
  const max = Math.max(...shown.map(d => d.value), 1)
  const rowH = 22, W = 320

  return (
    <svg viewBox={`0 0 ${W} ${shown.length * rowH}`} className="w-full overflow-visible">
      {shown.map((d, i) => {
        const barW = Math.max(2, ((W - labelWidth - 62) * d.value) / max)
        const y = i * rowH
        const label = d.label.length > 20 ? d.label.slice(0, 19) + '…' : d.label
        return (
          <g key={i}>
            <text x={0} y={y + 14} fontSize="8.5" fill="var(--color-text)">{label}</text>
            <rect x={labelWidth} y={y + 5} width={barW} height={11} fill={d.color} opacity={0.8} rx={1} />
            <text x={labelWidth + barW + 4} y={y + 14} fontSize="8" fill="var(--color-muted)">{fmtK(d.value)}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Donut chart ───────────────────────────────────────────────────────────────
export function DonutChart({ segments, size = 80 }: {
  segments: { value: number; color: string; label: string }[]
  size?: number
}) {
  const total = segments.reduce((s, g) => s + g.value, 0)
  if (total === 0) return null
  const cx = size / 2, cy = size / 2
  const R = size * 0.40, r = size * 0.24
  let angle = -Math.PI / 2

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {segments.filter(s => s.value > 0).map((seg, i) => {
        const frac = seg.value / total
        const startA = angle
        angle += frac * 2 * Math.PI
        const endA = angle
        const x1 = cx + R * Math.cos(startA), y1 = cy + R * Math.sin(startA)
        const x2 = cx + R * Math.cos(endA),   y2 = cy + R * Math.sin(endA)
        const ix1 = cx + r * Math.cos(endA),   iy1 = cy + r * Math.sin(endA)
        const ix2 = cx + r * Math.cos(startA), iy2 = cy + r * Math.sin(startA)
        const large = frac > 0.5 ? 1 : 0
        return (
          <path
            key={i}
            d={`M${x1},${y1} A${R},${R},0,${large},1,${x2},${y2} L${ix1},${iy1} A${r},${r},0,${large},0,${ix2},${iy2} Z`}
            fill={seg.color}
            opacity={0.88}
          />
        )
      })}
    </svg>
  )
}

// ── Stacked horizontal bar (e.g. source breakdown) ───────────────────────────
export function StackedBar({ segments, height = 14 }: {
  segments: { value: number; color: string; label: string }[]
  height?: number
}) {
  const total = segments.reduce((s, g) => s + g.value, 0)
  if (total === 0) return null
  let x = 0
  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none">
      {segments.filter(s => s.value > 0).map((s, i) => {
        const w = (s.value / total) * 100
        const rx = x
        x += w
        return <rect key={i} x={rx} y={0} width={w} height={height} fill={s.color} opacity={0.85} />
      })}
    </svg>
  )
}
