import { useState, useRef, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import PartyBadge from '../components/PartyBadge'
import { TopBarPortal } from '../lib/topbar'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtK = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

const PARTY_FILL: Record<string, string> = {
  DEM: 'rgba(96,165,250,0.25)',
  REP: 'rgba(239,68,68,0.25)',
  SPLIT: 'rgba(167,139,250,0.25)',
}
const PARTY_STROKE: Record<string, string> = {
  DEM: '#60a5fa',
  REP: '#ef4444',
  SPLIT: '#a78bfa',
}
const CAT_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#06b6d4','#3b82f6','#8b5cf6','#ec4899',
  '#14b8a6','#f59e0b','#64748b','#a3a3a3',
]

interface Transaction {
  date: string; recipient: string; description: string
  amount: number; city: string; state: string
}
interface Donor {
  name: string; amount: number; state: string
  employer: string; occupation: string; party: string | null; date: string | null
}
interface Category { name: string; amount: number; transactions?: Transaction[] }
interface Recipient { name: string; amount: number }
interface FlowData {
  committee: { id: string; name: string; party: string; state: string; committee_type_full: string }
  donors: Donor[]
  categories: Category[]
  top_recipients: Recipient[]
  total_raised_shown: number
  total_spent: number
  transaction_count: number
  cycle: number
}
interface CommitteeOption {
  committee_id: string; name: string; party: string | null; state: string | null
}

// ── Sankey layout ─────────────────────────────────────────────────────────────

interface SankeyNode {
  key: string; label: string; amount: number
  x: number; y: number; w: number; h: number
  color: string; stroke: string
  side: 'left' | 'right' | 'center'
  catIndex?: number
  meta?: Record<string, string>
}
interface SankeyLink {
  sourceKey: string; targetKey: string
  sy0: number; sy1: number; ty0: number; ty1: number
  sx: number; tx: number; color: string; opacity: number
}

function buildSankey(
  donors: Donor[], categories: Category[],
  totalShown: number, totalSpent: number,
  svgW: number, svgH: number,
): { nodes: SankeyNode[]; links: SankeyLink[] } {
  const PAD = 40; const COL_W = 20; const GAP = 4; const flowH = svgH - PAD * 2
  const COL_X = { donor: 180, committee: svgW / 2 - 40, category: svgW - 200 }
  const nodes: SankeyNode[] = []; const links: SankeyLink[] = []
  const eTotal = Math.max(totalShown, 1); const eSpend = Math.max(totalSpent, 1)

  // Donor nodes
  const dH = donors.map(d => Math.max(20, (d.amount / eTotal) * flowH))
  const dTotalH = dH.reduce((a, b) => a + b, 0) + (donors.length - 1) * GAP
  let dy = PAD + (flowH - dTotalH) / 2
  const donorNodes: SankeyNode[] = donors.map((d, i) => {
    const h = dH[i]; const party = d.party ?? 'UNKNOWN'
    const n: SankeyNode = {
      key: `donor_${i}`, label: d.name, amount: d.amount,
      x: COL_X.donor - COL_W, y: dy, w: COL_W, h,
      color: PARTY_FILL[party] ?? 'rgba(100,100,100,0.2)',
      stroke: PARTY_STROKE[party] ?? '#555', side: 'left',
      meta: { state: d.state, employer: d.employer, occupation: d.occupation, date: d.date ?? '' },
    }
    dy += h + GAP; return n
  })
  nodes.push(...donorNodes)

  // Committee node
  const committeeH = Math.min(flowH * 0.6, Math.max(80, dTotalH * 0.6))
  const committeeY = PAD + (flowH - committeeH) / 2
  nodes.push({
    key: 'committee', label: '', amount: totalShown,
    x: COL_X.committee, y: committeeY, w: 80, h: committeeH,
    color: 'rgba(200,200,200,0.05)', stroke: '#444', side: 'center',
  })

  // Category nodes
  const cH = categories.map(c => Math.max(20, (c.amount / eSpend) * flowH))
  const cTotalH = cH.reduce((a, b) => a + b, 0) + (categories.length - 1) * GAP
  let cy2 = PAD + (flowH - cTotalH) / 2
  const catNodes: SankeyNode[] = categories.map((c, i) => {
    const h = cH[i]; const col = CAT_COLORS[i % CAT_COLORS.length]
    const n: SankeyNode = {
      key: `cat_${i}`, label: c.name, amount: c.amount,
      x: COL_X.category, y: cy2, w: COL_W, h,
      color: `${col}33`, stroke: col, side: 'right', catIndex: i,
    }
    cy2 += h + GAP; return n
  })
  nodes.push(...catNodes)

  // Donor → committee links
  let cLeft = committeeY + (committeeH - Math.min(dTotalH, committeeH)) / 2
  donorNodes.forEach((dn, i) => {
    const portH = (dn.amount / eTotal) * Math.min(dTotalH, committeeH)
    links.push({
      sourceKey: dn.key, targetKey: 'committee',
      sy0: dn.y, sy1: dn.y + dn.h, ty0: cLeft, ty1: cLeft + portH,
      sx: COL_X.donor, tx: COL_X.committee,
      color: PARTY_STROKE[donors[i].party ?? 'UNKNOWN'] ?? '#555', opacity: 0.18,
    })
    cLeft += portH + 1
  })

  // Committee → category links
  let cRight = committeeY + (committeeH - Math.min(cTotalH, committeeH)) / 2
  catNodes.forEach((cn, i) => {
    const portH = (categories[i].amount / eSpend) * Math.min(cTotalH, committeeH)
    links.push({
      sourceKey: 'committee', targetKey: cn.key,
      sy0: cRight, sy1: cRight + portH, ty0: cn.y, ty1: cn.y + cn.h,
      sx: COL_X.committee + 80, tx: COL_X.category,
      color: CAT_COLORS[i % CAT_COLORS.length], opacity: 0.2,
    })
    cRight += portH + 1
  })

  return { nodes, links }
}

function sankeyPath(sx: number, sy0: number, sy1: number, tx: number, ty0: number, ty1: number): string {
  const cx = (sx + tx) / 2
  return [
    `M ${sx} ${sy0}`, `C ${cx} ${sy0}, ${cx} ${ty0}, ${tx} ${ty0}`,
    `L ${tx} ${ty1}`, `C ${cx} ${ty1}, ${cx} ${sy1}, ${sx} ${sy1}`, 'Z',
  ].join(' ')
}

// ── Transaction drill-down panel ─────────────────────────────────────────────

function TransactionDrawer({
  category, onClose,
}: {
  category: Category & { color: string }
  onClose: () => void
}) {
  const txns = (category.transactions ?? [])
  const [sortBy, setSortBy] = useState<'amount' | 'date'>('amount')
  const sorted = [...txns].sort((a, b) =>
    sortBy === 'amount' ? b.amount - a.amount : (b.date ?? '').localeCompare(a.date ?? '')
  )
  const pct = (amt: number) => ((amt / Math.max(category.amount, 1)) * 100).toFixed(1)

  return (
    <div className="border-t border-terminal-border bg-terminal-bg flex flex-col" style={{ maxHeight: 340 }}>
      {/* Drawer header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-terminal-border flex-shrink-0">
        <span
          className="w-3 h-3 rounded-sm flex-shrink-0"
          style={{ background: category.color }}
        />
        <span className="text-terminal-accent font-bold text-xs tracking-wider flex-1">
          {category.name.toUpperCase()}
        </span>
        <span className="text-terminal-muted text-xs">{fmt(category.amount)} total</span>
        <span className="text-terminal-muted text-xs">{txns.length} transactions</span>

        {/* Sort toggle */}
        <div className="flex gap-0 border border-terminal-border ml-2">
          {(['amount', 'date'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-2 py-0.5 text-xs uppercase tracking-wider transition-colors ${sortBy === s ? 'bg-terminal-accent text-terminal-bg' : 'text-terminal-muted hover:text-terminal-text'}`}
            >
              {s === 'amount' ? '$ AMT' : 'DATE'}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="text-terminal-muted hover:text-terminal-text text-xs ml-2 leading-none px-1"
        >
          ✕
        </button>
      </div>

      {/* Transaction list */}
      <div className="flex-1 overflow-auto">
        {sorted.length === 0 ? (
          <div className="px-4 py-6 text-terminal-muted text-xs">No transaction detail available for this category.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-terminal-panel">
              <tr className="border-b border-terminal-border">
                <th className="px-3 py-1.5 text-left text-terminal-muted font-normal">DATE</th>
                <th className="px-3 py-1.5 text-left text-terminal-muted font-normal">RECIPIENT</th>
                <th className="px-3 py-1.5 text-left text-terminal-muted font-normal hidden md:table-cell">DESCRIPTION</th>
                <th className="px-3 py-1.5 text-left text-terminal-muted font-normal hidden md:table-cell">LOCATION</th>
                <th className="px-3 py-1.5 text-right text-terminal-muted font-normal">AMOUNT</th>
                <th className="px-2 py-1.5 w-20 hidden sm:table-cell" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((t, i) => (
                <tr
                  key={i}
                  className="border-b border-terminal-border hover:bg-terminal-panel transition-colors"
                >
                  <td className="px-3 py-1.5 text-terminal-muted whitespace-nowrap">
                    {t.date ? t.date.slice(0, 10) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-terminal-text font-medium">
                    {t.recipient || '—'}
                  </td>
                  <td className="px-3 py-1.5 text-terminal-muted hidden md:table-cell max-w-xs truncate">
                    {t.description || '—'}
                  </td>
                  <td className="px-3 py-1.5 text-terminal-muted hidden md:table-cell whitespace-nowrap">
                    {[t.city, t.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-1.5 text-terminal-green font-bold text-right whitespace-nowrap">
                    {fmt(t.amount)}
                  </td>
                  <td className="px-2 py-1.5 hidden sm:table-cell">
                    <div className="h-1.5 bg-terminal-border rounded overflow-hidden w-16">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${pct(t.amount)}%`,
                          background: category.color,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Sankey diagram component ──────────────────────────────────────────────────

interface TooltipState { x: number; y: number; node: SankeyNode }

function SankeyDiagram({
  data,
  selectedCat,
  onCatClick,
}: {
  data: FlowData
  selectedCat: number | null
  onCatClick: (idx: number) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const svgW = 900
  const svgH = Math.max(400, Math.max(data.donors.length, data.categories.length) * 44 + 80)

  const { nodes, links } = buildSankey(
    data.donors, data.categories,
    data.total_raised_shown, data.total_spent,
    svgW, svgH,
  )
  const nodeMap = new Map(nodes.map(n => [n.key, n]))

  const handleNodeEnter = useCallback((e: React.MouseEvent, node: SankeyNode) => {
    setHovered(node.key)
    const rect = svgRef.current?.getBoundingClientRect()
    if (rect) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, node })
  }, [])
  const handleNodeLeave = useCallback(() => { setHovered(null); setTooltip(null) }, [])

  const committeeNode = nodeMap.get('committee')!

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full"
        style={{ minWidth: 600, height: svgH, fontFamily: 'monospace' }}
      >
        {/* Links */}
        {links.map((l, i) => {
          const catKey = l.targetKey.startsWith('cat_') ? l.targetKey : l.sourceKey
          const catIdx = catKey.startsWith('cat_') ? parseInt(catKey.split('_')[1]) : -1
          const isCatSelected = selectedCat !== null && catIdx === selectedCat
          const isNodeHovered = hovered === l.sourceKey || hovered === l.targetKey
          const dimmed = selectedCat !== null && !isCatSelected
          return (
            <path
              key={i}
              d={sankeyPath(l.sx, l.sy0, l.sy1, l.tx, l.ty0, l.ty1)}
              fill={l.color}
              opacity={dimmed ? 0.04 : isNodeHovered || isCatSelected ? l.opacity * 3.5 : l.opacity}
              style={{ transition: 'opacity 0.15s' }}
            />
          )
        })}

        {/* Committee node */}
        {committeeNode && (
          <rect
            x={committeeNode.x} y={committeeNode.y}
            width={committeeNode.w} height={committeeNode.h}
            fill={committeeNode.color} stroke={committeeNode.stroke} strokeWidth={1} rx={2}
          />
        )}

        {/* Donor nodes */}
        {nodes.filter(n => n.side === 'left').map(n => (
          <g key={n.key}
            onMouseEnter={e => handleNodeEnter(e, n)}
            onMouseLeave={handleNodeLeave}
            style={{ cursor: 'default' }}
          >
            <rect
              x={n.x} y={n.y} width={n.w} height={n.h}
              fill={hovered === n.key ? n.stroke + '55' : n.color}
              stroke={n.stroke} strokeWidth={hovered === n.key ? 1.5 : 0.5}
              rx={2} style={{ transition: 'all 0.15s' }}
            />
            <text x={n.x - 8} y={n.y + n.h / 2 + 4}
              textAnchor="end" fontSize={10}
              fill={hovered === n.key ? n.stroke : '#666'}
              style={{ transition: 'fill 0.15s' }}
            >
              {n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label}
            </text>
            <text x={n.x - 8} y={n.y + n.h / 2 + 16} textAnchor="end" fontSize={9} fill="#444">
              {fmtK(n.amount)}
            </text>
          </g>
        ))}

        {/* Category nodes — clickable */}
        {nodes.filter(n => n.side === 'right').map(n => {
          const idx = n.catIndex ?? -1
          const isSelected = idx === selectedCat
          const isDimmed = selectedCat !== null && !isSelected
          return (
            <g key={n.key}
              onClick={() => idx >= 0 && onCatClick(idx)}
              onMouseEnter={e => handleNodeEnter(e, n)}
              onMouseLeave={handleNodeLeave}
              style={{ cursor: 'pointer', opacity: isDimmed ? 0.35 : 1, transition: 'opacity 0.15s' }}
            >
              {/* Click hint ring when selected */}
              {isSelected && (
                <rect
                  x={n.x - 3} y={n.y - 3}
                  width={n.w + 6} height={n.h + 6}
                  fill="none" stroke={n.stroke} strokeWidth={1.5}
                  rx={4} opacity={0.8}
                />
              )}
              <rect
                x={n.x} y={n.y} width={n.w} height={n.h}
                fill={isSelected || hovered === n.key ? n.stroke + '77' : n.color}
                stroke={n.stroke}
                strokeWidth={isSelected ? 2 : hovered === n.key ? 1.5 : 0.5}
                rx={2} style={{ transition: 'all 0.15s' }}
              />
              <text
                x={n.x + n.w + 8} y={n.y + n.h / 2 + 4}
                textAnchor="start" fontSize={10}
                fill={isSelected ? n.stroke : hovered === n.key ? n.stroke : '#666'}
                fontWeight={isSelected ? 'bold' : 'normal'}
                style={{ transition: 'fill 0.15s' }}
              >
                {n.label}
              </text>
              <text x={n.x + n.w + 8} y={n.y + n.h / 2 + 16}
                textAnchor="start" fontSize={9} fill={isSelected ? '#888' : '#444'}>
                {fmtK(n.amount)}
              </text>
              {/* "click" hint on hover */}
              {hovered === n.key && !isSelected && (
                <text x={n.x + n.w + 8} y={n.y + n.h / 2 + 28}
                  textAnchor="start" fontSize={8} fill={n.stroke} opacity={0.8}>
                  ▼ click to drill down
                </text>
              )}
            </g>
          )
        })}

        {/* Column headers */}
        <text x={160} y={22} textAnchor="end" fontSize={9} fill="#555" letterSpacing={1}>TOP DONORS</text>
        {committeeNode && (
          <>
            <text x={committeeNode.x + committeeNode.w / 2} y={committeeNode.y - 10}
              textAnchor="middle" fontSize={9} fill="#666" letterSpacing={1}>COMMITTEE</text>
            <text x={committeeNode.x + committeeNode.w / 2} y={committeeNode.y + committeeNode.h / 2 - 6}
              textAnchor="middle" fontSize={9} fill="#666">
              {data.committee.name.length > 18 ? data.committee.name.slice(0, 17) + '…' : data.committee.name}
            </text>
            <text x={committeeNode.x + committeeNode.w / 2} y={committeeNode.y + committeeNode.h / 2 + 8}
              textAnchor="middle" fontSize={8} fill="#555">{fmtK(data.total_spent)} spent</text>
          </>
        )}
        <text x={svgW - 155} y={22} textAnchor="start" fontSize={9} fill="#555" letterSpacing={1}>
          EXPENDITURES  (click to explore)
        </text>

        {/* Tooltip */}
        {tooltip && (() => {
          const n = tooltip.node
          const lines: string[] = []
          if (n.side === 'left') {
            lines.push(`${fmt(n.amount)} contributed`)
            if (n.meta?.state) lines.push(`State: ${n.meta.state}`)
            if (n.meta?.employer) lines.push(`Employer: ${n.meta.employer.slice(0, 30)}`)
            if (n.meta?.occupation) lines.push(`Occupation: ${n.meta.occupation.slice(0, 30)}`)
            if (n.meta?.date) lines.push(`Date: ${n.meta.date}`)
          } else if (n.side === 'right') {
            lines.push(`${fmt(n.amount)} in expenditures`)
            lines.push(`${((n.amount / Math.max(data.total_spent, 1)) * 100).toFixed(1)}% of total spending`)
            const count = (data.categories[n.catIndex ?? 0]?.transactions ?? []).length
            lines.push(`${count} transaction${count !== 1 ? 's' : ''} — click to view`)
          }
          const bw = 210; const bh = lines.length * 16 + 20
          let bx = tooltip.x + 12; let by = tooltip.y - bh / 2
          if (bx + bw > svgW - 10) bx = tooltip.x - bw - 12
          if (by < 0) by = 4
          return (
            <g pointerEvents="none">
              <rect x={bx} y={by} width={bw} height={bh} rx={3}
                fill="#1a1a1a" stroke="#333" strokeWidth={1} />
              <text x={bx + 8} y={by + 14} fontSize={10} fontWeight="bold"
                fill={n.side === 'left' ? (PARTY_STROKE[n.meta?.party ?? ''] ?? '#aaa') : n.stroke}>
                {n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label}
              </text>
              {lines.map((l, i) => (
                <text key={i} x={bx + 8} y={by + 28 + i * 15} fontSize={9} fill="#999">{l}</text>
              ))}
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MoneyFlowPage() {
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<CommitteeOption[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<CommitteeOption | null>(null)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<FlowData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cycle, setCycle] = useState(2024)
  const [activeTab, setActiveTab] = useState<'flow' | 'recipients'>('flow')
  const [controlsOpen, setControlsOpen] = useState(false)
  const [selectedCat, setSelectedCat] = useState<number | null>(null)

  // Auto-load if committee_id passed as query param
  useEffect(() => {
    const cid = searchParams.get('committee_id')
    if (!cid) return
    setLoading(true); setError(null); setData(null)
    fetch(`/api/network/flow?committee_id=${cid}&cycle=2024`)
      .then(r => r.ok ? r.json() : Promise.reject(`API ${r.status}`))
      .then((d: FlowData) => {
        setSearch(d.committee.name)
        setSelected({ committee_id: cid, name: d.committee.name, party: d.committee.party || null, state: d.committee.state || null })
        setData(d)
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const searchCommittees = async () => {
    if (!search.trim()) return
    setSearching(true)
    try {
      const sp = new URLSearchParams({ q: search, per_page: '15' })
      const res = await fetch(`/api/committees/?${sp}`)
      const d = await res.json()
      setResults(d.results ?? [])
      setShowDropdown(true)
    } finally {
      setSearching(false)
    }
  }

  const selectCommittee = (c: CommitteeOption) => {
    setSelected(c); setSearch(c.name); setShowDropdown(false); setResults([])
  }

  const loadFlow = async (c: CommitteeOption = selected!, cycleVal = cycle) => {
    if (!c) return
    setLoading(true); setError(null); setData(null); setSelectedCat(null)
    try {
      const sp = new URLSearchParams({ committee_id: c.committee_id, cycle: String(cycleVal) })
      const res = await fetch(`/api/network/flow?${sp}`)
      if (!res.ok) throw new Error(`API ${res.status}`)
      const d: FlowData = await res.json()
      if (!d.donors.length && !d.categories.length) throw new Error('No flow data found for this committee/cycle.')
      setData(d)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleCatClick = (idx: number) => {
    setSelectedCat(prev => prev === idx ? null : idx)
    setActiveTab('flow')
  }

  const activeCat = selectedCat !== null && data
    ? { ...data.categories[selectedCat], color: CAT_COLORS[selectedCat % CAT_COLORS.length] }
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBarPortal>
      {/* Header / controls */}
      <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-terminal-accent text-xs font-bold tracking-widest">MONEY FLOW TRACER</div>
            <div className="text-terminal-muted text-xs mt-0.5">
              Trace donations from contributors → committee → expenditure categories
            </div>
          </div>
          <button
            className="md:hidden text-terminal-accent text-xs uppercase tracking-wider flex items-center gap-1"
            onClick={() => setControlsOpen(v => !v)}
          >
            SEARCH {controlsOpen ? '▲' : '▼'}
          </button>
        </div>

        <div className={`md:block ${controlsOpen ? 'block' : 'hidden'}`}>
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-60 relative">
              <label className="label">Committee / PAC Name</label>
              <input
                className="input-field"
                value={search}
                onChange={e => { setSearch(e.target.value); setShowDropdown(false) }}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchCommittees())}
                placeholder="Search by name…"
              />
              {showDropdown && results.length > 0 && (
                <div className="absolute top-full left-0 z-50 bg-terminal-panel border border-terminal-border shadow-xl w-full max-h-56 overflow-auto">
                  {results.map(c => (
                    <button
                      key={c.committee_id}
                      onClick={() => selectCommittee(c)}
                      className="w-full text-left px-3 py-2 hover:bg-terminal-bg border-b border-terminal-border flex items-center gap-2 text-xs"
                    >
                      <PartyBadge party={c.party as 'DEM' | 'REP' | null} />
                      <span className="text-terminal-accent flex-1">{c.name}</span>
                      <span className="text-terminal-muted">{c.state}</span>
                    </button>
                  ))}
                  <button onClick={() => setShowDropdown(false)} className="w-full text-center py-1 text-terminal-muted text-xs hover:text-terminal-text">✕ close</button>
                </div>
              )}
            </div>
            <div className="w-28">
              <label className="label">Cycle</label>
              <select className="input-field" value={cycle} onChange={e => setCycle(Number(e.target.value))}>
                {[2024, 2022, 2020, 2018].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={searchCommittees} disabled={searching} className="btn-primary">
              {searching ? '…' : 'FIND'}
            </button>
            <button onClick={() => loadFlow(selected!, cycle)} disabled={!selected || loading} className="btn-primary">
              {loading ? 'LOADING…' : 'TRACE FLOW'}
            </button>
          </div>
          <div className="mt-2 text-terminal-muted text-xs leading-relaxed">
            <span className="text-yellow-600 font-bold">SIMULATED ATTRIBUTION</span>
            {' — '}Spending apportioned proportionally by donor share.
            Click any expenditure category to drill into its individual transactions.
          </div>
        </div>
      </div>
      </TopBarPortal>

      {/* Body */}
      <div className="flex-1 overflow-auto flex flex-col">
        {error && <div className="px-4 py-3 text-red-400 text-xs">{error}</div>}

        {!data && !loading && !error && (
          <div className="flex items-center justify-center flex-1 text-terminal-muted text-xs text-center px-8">
            <div>
              <div className="text-2xl mb-3">⟳</div>
              <div className="tracking-wider mb-2">SEARCH A COMMITTEE ABOVE TO BEGIN</div>
              <div className="text-terminal-border leading-relaxed max-w-sm">
                Select any PAC, campaign committee, or party organization.
                The diagram shows who funded it and how the money was spent.
                Click any expenditure category to see line-item transactions.
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center flex-1 text-terminal-accent text-xs animate-pulse">
            LOADING FLOW DATA…
          </div>
        )}

        {data && (
          <>
            {/* Summary bar + tabs */}
            <div className="px-4 py-2 border-b border-terminal-border bg-terminal-panel flex-shrink-0 flex items-center gap-4 flex-wrap text-xs">
              <div className="flex items-center gap-2">
                <PartyBadge party={data.committee.party as 'DEM' | 'REP' | null} />
                <span className="text-terminal-accent font-bold">{data.committee.name}</span>
              </div>
              <span className="text-terminal-muted hidden sm:inline">{data.committee.committee_type_full}</span>
              <span>
                <span className="text-terminal-muted">Cycle:</span>{' '}
                <span className="text-terminal-text">{data.cycle}</span>
              </span>
              <span>
                <span className="text-terminal-muted">Donors shown:</span>{' '}
                <span className="text-terminal-text">{data.donors.length}</span>
                <span className="text-terminal-muted ml-1">· {fmt(data.total_raised_shown)}</span>
              </span>
              <span>
                <span className="text-terminal-muted">Spent:</span>{' '}
                <span className="text-terminal-text">{fmt(data.total_spent)}</span>
                <span className="text-terminal-muted ml-1">({data.transaction_count} txns)</span>
              </span>
              {selectedCat !== null && (
                <button
                  onClick={() => setSelectedCat(null)}
                  className="text-xs text-terminal-muted hover:text-terminal-text ml-auto border border-terminal-border px-2 py-0.5"
                >
                  ✕ clear selection
                </button>
              )}
              <div className="flex gap-0 border border-terminal-border ml-auto">
                {(['flow', 'recipients'] as const).map(t => (
                  <button key={t} onClick={() => setActiveTab(t)}
                    className={`px-3 py-0.5 text-xs uppercase tracking-wider ${activeTab === t ? 'bg-terminal-accent text-terminal-bg font-bold' : 'text-terminal-muted hover:text-terminal-text'}`}
                  >
                    {t === 'flow' ? 'FLOW DIAGRAM' : 'TOP PAYEES'}
                  </button>
                ))}
              </div>
            </div>

            {/* Category legend strip */}
            {activeTab === 'flow' && data.categories.length > 0 && (
              <div className="px-4 py-2 border-b border-terminal-border bg-terminal-panel flex-shrink-0 flex flex-wrap gap-1.5">
                {data.categories.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => handleCatClick(i)}
                    className={`flex items-center gap-1 px-2 py-0.5 text-xs border transition-all ${
                      selectedCat === i
                        ? 'border-current text-terminal-text'
                        : 'border-terminal-border text-terminal-muted hover:border-current hover:text-terminal-text'
                    }`}
                    style={{ color: selectedCat === i ? CAT_COLORS[i % CAT_COLORS.length] : undefined }}
                  >
                    <span
                      className="w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}
                    />
                    {c.name}
                    <span className="text-terminal-muted ml-1">{fmtK(c.amount)}</span>
                  </button>
                ))}
                <span className="text-terminal-muted text-xs self-center ml-1">← click to drill down</span>
              </div>
            )}

            {activeTab === 'flow' && (
              <div className="flex-1 overflow-auto">
                {data.donors.length === 0 ? (
                  <div className="text-terminal-muted text-xs px-4 py-6">
                    No donor contributions found for {data.cycle}. Try a different cycle.
                  </div>
                ) : (
                  <div className="p-4">
                    <SankeyDiagram
                      data={data}
                      selectedCat={selectedCat}
                      onCatClick={handleCatClick}
                    />
                  </div>
                )}

                {/* Legend */}
                <div className="mx-4 mb-4 border border-terminal-border p-3 text-xs text-terminal-muted space-y-1 max-w-2xl">
                  <div className="text-terminal-accent font-bold uppercase tracking-wider mb-1">How to read this diagram</div>
                  <div><span className="text-blue-400">Blue</span> = Democratic-leaning donors &nbsp;·&nbsp; <span className="text-red-400">Red</span> = Republican-leaning &nbsp;·&nbsp; <span className="text-purple-400">Purple</span> = Split/unknown</div>
                  <div>Path width = relative contribution size. Click any right-side category bar or legend chip to see individual transactions.</div>
                  <div className="text-yellow-600">Spending attribution is simulated — proportional estimates, not actual tracked transactions.</div>
                </div>
              </div>
            )}

            {/* Transaction drill-down drawer — shown below diagram when a category is selected */}
            {activeTab === 'flow' && activeCat && (
              <div className="flex-shrink-0">
                <TransactionDrawer
                  category={activeCat}
                  onClose={() => setSelectedCat(null)}
                />
              </div>
            )}

            {activeTab === 'recipients' && (
              <div className="flex-1 overflow-auto p-4">
                <div className="max-w-lg">
                  <div className="text-terminal-muted text-xs uppercase tracking-wider mb-3">
                    Top Payees — {data.cycle} disbursements
                  </div>
                  {data.top_recipients.length === 0 ? (
                    <div className="text-terminal-muted text-xs">No disbursement data available.</div>
                  ) : (
                    <div className="space-y-2">
                      {data.top_recipients.map((r, i) => {
                        const pct = (r.amount / Math.max(data.total_spent, 1)) * 100
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-terminal-muted text-xs w-4 flex-shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between text-xs mb-0.5">
                                <span className="text-terminal-text truncate">{r.name}</span>
                                <span className="text-terminal-green font-bold ml-2 flex-shrink-0">{fmt(r.amount)}</span>
                              </div>
                              <div className="h-1 bg-terminal-border rounded overflow-hidden">
                                <div className="h-full bg-terminal-accent rounded" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <span className="text-terminal-muted text-xs w-10 text-right">{pct.toFixed(1)}%</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
