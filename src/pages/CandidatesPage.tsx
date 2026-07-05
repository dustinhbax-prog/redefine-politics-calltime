import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { fecApi, Candidate, CandidateProfile, logExport } from '../api/fec'
import PartyBadge from '../components/PartyBadge'
import { TopBarPortal } from '../lib/topbar'

const fmt = (n?: number) => n == null
  ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const OFFICES  = [{ value: '', label: 'All Offices' }, { value: 'H', label: 'House' }, { value: 'S', label: 'Senate' }, { value: 'P', label: 'President' }]
const PARTIES  = [{ value: '', label: 'All Parties' }, { value: 'DEM', label: 'Democrat' }, { value: 'REP', label: 'Republican' }]
const CYCLES   = [{ value: '', label: 'All Cycles' }, { value: '2026', label: '2026' }, { value: '2024', label: '2024' }, { value: '2022', label: '2022' }, { value: '2020', label: '2020' }, { value: '2018', label: '2018' }]

type SortKey = 'name' | 'state' | 'receipts' | 'disbursements' | 'cash'
type SortDir = 'asc' | 'desc'

function SortHeader({ label, col, sort, onSort }: { label: string; col: SortKey; sort: { key: SortKey; dir: SortDir }; onSort: (k: SortKey) => void }) {
  const active = sort.key === col
  return (
    <th
      onClick={() => onSort(col)}
      className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal cursor-pointer hover:text-terminal-text select-none whitespace-nowrap"
    >
      {label} {active ? (sort.dir === 'asc' ? '↑' : '↓') : <span className="opacity-20">↕</span>}
    </th>
  )
}

const fmtK = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

interface DonutSegment { key: string; label: string; value: number; color: string; sub?: string }

function InteractiveDonut({ segments, title }: { segments: DonutSegment[]; title?: string }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; seg: DonutSegment } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const total = segments.reduce((s, g) => s + g.value, 0)
  if (total === 0) return null

  const SIZE = 110, cx = SIZE / 2, cy = SIZE / 2, R = SIZE * 0.42, r = SIZE * 0.25
  let angle = -Math.PI / 2
  const paths = segments.map(seg => {
    const frac = seg.value / total
    const startA = angle; angle += frac * 2 * Math.PI; const endA = angle
    const midA = (startA + endA) / 2
    const isHot = hovered === seg.key || selected === seg.key
    const push = isHot ? 5 : 0
    const ox = push * Math.cos(midA), oy = push * Math.sin(midA)
    const x1 = cx + ox + R * Math.cos(startA), y1 = cy + oy + R * Math.sin(startA)
    const x2 = cx + ox + R * Math.cos(endA),   y2 = cy + oy + R * Math.sin(endA)
    const ix1 = cx + ox + r * Math.cos(endA),  iy1 = cy + oy + r * Math.sin(endA)
    const ix2 = cx + ox + r * Math.cos(startA),iy2 = cy + oy + r * Math.sin(startA)
    const large = frac > 0.5 ? 1 : 0
    return { seg, isHot, d: `M${x1},${y1} A${R},${R},0,${large},1,${x2},${y2} L${ix1},${iy1} A${r},${r},0,${large},0,${ix2},${iy2} Z` }
  })
  const active = segments.find(s => s.key === (selected || hovered))

  return (
    <div className="flex items-start gap-4">
      {title && <div className="text-terminal-muted text-xs uppercase tracking-wider mb-2">{title}</div>}
      <div className="relative flex-shrink-0" style={{ width: SIZE + 12, height: SIZE + 12 }}>
        <svg ref={svgRef} viewBox={`-6 -6 ${SIZE + 12} ${SIZE + 12}`} width={SIZE + 12} height={SIZE + 12}>
          {paths.map(({ seg, d, isHot }) => (
            <path key={seg.key} d={d} fill={seg.color}
              opacity={selected && selected !== seg.key ? 0.2 : isHot ? 1 : 0.82}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
              onClick={() => setSelected(s => s === seg.key ? null : seg.key)}
              onMouseEnter={() => setHovered(seg.key)}
              onMouseLeave={() => { setHovered(null); setTooltip(null) }}
              onMouseMove={e => { const rect = svgRef.current?.getBoundingClientRect(); if (rect) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10, seg }) }}
            />
          ))}
          {!active ? (
            <>
              <text x={cx} y={cy - 4} textAnchor="middle" fontSize="8" fill="var(--color-muted)" fontFamily="inherit">HOVER</text>
              <text x={cx} y={cy + 6} textAnchor="middle" fontSize="8" fill="var(--color-muted)" fontFamily="inherit">TO VIEW</text>
            </>
          ) : (
            <>
              <text x={cx} y={cy - 3} textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--color-text)" fontFamily="inherit">{fmtK(active.value)}</text>
              <text x={cx} y={cy + 9} textAnchor="middle" fontSize="7.5" fill="var(--color-muted)" fontFamily="inherit">{Math.round((active.value / total) * 100)}%</text>
            </>
          )}
        </svg>
        {tooltip && (
          <div className="absolute z-20 pointer-events-none bg-terminal-panel border border-terminal-border text-xs px-2.5 py-1.5 shadow-lg"
            style={{ left: tooltip.x + 8, top: tooltip.y, transform: 'translateY(-100%)', maxWidth: 200 }}>
            <div className="text-terminal-text font-bold mb-0.5">{tooltip.seg.label}</div>
            {tooltip.seg.sub && <div className="text-terminal-muted text-xs mb-0.5">{tooltip.seg.sub}</div>}
            <div className="text-terminal-green font-bold">{fmt(tooltip.seg.value)}</div>
            <div className="text-terminal-muted">{Math.round((tooltip.seg.value / total) * 100)}% of total</div>
          </div>
        )}
      </div>
      {/* Legend */}
      <div className="flex flex-col gap-1.5 justify-center py-1">
        {segments.map(seg => (
          <button key={seg.key} onClick={() => setSelected(s => s === seg.key ? null : seg.key)}
            className={`flex items-center gap-1.5 text-xs text-left transition-opacity ${selected && selected !== seg.key ? 'opacity-30' : ''}`}>
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-terminal-text">{seg.label}</span>
            <span className="text-terminal-muted ml-1">{fmtK(seg.value)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface SpendingData {
  total: number
  categories: { name: string; amount: number }[]
  top_recipients: { name: string; amount: number }[]
  transaction_count: number
}

const SPEND_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#64748b','#a3a3a3']

function CandidateSpending({ committeeId }: { committeeId: string }) {
  const [spending, setSpending] = useState<SpendingData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fecApi.committeeSpending(committeeId)
      .then(setSpending)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [committeeId])

  if (loading) return <div className="px-4 py-3 text-terminal-accent text-xs animate-pulse">LOADING SPENDING…</div>
  if (!spending || spending.categories.length === 0) return <div className="px-4 py-3 text-terminal-muted text-xs">No spending data available.</div>

  const segments: DonutSegment[] = spending.categories.map((c, i) => ({
    key: c.name, label: c.name, value: c.amount, color: SPEND_COLORS[i % SPEND_COLORS.length],
  }))

  return (
    <div className="flex gap-0 divide-x divide-terminal-border">
      <div className="px-4 py-3">
        <div className="text-terminal-muted text-xs uppercase tracking-wider mb-3">
          Spending by Category · <span className="text-terminal-red">{fmt(spending.total)}</span> total · {spending.transaction_count} transactions
        </div>
        <InteractiveDonut segments={segments} />
      </div>
      <div className="w-60 flex-shrink-0 px-4 py-3">
        <div className="text-terminal-muted text-xs uppercase tracking-wider mb-3">Top Recipients</div>
        <div className="space-y-1">
          {spending.top_recipients.map((r, i) => (
            <div key={i} className="flex justify-between text-xs gap-2">
              <span className="text-terminal-text truncate flex-1">{r.name}</span>
              <span className="text-terminal-red flex-shrink-0">{fmt(r.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ProfilePanel({ candidate, onClose }: { candidate: Candidate; onClose: () => void; onSearchDonors: (name: string) => void }) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<CandidateProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'financials' | 'spending'>('financials')

  useEffect(() => {
    fecApi.candidateProfile(candidate.candidate_id)
      .then(setProfile)
      .catch(() => setProfile({ totals: [], committees: [] }))
      .finally(() => setLoading(false))
  }, [candidate.candidate_id])

  const primaryCommitteeId = profile?.committees?.[0]?.committee_id

  return (
    <tr className="border-b-2 border-terminal-accent">
      <td colSpan={10} className="p-0">
        <div className="bg-terminal-bg border-t border-terminal-border">
          <div className="px-4 py-2 flex items-center gap-3 border-b border-terminal-border flex-wrap">
            <span className="text-terminal-accent text-xs font-bold uppercase tracking-wider flex-1">{candidate.name}</span>
            {/* Tab toggle */}
            <div className="flex border border-terminal-border">
              {(['financials', 'spending'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-0.5 text-xs uppercase tracking-wider transition-colors ${tab === t ? 'bg-terminal-accent text-white' : 'text-terminal-muted hover:text-terminal-text'}`}>
                  {t === 'financials' ? 'FINANCIALS' : 'SPENDING'}
                </button>
              ))}
            </div>
            <button
              onClick={() => navigate(`/donors?contributor_name=${encodeURIComponent(candidate.name)}`)}
              className="text-xs uppercase tracking-wider px-2 py-0.5 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent transition-colors"
            >
              Search Donors →
            </button>
            <button onClick={onClose} className="text-terminal-muted hover:text-terminal-text text-xs">✕ CLOSE</button>
          </div>

          {loading && <div className="px-4 py-3 text-terminal-accent text-xs animate-pulse">LOADING…</div>}

          {!loading && profile && tab === 'financials' && (
            <div className="flex gap-0 divide-x divide-terminal-border">
              {/* Financial summary */}
              <div className="px-4 py-3 flex-1 min-w-0">
                <div className="text-terminal-muted text-xs uppercase tracking-wider mb-2">Financials by Cycle</div>
                {profile.totals.length === 0 && <div className="text-terminal-muted text-xs">No financial data available</div>}

                {profile.totals.length > 0 && (() => {
                  const latest = profile.totals[0]
                  const itemized = latest.individual_itemized_contributions ?? 0
                  const pac = latest.other_political_committee_contributions ?? 0
                  const other = Math.max(0, (latest.receipts ?? 0) - itemized - pac)
                  const sourceSegs: DonutSegment[] = [
                    { key: 'indiv', label: 'Itemized Indiv.', value: itemized, color: '#3b82f6' },
                    { key: 'pac',   label: 'PAC / Party',     value: pac,      color: '#C8102E' },
                    { key: 'other', label: 'Other',           value: other,    color: '#4b5563' },
                  ].filter(s => s.value > 0)

                  const cycleSegs: DonutSegment[] = profile.totals.map((t, i) => ({
                    key: String(t.cycle),
                    label: String(t.cycle),
                    value: t.receipts ?? 0,
                    color: ['#22c55e','#3b82f6','#f59e0b','#8b5cf6','#06b6d4','#ec4899'][i % 6],
                    sub: `Spent ${fmt(t.disbursements)}`,
                  })).filter(s => s.value > 0)

                  return (
                    <div className="flex gap-6 mb-4 flex-wrap">
                      {sourceSegs.length > 1 && (
                        <div>
                          <div className="text-terminal-muted text-xs uppercase tracking-wider mb-2">Source Mix · {latest.cycle}</div>
                          <InteractiveDonut segments={sourceSegs} />
                        </div>
                      )}
                      {cycleSegs.length > 1 && (
                        <div>
                          <div className="text-terminal-muted text-xs uppercase tracking-wider mb-2">Raised by Cycle</div>
                          <InteractiveDonut segments={cycleSegs} />
                        </div>
                      )}
                    </div>
                  )
                })()}

                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {['Cycle','Raised','Spent','Cash on Hand','Itemized Indiv.','PAC/Party'].map(h => (
                        <th key={h} className="text-left text-terminal-muted font-normal pb-1 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profile.totals.map(t => (
                      <tr key={t.cycle} className="border-t border-terminal-border">
                        <td className="py-1 pr-4 text-terminal-muted">{t.cycle}</td>
                        <td className="py-1 pr-4 text-terminal-green font-bold">{fmt(t.receipts)}</td>
                        <td className="py-1 pr-4 text-terminal-red">{fmt(t.disbursements)}</td>
                        <td className="py-1 pr-4 text-terminal-text">{fmt(Number(t.cash_on_hand_end_period))}</td>
                        <td className="py-1 pr-4 text-terminal-text">{fmt(t.individual_itemized_contributions)}</td>
                        <td className="py-1 pr-4 text-terminal-text">{fmt(t.other_political_committee_contributions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Affiliated committees */}
              <div className="px-4 py-3 w-80 flex-shrink-0">
                <div className="text-terminal-muted text-xs uppercase tracking-wider mb-2">Affiliated Committees</div>
                {profile.committees.length === 0 && <div className="text-terminal-muted text-xs">None found</div>}
                {profile.committees.map(c => (
                  <div key={c.committee_id} className="flex items-start gap-2 py-1 border-t border-terminal-border first:border-0">
                    <span className={`text-xs flex-shrink-0 ${c.party === 'DEM' ? 'text-terminal-blue' : c.party === 'REP' ? 'text-terminal-red' : 'text-terminal-muted'}`}>
                      {c.party || '—'}
                    </span>
                    <div className="min-w-0">
                      <div className="text-terminal-text text-xs truncate">{c.name}</div>
                      <div className="text-terminal-muted text-xs">{c.committee_id} · {c.committee_type_full || c.committee_type}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && tab === 'spending' && (
            primaryCommitteeId
              ? <CandidateSpending committeeId={primaryCommitteeId} />
              : <div className="px-4 py-3 text-terminal-muted text-xs">No committee found to pull spending from.</div>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function CandidatesPage() {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [form, setForm] = useState({ q: '', state: '', office: '', party: '', cycle: '', district: '' })
  const [rows, setRows] = useState<Candidate[]>([])
  const [count, setCount] = useState<number | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'receipts', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  const navigate = useNavigate()

  const doSearch = useCallback(async (f: typeof form, randomize = false, targetPage = 1, targetPerPage = 50) => {
    setExpanded(null)
    setLoading(true)
    setError(null)
    setPage(targetPage)
    try {
      const isEmpty = !f.q && !f.state && !f.office && !f.party && !f.cycle && !f.district
      const res = await fecApi.candidates({
        ...f,
        cycle: f.cycle ? Number(f.cycle) : undefined,
        per_page: targetPerPage,
        page: targetPage,
        randomize: randomize || isEmpty,
      })
      setRows(res.results)
      setCount(res.pagination.count)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const search = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    doSearch(form, false, 1, perPage)
  }, [form, doSearch, perPage])

  useEffect(() => { doSearch(form, true, 1, perPage) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const toggleSort = (key: SortKey) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })

  const sorted = [...rows].sort((a, b) => {
    let av: string | number = 0, bv: string | number = 0
    if (sort.key === 'name')          { av = a.name; bv = b.name }
    else if (sort.key === 'state')    { av = a.state; bv = b.state }
    else if (sort.key === 'receipts') { av = a.receipts ?? 0; bv = b.receipts ?? 0 }
    else if (sort.key === 'disbursements') { av = a.disbursements ?? 0; bv = b.disbursements ?? 0 }
    else if (sort.key === 'cash')     { av = a.cash_on_hand_end_period ?? 0; bv = b.cash_on_hand_end_period ?? 0 }
    if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
    return sort.dir === 'asc' ? av - (bv as number) : (bv as number) - av
  })

  const exportCsv = () => {
    const headers = ['ID','Name','State','Office','District','Party','Status','Raised','Spent','Cash','Cycles']
    const csvRows = sorted.map(r => [
      r.candidate_id, r.name, r.state, r.office_full || r.office,
      r.district || '', r.party_full || r.party, r.incumbent_challenge_full || '',
      r.receipts ?? '', r.disbursements ?? '', r.cash_on_hand_end_period ?? '',
      (r.election_years || r.cycles || []).slice(-4).join(' '),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'candidates.csv'; a.click()
    logExport('candidates', 'candidate-search', sorted.length)
  }

  return (
    <div className="flex flex-col h-full">
      <TopBarPortal>
      <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel">
        <div className="text-terminal-accent text-xs font-bold tracking-widest mb-3">CANDIDATE SEARCH — FEC (ALL FEDERAL)</div>
        <button
          className="md:hidden w-full text-left py-3 text-terminal-accent text-xs uppercase tracking-wider flex items-center justify-between"
          onClick={() => setFiltersOpen(v => !v)}
        >
          FILTERS <span>{filtersOpen ? '▲' : '▼'}</span>
        </button>
        <div className={`md:block ${filtersOpen ? 'block' : 'hidden'}`}>
        <form onSubmit={search} className="flex gap-2 items-end flex-col md:flex-row md:flex-wrap">
          <div className="w-full md:w-auto md:flex-1 md:min-w-36">
            <label className="label">Name</label>
            <input className="input-field" value={form.q} onChange={set('q')} placeholder="Search name…" />
          </div>
          <div className="w-full md:w-16">
            <label className="label">State</label>
            <input className="input-field" value={form.state} onChange={set('state')} placeholder="All" maxLength={2} />
          </div>
          <div className="w-full md:w-16">
            <label className="label">Dist.</label>
            <input className="input-field" value={form.district} onChange={set('district')} placeholder="—" maxLength={4} />
          </div>
          <div className="w-full md:w-32">
            <label className="label">Office</label>
            <select className="input-field" value={form.office} onChange={set('office')}>
              {OFFICES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="w-full md:w-32">
            <label className="label">Party</label>
            <select className="input-field" value={form.party} onChange={set('party')}>
              {PARTIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="w-full md:w-28">
            <label className="label">Cycle</label>
            <select className="input-field" value={form.cycle} onChange={set('cycle')}>
              {CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-primary py-3 md:py-1" disabled={loading}>SEARCH</button>
          {rows.length > 0 && (
            <button type="button" onClick={exportCsv} className="btn-ghost py-3 md:py-1">CSV</button>
          )}
        </form>
        </div>
      </div>
      </TopBarPortal>

      <div className="px-4 py-1 border-b border-terminal-border flex items-center gap-4 text-terminal-muted text-xs bg-terminal-panel flex-wrap">
        {loading && <span className="text-terminal-accent animate-pulse">LOADING…</span>}
        {!loading && count !== undefined && <span>{count.toLocaleString()} RESULTS</span>}
        {!loading && rows.length > 0 && <span className="text-terminal-muted">· showing {sorted.length} · click name to expand profile</span>}
        {error && <span className="text-red-400">{error}</span>}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-terminal-border">per page:</span>
            {[25, 50, 100].map(n => (
              <button key={n} onClick={() => { setPerPage(n); doSearch(form, false, 1, n) }}
                className={`px-1.5 py-0.5 border transition-colors ${perPage === n ? 'border-terminal-accent text-terminal-accent' : 'border-terminal-border text-terminal-border hover:border-terminal-muted hover:text-terminal-muted'}`}>
                {n}
              </button>
            ))}
          </div>
          <button disabled={page <= 1 || loading} onClick={() => doSearch(form, false, page - 1, perPage)}
            className="px-2 py-0.5 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            ‹ Prev
          </button>
          <span className="px-2 text-terminal-muted">pg {page}</span>
          <button disabled={rows.length < perPage || loading} onClick={() => doSearch(form, false, page + 1, perPage)}
            className="px-2 py-0.5 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            Next ›
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed', minWidth: 900 }}>
          <thead className="sticky top-0 bg-terminal-panel z-10">
            <tr>
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-10">Party</th>
              <SortHeader label="Name"   col="name"          sort={sort} onSort={toggleSort} />
              <SortHeader label="State"  col="state"         sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-16">Dist.</th>
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-24">Office</th>
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-24">Status</th>
              <SortHeader label="Raised" col="receipts"      sort={sort} onSort={toggleSort} />
              <SortHeader label="Spent"  col="disbursements" sort={sort} onSort={toggleSort} />
              <SortHeader label="Cash"   col="cash"          sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-28">Cycles</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const isOpen = expanded === row.candidate_id
              return (
                <>
                  <tr
                    key={row.candidate_id}
                    className={`border-b border-terminal-border transition-colors ${isOpen ? 'bg-terminal-panel' : i % 2 === 0 ? '' : 'bg-white/[0.04]'} hover:bg-white/30`}
                  >
                    <td className="px-3 py-1.5">
                      <PartyBadge party={row.party === 'DEM' ? 'DEM' : row.party === 'REP' ? 'REP' : null} />
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        onClick={() => setExpanded(prev => prev === row.candidate_id ? null : row.candidate_id)}
                        className="text-terminal-accent hover:underline text-left flex items-center gap-1"
                      >
                        <span className={`text-terminal-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                        {row.name}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-terminal-text">{row.state || '—'}</td>
                    <td className="px-3 py-1.5 text-terminal-muted">{row.district || '—'}</td>
                    <td className="px-3 py-1.5 text-terminal-text">{row.office_full || row.office || '—'}</td>
                    <td className="px-3 py-1.5 text-terminal-muted">{row.incumbent_challenge_full || '—'}</td>
                    <td className="px-3 py-1.5 text-terminal-green font-bold">{fmt(row.receipts)}</td>
                    <td className="px-3 py-1.5 text-terminal-red">{fmt(row.disbursements)}</td>
                    <td className="px-3 py-1.5 text-terminal-text">{fmt(row.cash_on_hand_end_period)}</td>
                    <td className="px-3 py-1.5 text-terminal-muted">{(row.election_years || row.cycles || []).slice(-4).join(' · ')}</td>
                  </tr>
                  {isOpen && (
                    <ProfilePanel
                      key={`${row.candidate_id}-profile`}
                      candidate={row}
                      onClose={() => setExpanded(null)}
                      onSearchDonors={name => navigate(`/donors?contributor_name=${encodeURIComponent(name)}`)}
                    />
                  )}
                </>
              )
            })}
            {!loading && sorted.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-terminal-muted">NO RESULTS</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
