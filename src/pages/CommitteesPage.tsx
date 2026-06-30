import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { fecApi, Committee, CommitteeDonor, CommitteeTotal, logExport } from '../api/fec'
import PartyBadge from '../components/PartyBadge'
import { GroupedBarChart } from '../components/Charts'
import { TopBarPortal } from '../lib/topbar'

const fmt = (n?: number | null) => n == null
  ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

// ── Issue taxonomy (short labels) ────────────────────────────────────────────
const ISSUE_LABELS: Record<string, string> = {
  labor: 'Labor', reproductive_rights: 'Repro Rights', gun_policy: 'Gun Policy',
  democracy_voting: 'Democracy', campaign_finance_reform: 'Campaign Finance',
  taxation: 'Taxation', rural_healthcare: 'Rural Health', pharmaceutical_reform: 'Pharma',
  medicare_reform: 'Medicare', family_farm: 'Family Farm', agribusiness: 'Agribusiness',
  tort_judicial: 'Tort Reform', veterans_support: 'Veterans', lgbtq_rights: 'LGBTQ+',
  diverse_candidates: 'Diverse Candidates', young_candidates: 'New Candidates',
  economic_reform: 'Econ Reform', marijuana_reform: 'Cannabis', environmental_climate: 'Climate',
  immigration_reform: 'Immigration', national_security: 'Defense', ai_tech_reform: 'AI/Tech',
  energy_utility: 'Energy', police_reform: 'Police Reform', israel_international: 'Israel/Intl',
}
const ISSUE_OPTIONS = Object.entries(ISSUE_LABELS).map(([id, label]) => ({ id, label }))

interface TagEntry { issue_id: string; direction: number; primary: boolean }
type TaggedMap = Record<string, TagEntry[]>

// ── Seed tag badge strip ──────────────────────────────────────────────────────
function IssueBadges({ tags }: { tags: TagEntry[] }) {
  const primary = tags.filter(t => t.primary)
  const secondary = tags.filter(t => !t.primary)
  const show = primary.length ? primary : secondary.slice(0, 3)
  if (!show.length) return null
  return (
    <div className="flex flex-wrap gap-0.5 mt-0.5">
      {show.map(t => (
        <span
          key={t.issue_id}
          className={`text-[10px] px-1 py-0 rounded border font-medium leading-4 ${
            t.direction >= 0
              ? 'border-green-800 text-green-500 bg-green-950/40'
              : 'border-red-900 text-red-400 bg-red-950/40'
          }`}
        >
          {ISSUE_LABELS[t.issue_id] ?? t.issue_id}
        </span>
      ))}
      {tags.length > show.length && (
        <span className="text-[10px] text-terminal-muted px-0.5">+{tags.length - show.length}</span>
      )}
    </div>
  )
}

// ── Report tag button ─────────────────────────────────────────────────────────
function ReportTagButton({ committeeId, committeeName }: { committeeId: string; committeeName: string }) {
  const [open, setOpen] = useState(false)
  const [issueId, setIssueId] = useState('')
  const [direction, setDirection] = useState<1 | -1>(1)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function submit() {
    if (!issueId) return
    setStatus('sending')
    try {
      const res = await fetch('/api/issues/report-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          committee_id: committeeId,
          committee_name: committeeName,
          issue_id: issueId,
          direction,
          note: note.trim() || null,
        }),
      })
      if (!res.ok) throw new Error()
      setStatus('done')
      setTimeout(() => { setOpen(false); setStatus('idle'); setIssueId(''); setNote('') }, 1800)
    } catch {
      setStatus('error')
    }
  }

  if (!open) {
    return (
      <button
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        className="text-[10px] text-terminal-muted border border-terminal-border px-1.5 py-0.5 hover:border-yellow-600 hover:text-yellow-500 transition-colors whitespace-nowrap"
        title="Tag this committee with an issue"
      >
        + tag
      </button>
    )
  }

  return (
    <div ref={ref} onClick={e => e.stopPropagation()}
      className="absolute z-30 right-0 top-full mt-1 flex flex-col gap-1.5 border border-yellow-700 bg-terminal-panel shadow-lg rounded px-3 py-2.5 text-xs w-64">
      <div className="text-yellow-400 font-medium text-xs truncate">Tag: {committeeName}</div>
      <select
        autoFocus
        value={issueId}
        onChange={e => setIssueId(e.target.value)}
        className="bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1 rounded text-xs outline-none focus:border-yellow-600"
      >
        <option value="">— select issue —</option>
        {ISSUE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <div className="flex gap-2">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={direction === 1} onChange={() => setDirection(1)} className="accent-green-500" />
          <span className="text-green-400">Supports</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={direction === -1} onChange={() => setDirection(-1)} className="accent-red-500" />
          <span className="text-red-400">Opposes</span>
        </label>
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Note (optional) — e.g. 'clearly labor-affiliated per bylaws'"
        rows={2}
        className="bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1 rounded text-xs outline-none focus:border-yellow-600 resize-none"
      />
      <div className="flex gap-2 mt-0.5">
        <button
          onClick={submit}
          disabled={!issueId || status === 'sending'}
          className="px-3 py-0.5 bg-yellow-700 text-yellow-100 rounded hover:bg-yellow-600 disabled:opacity-40 transition-colors"
        >
          {status === 'sending' ? 'submitting…' : status === 'done' ? '✓ submitted' : 'submit'}
        </button>
        <button onClick={() => { setOpen(false); setNote('') }} className="px-2 py-0.5 text-terminal-muted hover:text-terminal-text">
          cancel
        </button>
      </div>
      {status === 'error' && <div className="text-terminal-red text-xs">Failed — try again</div>}
    </div>
  )
}

const COMMITTEE_TYPES = [
  { value: '', label: 'All Types' }, { value: 'H', label: 'House' }, { value: 'S', label: 'Senate' },
  { value: 'P', label: 'Presidential' }, { value: 'N', label: 'PAC (Non-party)' },
  { value: 'Q', label: 'PAC (Qualified)' }, { value: 'O', label: 'Super PAC' },
  { value: 'V', label: 'Hybrid PAC' }, { value: 'X', label: 'Party (Non-qualified)' }, { value: 'Y', label: 'Party (Qualified)' },
]
const PARTIES = [{ value: '', label: 'All Parties' }, { value: 'DEM', label: 'Democrat' }, { value: 'REP', label: 'Republican' }]
const CYCLES  = [{ value: '', label: 'All Cycles' }, { value: '2026', label: '2026' }, { value: '2024', label: '2024' }, { value: '2022', label: '2022' }, { value: '2020', label: '2020' }, { value: '2018', label: '2018' }]

type SortKey = 'name' | 'state' | 'type' | 'party'
type SortDir = 'asc' | 'desc'

function SortHeader({ label, col, sort, onSort, width }: { label: string; col: SortKey; sort: { key: SortKey; dir: SortDir }; onSort: (k: SortKey) => void; width?: string }) {
  const active = sort.key === col
  return (
    <th
      onClick={() => onSort(col)}
      style={{ width }}
      className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal cursor-pointer hover:text-terminal-text select-none"
    >
      {label} {active ? (sort.dir === 'asc' ? '↑' : '↓') : <span className="opacity-20">↕</span>}
    </th>
  )
}

interface SpendingData {
  total: number
  categories: { name: string; amount: number }[]
  top_recipients: { name: string; amount: number }[]
  transaction_count: number
}

function SpendingBreakdown({ spending }: { spending: SpendingData }) {
  const max = spending.categories[0]?.amount ?? 1
  const fmtAmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  const pct = (n: number) => `${Math.round((n / spending.total) * 100)}%`
  return (
    <div className="flex gap-0 divide-x divide-terminal-border">
      {/* Categories */}
      <div className="flex-1 px-4 py-3">
        <div className="text-terminal-muted text-xs uppercase tracking-wider mb-3">
          Spending by Category · <span className="text-terminal-red">{fmtAmt(spending.total)}</span> total · {spending.transaction_count} transactions
        </div>
        <div className="space-y-2">
          {spending.categories.map(c => (
            <div key={c.name}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-terminal-text">{c.name}</span>
                <span className="text-terminal-muted ml-4 flex-shrink-0">
                  <span className="text-terminal-red">{fmtAmt(c.amount)}</span>
                  <span className="text-terminal-border ml-1">({pct(c.amount)})</span>
                </span>
              </div>
              <div className="h-1.5 bg-terminal-panel rounded overflow-hidden">
                <div className="h-full bg-terminal-red rounded transition-all" style={{ width: `${(c.amount / max) * 100}%`, opacity: 0.7 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Top recipients */}
      <div className="w-72 flex-shrink-0 px-4 py-3">
        <div className="text-terminal-muted text-xs uppercase tracking-wider mb-3">Top Recipients</div>
        <div className="space-y-1">
          {spending.top_recipients.map((r, i) => (
            <div key={i} className="flex justify-between text-xs gap-2">
              <span className="text-terminal-text truncate flex-1">{r.name}</span>
              <span className="text-terminal-red flex-shrink-0">{fmtAmt(r.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DonorPanel({ committee, onClose }: { committee: Committee; onClose: () => void }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'donors' | 'spending'>('donors')
  const [donors, setDonors] = useState<CommitteeDonor[] | null>(null)
  const [totals, setTotals] = useState<CommitteeTotal[] | null>(null)
  const [spending, setSpending] = useState<SpendingData | null>(null)
  const [spendingLoading, setSpendingLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [stateFilter, setStateFilter] = useState('MO')
  const [stateInput, setStateInput] = useState('MO')

  const load = (state: string) => {
    setLoading(true)
    Promise.all([
      fecApi.committeeDonors(committee.committee_id, { state: state || undefined, per_page: 50 }),
      totals === null ? fecApi.committeeTotals(committee.committee_id) : Promise.resolve({ results: totals }),
    ])
      .then(([d, t]) => {
        setDonors(d.results)
        setTotals(t.results)
        setLoaded(true)
      })
      .catch(() => { setDonors([]); setLoaded(true) })
      .finally(() => setLoading(false))
  }

  if (!loaded && !loading) load(stateFilter)

  const loadSpending = () => {
    if (spending || spendingLoading) return
    setSpendingLoading(true)
    fecApi.committeeSpending(committee.committee_id)
      .then(setSpending)
      .catch(() => {})
      .finally(() => setSpendingLoading(false))
  }

  const switchTab = (t: 'donors' | 'spending') => {
    setTab(t)
    if (t === 'spending') loadSpending()
  }

  const applyState = () => {
    setStateFilter(stateInput)
    setLoaded(false)
    setDonors(null)
  }

  const exportCsv = () => {
    if (!donors) return
    const headers = ['Lean','Name','City','State','Employer','Occupation','Amount','Date']
    const csvRows = donors.map(d => [
      d.donor_party || '', d.contributor_name, d.contributor_city || '',
      d.contributor_state, d.contributor_employer || '', d.contributor_occupation || '',
      d.contribution_receipt_amount, d.contribution_receipt_date?.slice(0,10) || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${committee.committee_id}-donors.csv`; a.click()
    logExport('committee-donors', committee.committee_id, donors.length)
  }

  const latest = totals?.[0]

  return (
    <div className="bg-terminal-bg border-t border-terminal-border">
      {/* Panel header */}
      <div className="px-4 py-2 flex items-center gap-3 border-b border-terminal-border flex-wrap">
        <span className="text-terminal-muted text-xs uppercase tracking-wider flex-1">
          {committee.name}
          {tab === 'donors' && donors && <span className="ml-2 text-terminal-text">{donors.length} donors shown</span>}
        </span>

        {/* Tab toggle */}
        <div className="flex border border-terminal-border">
          {(['donors', 'spending'] as const).map(t => (
            <button key={t} onClick={() => switchTab(t)}
              className={`px-3 py-0.5 text-xs uppercase tracking-wider transition-colors ${tab === t ? 'bg-terminal-accent text-white' : 'text-terminal-muted hover:text-terminal-text'}`}>
              {t === 'donors' ? 'DONORS' : 'SPENDING'}
            </button>
          ))}
        </div>

        {/* Money Flow link */}
        <button
          onClick={() => navigate(`/flow?committee_id=${committee.committee_id}`)}
          className="text-xs text-terminal-accent border border-terminal-accent px-2 py-0.5 hover:bg-terminal-accent hover:text-terminal-bg transition-colors tracking-wider"
          title="Trace donor → committee → expenditure flow"
        >
          TRACE FLOW →
        </button>

        {tab === 'donors' && (
          <div className="flex items-center gap-1">
            <span className="text-terminal-muted text-xs">State:</span>
            <input className="input-field w-14 text-center" value={stateInput}
              onChange={e => setStateInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && applyState()} maxLength={2} placeholder="All" />
            <button onClick={applyState} className="btn-ghost text-xs py-0.5 px-2">GO</button>
          </div>
        )}
        {tab === 'donors' && donors && donors.length > 0 && (
          <button onClick={exportCsv} className="btn-ghost text-xs py-0.5 px-2">CSV</button>
        )}
        <button onClick={onClose} className="text-terminal-muted hover:text-terminal-text text-xs">✕ CLOSE</button>
      </div>

      {/* Financial totals strip */}
      {latest && (
        <div className="px-4 py-2 border-b border-terminal-border flex gap-6 text-xs flex-wrap">
          <span className="text-terminal-muted uppercase tracking-wider">Cycle {latest.cycle}</span>
          <span>Raised: <span className="text-terminal-green font-bold">{fmt(latest.receipts)}</span></span>
          <span>Spent: <span className="text-terminal-red">{fmt(latest.disbursements)}</span></span>
          <span>Cash: <span className="text-terminal-text">{fmt(latest.cash_on_hand_end_period)}</span></span>
          <span className="text-terminal-muted">Indiv: {fmt(latest.individual_contributions)}</span>
          <span className="text-terminal-muted">PAC-to-PAC: {fmt(latest.other_political_committee_contributions)}</span>
        </div>
      )}

      {/* Fundraising chart */}
      {tab === 'donors' && totals && totals.length > 1 && (
        <div className="px-4 py-3 border-b border-terminal-border">
          <div className="text-terminal-muted text-xs uppercase tracking-wider mb-2">Raised vs Spent by Cycle</div>
          <GroupedBarChart
            data={[...totals].reverse().map(t => ({
              label: String(t.cycle),
              bars: [
                { value: t.receipts, color: '#22c55e', key: 'raised' },
                { value: t.disbursements, color: '#ef4444', key: 'spent' },
              ]
            }))}
            height={60}
            legend={[{ key: 'raised', color: '#22c55e', label: 'Raised' }, { key: 'spent', color: '#ef4444', label: 'Spent' }]}
          />
        </div>
      )}

      {/* SPENDING TAB */}
      {tab === 'spending' && (
        <>
          {spendingLoading && <div className="px-4 py-3 text-terminal-accent text-xs animate-pulse">LOADING SPENDING DATA…</div>}
          {spending && <SpendingBreakdown spending={spending} />}
          {!spendingLoading && !spending && <div className="px-4 py-3 text-terminal-muted text-xs">No spending data available.</div>}
        </>
      )}

      {/* DONORS TAB */}
      {tab === 'donors' && (
        <>
          {loading && <div className="px-4 py-3 text-terminal-accent text-xs animate-pulse">LOADING…</div>}
          {loaded && donors?.length === 0 && (
            <div className="px-4 py-3 text-terminal-muted text-xs">No donors found{stateFilter ? ` from ${stateFilter}` : ''} for this committee (2018+)</div>
          )}
          {loaded && donors && donors.length > 0 && (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-terminal-panel">
                  {['Lean','Donor','City','State','Employer','Occupation','Amount','Date'].map(h => (
                    <th key={h} className="px-3 py-1.5 text-left text-terminal-muted font-normal uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {donors.map((d, i) => (
                  <tr key={i} className="border-t border-terminal-border hover:bg-terminal-panel transition-colors">
                    <td className="px-3 py-1"><PartyBadge party={d.donor_party} confidence={d.donor_party_confidence || undefined} /></td>
                    <td className="px-3 py-1">
                      <button onClick={() => navigate(`/donors/profile?name=${encodeURIComponent(d.contributor_name)}&state=${d.contributor_state}`)}
                        className="text-terminal-accent hover:underline text-left">{d.contributor_name}</button>
                    </td>
                    <td className="px-3 py-1 text-terminal-text">{d.contributor_city || '—'}</td>
                    <td className="px-3 py-1 text-terminal-muted">{d.contributor_state || '—'}</td>
                    <td className="px-3 py-1 text-terminal-text">{d.contributor_employer || '—'}</td>
                    <td className="px-3 py-1 text-terminal-text">{d.contributor_occupation || '—'}</td>
                    <td className="px-3 py-1 text-right text-terminal-green font-bold">{fmt(d.contribution_receipt_amount)}</td>
                    <td className="px-3 py-1 text-terminal-muted">{d.contribution_receipt_date?.slice(0,10) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

// ── MEC / State-level committee tab ───────────────────────────────────────────

interface MecCommittee {
  mec_id: string
  committee_name: string
  party: string
  contribution_count: number
  unique_donors: number
  total_raised: number
  first_year: number | null
  last_year: number | null
  currently_serving: number
}

interface MecDonor {
  contributor_name: string
  contributor_city: string | null
  contributor_state: string | null
  contributor_employer: string | null
  contributor_occupation: string | null
  amount: number
  contribution_date: string | null
  donor_party: string | null
  donor_party_confidence: number
}

function MecDonorPanel({ committee, onClose }: { committee: MecCommittee; onClose: () => void }) {
  const navigate = useNavigate()
  const [donors, setDonors] = useState<MecDonor[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/mec/committees/${encodeURIComponent(committee.mec_id)}/donors`)
      .then(r => r.json())
      .then(d => setDonors(d.donors))
      .catch(() => setDonors([]))
      .finally(() => setLoading(false))
  }, [committee.mec_id])

  return (
    <div className="bg-terminal-bg border-t border-terminal-accent p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-terminal-accent font-bold text-sm">{committee.committee_name}</span>
          <span className="text-terminal-muted text-xs ml-3">{committee.mec_id} · MO State</span>
          {committee.party && committee.party !== 'UNKNOWN' && (
            <span className={`ml-2 text-xs font-bold ${committee.party === 'DEM' ? 'text-blue-400' : committee.party === 'REP' ? 'text-red-400' : 'text-terminal-muted'}`}>
              {committee.party}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-terminal-muted hover:text-terminal-text text-xs px-2">✕ CLOSE</button>
      </div>

      {loading && <div className="text-terminal-muted text-xs animate-pulse py-4">LOADING DONORS…</div>}

      {!loading && donors && donors.length === 0 && (
        <div className="text-terminal-muted text-xs py-4">No donor records found.</div>
      )}

      {!loading && donors && donors.length > 0 && (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-terminal-panel">
              {['Lean', 'Donor', 'City', 'State', 'Employer', 'Occupation', 'Amount', 'Date'].map(h => (
                <th key={h} className="px-3 py-1.5 text-left text-terminal-muted font-normal uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {donors.map((d, i) => (
              <tr key={i} className="border-t border-terminal-border hover:bg-terminal-panel transition-colors">
                <td className="px-3 py-1">
                  <PartyBadge party={d.donor_party} confidence={d.donor_party_confidence || undefined} />
                </td>
                <td className="px-3 py-1">
                  <button
                    onClick={() => navigate(`/donors/profile?name=${encodeURIComponent(d.contributor_name)}&state=${d.contributor_state || ''}`)}
                    className="text-terminal-accent hover:underline text-left"
                  >
                    {d.contributor_name}
                  </button>
                </td>
                <td className="px-3 py-1 text-terminal-text">{d.contributor_city || '—'}</td>
                <td className="px-3 py-1 text-terminal-muted">{d.contributor_state || '—'}</td>
                <td className="px-3 py-1 text-terminal-text">{d.contributor_employer || '—'}</td>
                <td className="px-3 py-1 text-terminal-text">{d.contributor_occupation || '—'}</td>
                <td className="px-3 py-1 text-right text-terminal-green font-bold">{fmt(d.amount)}</td>
                <td className="px-3 py-1 text-terminal-muted">{(d.contribution_date || '').slice(0, 10) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function MecCommitteesTab({ taggedMap }: { taggedMap: TaggedMap }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<MecCommittee[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [servingOnly, setServingOnly] = useState(false)

  const doSearch = (query: string, serving?: boolean) => {
    const useServing = serving ?? servingOnly
    setLoading(true)
    setExpanded(null)
    const params = new URLSearchParams({ limit: '200' })
    if (query.trim()) params.set('q', query.trim())
    if (useServing) params.set('currently_serving', 'true')
    fetch(`/api/mec/committees?${params}`)
      .then(r => r.json())
      .then(d => { setRows(d.results); setSearched(true) })
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }

  const toggleServing = () => {
    const next = !servingOnly
    setServingOnly(next)
    doSearch(q, next)
  }

  const toggle = (id: string) => setExpanded(prev => prev === id ? null : id)

  return (
    <div className="flex flex-col h-full">
      <TopBarPortal>
      <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel">
        <div className="text-yellow-400 text-xs font-bold tracking-widest mb-3">COMMITTEE SEARCH — MEC / MISSOURI STATE</div>
        <form onSubmit={e => { e.preventDefault(); doSearch(q) }} className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="label">Committee Name</label>
            <input className="input-field" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. 'Missouri Republican Party'…" />
          </div>
          <button type="submit" className="btn-primary py-3 md:py-1" disabled={loading}>SEARCH</button>
          <button type="button" className="btn-ghost py-3 md:py-1" onClick={() => { setQ(''); doSearch('') }}>ALL</button>
          <button
            type="button"
            onClick={toggleServing}
            className={`py-3 md:py-1 px-3 text-xs font-bold uppercase tracking-wider border transition-colors ${servingOnly ? 'border-green-400 text-green-400 bg-green-400/10' : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'}`}
          >
            ★ CURRENTLY SERVING
          </button>
        </form>
      </div>
      </TopBarPortal>

      <div className="px-4 py-1 border-b border-terminal-border flex items-center gap-3 text-terminal-muted text-xs bg-terminal-panel">
        {loading && <span className="text-terminal-accent animate-pulse">LOADING…</span>}
        {!loading && searched && <span>{rows.length.toLocaleString()} COMMITTEES</span>}
        {!loading && searched && <span>· click name to see donors</span>}
        {!searched && !loading && <span className="text-terminal-muted">Enter a name or click ALL to browse all committees</span>}
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-terminal-panel z-10">
            <tr>
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-16">Party</th>
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal">Name</th>
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-24">MEC ID</th>
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-20">Donors</th>
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-24">Contributions</th>
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-28">Total Raised</th>
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-20">Years</th>
              <th className="px-3 py-2 border-b border-terminal-border w-28"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isOpen = expanded === row.mec_id
              const tags = taggedMap[row.mec_id] ?? []
              return (
                <>
                  <tr
                    key={row.mec_id}
                    className={`border-b border-terminal-border transition-colors ${isOpen ? 'bg-terminal-panel' : i % 2 === 0 ? '' : 'bg-white/[0.04]'} hover:bg-white/30`}
                  >
                    <td className="px-3 py-1.5">
                      <span className={row.party === 'DEM' ? 'text-blue-400 text-xs font-bold' : row.party === 'REP' ? 'text-red-400 text-xs font-bold' : row.party === 'SPLIT' ? 'text-purple-400 text-xs' : 'text-terminal-muted text-xs'}>
                        {row.party === 'UNKNOWN' ? '—' : row.party}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => toggle(row.mec_id)} className="text-terminal-accent hover:underline text-left flex items-center gap-1 flex-wrap">
                        <span className={`text-terminal-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                        {row.committee_name}
                        {row.currently_serving === 1 && (
                          <span className="ml-1 px-1 py-0.5 text-[10px] font-bold tracking-wider bg-green-400/15 text-green-400 border border-green-400/40 rounded-sm">★ SERVING</span>
                        )}
                      </button>
                      {tags.length > 0 && <IssueBadges tags={tags} />}
                    </td>
                    <td className="px-3 py-1.5 text-terminal-muted">{row.mec_id}</td>
                    <td className="px-3 py-1.5 text-terminal-text">{(row.unique_donors ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-terminal-muted">{(row.contribution_count ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-terminal-green font-bold">{fmt(row.total_raised)}</td>
                    <td className="px-3 py-1.5 text-terminal-muted">
                      {row.first_year && row.last_year
                        ? row.first_year === row.last_year ? row.first_year : `${row.first_year}–${row.last_year}`
                        : '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5 justify-end relative">
                        <ReportTagButton committeeId={row.mec_id} committeeName={row.committee_name} />
                        <button
                          onClick={() => toggle(row.mec_id)}
                          className={`text-xs uppercase tracking-wider px-2 py-0.5 border transition-colors ${isOpen ? 'border-terminal-accent text-terminal-accent' : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'}`}
                        >
                          {isOpen ? 'HIDE' : 'DONORS'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${row.mec_id}-expand`} className="border-b-2 border-yellow-400">
                      <td colSpan={8} className="p-0">
                        <MecDonorPanel committee={row} onClose={() => setExpanded(null)} />
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {!loading && searched && rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-terminal-muted">NO RESULTS</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function CommitteesPage() {
  const [activeTab, setActiveTab] = useState<'fec' | 'mec'>('fec')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [form, setForm] = useState({ q: '', state: '', committee_type: '', party: '', cycle: '' })
  const [rows, setRows] = useState<Committee[]>([])
  const [count, setCount] = useState<number | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  const [taggedMap, setTaggedMap] = useState<TaggedMap>({})

  useEffect(() => {
    fetch('/api/issues/tagged-map')
      .then(r => r.json())
      .then(setTaggedMap)
      .catch(() => {})
  }, [])

  const doSearch = async (f: typeof form, randomize = false, targetPage = 1, targetPerPage = 50) => {
    setExpanded(null)
    setLoading(true)
    setError(null)
    setPage(targetPage)
    try {
      const isEmpty = !f.q && !f.state && !f.committee_type && !f.party && !f.cycle
      const res = await fecApi.committees({
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
  }

  const search = (e?: React.FormEvent) => { e?.preventDefault(); doSearch(form, false, 1, perPage) }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { doSearch(form, true, 1, perPage) }, [])

  const toggle = (id: string) => setExpanded(prev => prev === id ? null : id)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    const lower = val.toLowerCase()
    let detectedParty = ''
    if (lower.includes('democrat')) detectedParty = 'DEM'
    else if (lower.includes('republican')) detectedParty = 'REP'
    setForm(f => ({ ...f, q: val, party: detectedParty || f.party }))
  }

  const toggleSort = (key: SortKey) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })

  const sorted = [...rows].sort((a, b) => {
    let av: string = '', bv: string = ''
    if (sort.key === 'name')  { av = a.name;  bv = b.name }
    if (sort.key === 'state') { av = a.state || ''; bv = b.state || '' }
    if (sort.key === 'type')  { av = a.committee_type_full || a.committee_type; bv = b.committee_type_full || b.committee_type }
    if (sort.key === 'party') { av = a.party || ''; bv = b.party || '' }
    return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
  })

  const exportCsv = () => {
    const headers = ['ID','Name','State','Type','Party','Treasurer','Cycles']
    const csvRows = sorted.map(r => [
      r.committee_id, r.name, r.state || '', r.committee_type_full || r.committee_type,
      r.party_full || r.party || '', r.treasurer_name || '',
      (r.cycles || []).slice(-4).join(' '),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'committees.csv'; a.click()
    logExport('committees', 'committee-search', sorted.length)
  }

  if (activeTab === 'mec') {
    return (
      <div className="flex flex-col h-full">
        <TopBarPortal>
        <div className="px-4 pt-3 pb-0 border-b border-terminal-border bg-terminal-panel flex gap-4">
          <button onClick={() => setActiveTab('fec')} className="text-xs uppercase tracking-wider pb-2 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text transition-colors">FEC / Federal</button>
          <button onClick={() => setActiveTab('mec')} className="text-xs uppercase tracking-wider pb-2 border-b-2 border-yellow-400 text-yellow-400">MEC / Missouri State</button>
        </div>
        </TopBarPortal>
        <MecCommitteesTab taggedMap={taggedMap} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <TopBarPortal>
      <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel">
        <div className="flex gap-4 mb-3 border-b border-terminal-border -mx-4 px-4 pb-0">
          <button onClick={() => setActiveTab('fec')} className="text-xs uppercase tracking-wider pb-2 border-b-2 border-terminal-accent text-terminal-accent">FEC / Federal</button>
          <button onClick={() => setActiveTab('mec')} className="text-xs uppercase tracking-wider pb-2 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text transition-colors">MEC / Missouri State</button>
        </div>
        <div className="text-terminal-accent text-xs font-bold tracking-widest mb-3">COMMITTEE SEARCH — FEC</div>
        <button
          className="md:hidden w-full text-left py-3 text-terminal-accent text-xs uppercase tracking-wider flex items-center justify-between"
          onClick={() => setFiltersOpen(v => !v)}
        >
          FILTERS <span>{filtersOpen ? '▲' : '▼'}</span>
        </button>
        <div className={`md:block ${filtersOpen ? 'block' : 'hidden'}`}>
        <form onSubmit={search} className="flex gap-2 items-end flex-col md:flex-row md:flex-wrap">
          <div className="w-full md:w-auto md:flex-1 md:min-w-36">
            <label className="label">Name / Keywords</label>
            <input className="input-field" value={form.q} onChange={handleNameChange} placeholder="e.g. 'Democratic Party of Missouri'…" />
          </div>
          <div className="w-full md:w-16">
            <label className="label">State</label>
            <input className="input-field" value={form.state} onChange={set('state')} placeholder="All" maxLength={2} />
          </div>
          <div className="w-full md:w-36">
            <label className="label">Type</label>
            <select className="input-field" value={form.committee_type} onChange={set('committee_type')}>
              {COMMITTEE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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
          {rows.length > 0 && <button type="button" onClick={exportCsv} className="btn-ghost py-3 md:py-1">CSV</button>}
        </form>
        </div>
      </div>
      </TopBarPortal>

      <div className="px-4 py-1 border-b border-terminal-border flex items-center gap-4 text-terminal-muted text-xs bg-terminal-panel flex-wrap">
        {loading && <span className="text-terminal-accent animate-pulse">LOADING…</span>}
        {!loading && count !== undefined && <span>{count.toLocaleString()} RESULTS</span>}
        {!loading && rows.length > 0 && <span>· showing {sorted.length} · click name to see donors</span>}
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
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-terminal-panel z-10">
            <tr>
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-12">Party</th>
              <SortHeader label="Name"      col="name"  sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-24">ID</th>
              <SortHeader label="State"     col="state" sort={sort} onSort={toggleSort} width="6%" />
              <SortHeader label="Type"      col="type"  sort={sort} onSort={toggleSort} width="18%" />
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-36">Treasurer</th>
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-20">Cycles</th>
              <th className="px-3 py-2 border-b border-terminal-border w-24"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const isOpen = expanded === row.committee_id
              const tags = taggedMap[row.committee_id] ?? []
              return (
                <>
                  <tr
                    key={row.committee_id}
                    className={`border-b border-terminal-border transition-colors ${isOpen ? 'bg-terminal-panel' : i % 2 === 0 ? '' : 'bg-white/[0.04]'} hover:bg-white/30`}
                  >
                    <td className="px-3 py-1.5">
                      <span className={row.party === 'DEM' ? 'text-terminal-blue text-xs' : row.party === 'REP' ? 'text-terminal-red text-xs' : 'text-terminal-muted text-xs'}>
                        {row.party || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => toggle(row.committee_id)} className="text-terminal-accent hover:underline text-left flex items-center gap-1">
                        <span className={`text-terminal-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                        {row.name}
                      </button>
                      {tags.length > 0 && <IssueBadges tags={tags} />}
                    </td>
                    <td className="px-3 py-1.5 text-terminal-muted text-xs">{row.committee_id}</td>
                    <td className="px-3 py-1.5">{row.state || '—'}</td>
                    <td className="px-3 py-1.5 text-terminal-muted">{row.committee_type_full || row.committee_type}</td>
                    <td className="px-3 py-1.5 text-terminal-muted">{row.treasurer_name || '—'}</td>
                    <td className="px-3 py-1.5 text-terminal-muted">{(row.cycles || []).slice(-3).join(' ')}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5 justify-end relative">
                        <ReportTagButton committeeId={row.committee_id} committeeName={row.name} />
                        <button
                          onClick={() => toggle(row.committee_id)}
                          className={`text-xs uppercase tracking-wider px-2 py-0.5 border transition-colors ${
                            isOpen
                              ? 'border-terminal-accent text-terminal-accent'
                              : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'
                          }`}
                        >
                          {isOpen ? 'HIDE' : 'DONORS'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${row.committee_id}-expand`} className="border-b-2 border-terminal-accent">
                      <td colSpan={8} className="p-0">
                        <DonorPanel committee={row} onClose={() => setExpanded(null)} />
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {!loading && sorted.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-terminal-muted">NO RESULTS</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
