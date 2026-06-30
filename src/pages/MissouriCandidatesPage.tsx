import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PartyBadge from '../components/PartyBadge'
import { TopBarPortal } from '../lib/topbar'

const fmt = (n?: number | null) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

interface MoCandidate {
  mec_id: string
  committee_name: string
  contribution_count: number
  unique_donors: number
  total_raised: number
  first_year: number | null
  last_year: number | null
  currently_serving: number | null
  party: string | null
  candidate_name: string | null
  is_candidate: number | null
  office: string | null
  district: string | null
  sos_party: string | null
  match_score: number | null
  verified: number | null
}

interface MoDonor {
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

function ServingBadge({ office, district }: { office?: string | null; district?: string | null }) {
  const label = office
    ? district ? `${office} · Dist. ${district}` : office
    : 'Currently Serving'
  return (
    <span title={label}
      className="inline-flex items-center gap-0.5 px-1 py-0 text-[10px] font-bold border border-green-500/50 text-green-400 bg-green-400/10 rounded-sm">
      ★ SERVING
    </span>
  )
}

function OfficeBadge({ office, district }: { office: string; district?: string | null }) {
  const label = district ? `${office} · Dist. ${district}` : office
  return (
    <span className="inline-flex items-center px-1 py-0 text-[10px] border border-terminal-border text-terminal-muted rounded-sm">
      {label}
    </span>
  )
}

function DonorPanel({ candidate, onClose }: { candidate: MoCandidate; onClose: () => void }) {
  const navigate = useNavigate()
  const [donors, setDonors] = useState<MoDonor[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [meta, setMeta] = useState<{ total_raised?: number; contribution_count?: number; unique_donors?: number } | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/mec/committees/${encodeURIComponent(candidate.mec_id)}/donors`)
      .then(r => r.json())
      .then(d => { setDonors(d.donors); setMeta(d.committee) })
      .catch(() => setDonors([]))
      .finally(() => setLoading(false))
  }, [candidate.mec_id])

  const exportCsv = () => {
    if (!donors?.length) return
    const headers = ['Lean', 'Donor', 'City', 'State', 'Employer', 'Occupation', 'Amount', 'Date']
    const rows = donors.map(d =>
      [
        d.donor_party || '', d.contributor_name, d.contributor_city || '',
        d.contributor_state || '', d.contributor_employer || '',
        d.contributor_occupation || '', d.amount,
        (d.contribution_date || '').slice(0, 10),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    )
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${candidate.mec_id}-donors.csv`
    a.click()
  }

  const displayName = candidate.candidate_name || candidate.committee_name
  const effectiveParty = candidate.party || candidate.sos_party

  return (
    <div className="bg-terminal-bg border-t border-terminal-accent">
      <div className="px-4 py-2 border-b border-terminal-border flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <span className="text-terminal-accent font-bold text-sm">{displayName}</span>
          {candidate.candidate_name && candidate.candidate_name !== candidate.committee_name && (
            <span className="text-terminal-muted text-xs ml-2">{candidate.committee_name}</span>
          )}
          {effectiveParty && effectiveParty !== 'UNKNOWN' && (
            <span className={`ml-2 text-xs font-bold ${effectiveParty === 'DEM' ? 'text-blue-400' : effectiveParty === 'REP' ? 'text-red-400' : 'text-purple-400'}`}>
              {effectiveParty}
            </span>
          )}
          {candidate.currently_serving === 1 && (
            <span className="ml-2"><ServingBadge office={candidate.office} district={candidate.district} /></span>
          )}
          {candidate.office && (
            <span className="ml-2"><OfficeBadge office={candidate.office} district={candidate.district} /></span>
          )}
        </div>
        {donors && donors.length > 0 && (
          <button onClick={exportCsv} className="btn-ghost text-xs py-0.5 px-2">CSV</button>
        )}
        <button onClick={onClose} className="text-terminal-muted hover:text-terminal-text text-xs">✕ CLOSE</button>
      </div>

      {meta && (
        <div className="px-4 py-2 border-b border-terminal-border flex gap-6 text-xs flex-wrap">
          <span>Total Raised: <span className="text-terminal-green font-bold">{fmt(meta.total_raised)}</span></span>
          <span className="text-terminal-muted">Contributions: {(meta.contribution_count ?? 0).toLocaleString()}</span>
          <span className="text-terminal-muted">Unique Donors: {(meta.unique_donors ?? 0).toLocaleString()}</span>
        </div>
      )}

      {loading && <div className="px-4 py-4 text-terminal-accent text-xs animate-pulse">LOADING DONORS…</div>}
      {!loading && donors?.length === 0 && (
        <div className="px-4 py-4 text-terminal-muted text-xs">No donor records found.</div>
      )}
      {!loading && donors && donors.length > 0 && (
        <table className="w-full border-collapse text-xs">
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
                <td className="px-3 py-1"><PartyBadge party={d.donor_party} confidence={d.donor_party_confidence || undefined} /></td>
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

type SortKey = 'name' | 'party' | 'total_raised' | 'unique_donors' | 'last_year'
type SortDir = 'asc' | 'desc'

export default function MissouriCandidatesPage() {
  const [all, setAll] = useState<MoCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [matching, setMatching] = useState(false)
  const [matchMsg, setMatchMsg] = useState<string | null>(null)
  const [stats, setStats] = useState<{ identified_candidates: number; currently_serving: number } | null>(null)
  const [q, setQ] = useState('')
  const [partyFilter, setPartyFilter] = useState<'ALL' | 'DEM' | 'REP'>('ALL')
  const [servingOnly, setServingOnly] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'total_raised', dir: 'desc' })

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/mo-candidates/?limit=500')
      .then(r => r.json())
      .then(d => setAll(d.results))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const loadStats = useCallback(() => {
    fetch('/api/mo-candidates/stats').then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  useEffect(() => { load(); loadStats() }, [load, loadStats])

  const runEnrichAndMatch = async () => {
    setMatching(true)
    setMatchMsg('Parsing names and matching against serving officials…')
    await fetch('/api/mo-candidates/enrich', { method: 'POST' })
    const res = await fetch('/api/mo-candidates/match-serving/sync', { method: 'POST' })
      .then(r => r.json()).catch(() => null)
    setMatching(false)
    setMatchMsg(res ? `✓ Identified ${res.identified_candidates} candidates · ${res.currently_serving} currently serving officials matched` : 'Match complete')
    load()
    loadStats()
    setTimeout(() => setMatchMsg(null), 6000)
  }

  const filtered = all.filter(r => {
    const effectiveParty = r.party || r.sos_party
    if (partyFilter !== 'ALL' && effectiveParty !== partyFilter) return false
    if (servingOnly && !r.currently_serving) return false
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      const hay = `${r.candidate_name || ''} ${r.committee_name}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    // Always pin currently_serving to top when not explicitly sorted
    if (sort.key !== 'name' && (a.currently_serving || 0) !== (b.currently_serving || 0)) {
      return (b.currently_serving || 0) - (a.currently_serving || 0)
    }
    let av: number | string = 0, bv: number | string = 0
    if (sort.key === 'name') {
      av = (a.candidate_name || a.committee_name).toLowerCase()
      bv = (b.candidate_name || b.committee_name).toLowerCase()
    } else if (sort.key === 'party') {
      av = a.party || a.sos_party || ''; bv = b.party || b.sos_party || ''
    } else if (sort.key === 'total_raised') { av = a.total_raised ?? 0; bv = b.total_raised ?? 0 }
    else if (sort.key === 'unique_donors') { av = a.unique_donors ?? 0; bv = b.unique_donors ?? 0 }
    else if (sort.key === 'last_year') { av = a.last_year ?? 0; bv = b.last_year ?? 0 }

    if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
    return sort.dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  const toggleSort = (key: SortKey) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })

  const SortTh = ({ label, col, width }: { label: string; col: SortKey; width?: string }) => {
    const active = sort.key === col
    return (
      <th onClick={() => toggleSort(col)} style={{ width }}
        className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal cursor-pointer hover:text-terminal-text select-none">
        {label} {active ? (sort.dir === 'asc' ? '↑' : '↓') : <span className="opacity-20">↕</span>}
      </th>
    )
  }

  const servingCount = filtered.filter(r => r.currently_serving).length

  return (
    <div className="flex flex-col h-full">
      <TopBarPortal>
      <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <div className="text-yellow-400 text-xs font-bold tracking-widest">MISSOURI CANDIDATES — MEC STATE RECORDS</div>
          {stats && (
            <div className="ml-auto flex items-center gap-3 text-xs text-terminal-muted">
              <span>{stats.identified_candidates} candidates identified</span>
              {stats.currently_serving > 0 && (
                <span className="text-green-400">· {stats.currently_serving} currently serving</span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-48">
            <label className="label">Search by Name</label>
            <input className="input-field" value={q} onChange={e => setQ(e.target.value)}
              placeholder="e.g. 'Kehoe', 'Beck', 'Smith for Senate'…" />
          </div>
          <div className="flex gap-1 items-end pb-px">
            {(['ALL', 'DEM', 'REP'] as const).map(p => (
              <button key={p} onClick={() => setPartyFilter(p)}
                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border transition-colors ${
                  partyFilter === p
                    ? p === 'DEM' ? 'border-blue-400 text-blue-400 bg-blue-400/10'
                      : p === 'REP' ? 'border-red-400 text-red-400 bg-red-400/10'
                      : 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
                    : 'border-terminal-border text-terminal-muted hover:border-terminal-muted'
                }`}>
                {p}
              </button>
            ))}
            {stats && stats.currently_serving > 0 && (
              <button onClick={() => setServingOnly(v => !v)}
                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border transition-colors ${
                  servingOnly ? 'border-green-400 text-green-400 bg-green-400/10' : 'border-terminal-border text-terminal-muted hover:border-green-500 hover:text-green-400'
                }`}>
                ★ SERVING ONLY
              </button>
            )}
          </div>
          <button onClick={runEnrichAndMatch} disabled={matching || loading}
            className={`text-xs uppercase tracking-wider py-1.5 px-3 border transition-colors whitespace-nowrap ml-auto ${
              matching ? 'border-yellow-500 text-yellow-400 animate-pulse' : 'border-terminal-border text-terminal-muted hover:border-yellow-500 hover:text-yellow-400'
            }`}>
            {matching ? 'MATCHING…' : 'MATCH OFFICIALS'}
          </button>
        </div>
        {matchMsg && <div className="mt-2 text-xs text-green-400">{matchMsg}</div>}
      </div>
      </TopBarPortal>

      <div className="px-4 py-1 border-b border-terminal-border flex items-center gap-3 text-terminal-muted text-xs bg-terminal-panel">
        {loading && <span className="text-terminal-accent animate-pulse">LOADING…</span>}
        {!loading && <span>{sorted.length.toLocaleString()} CANDIDATES</span>}
        {!loading && servingCount > 0 && <span className="text-green-400">· {servingCount} currently serving</span>}
        {!loading && <span>· click name to see financial data</span>}
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-terminal-panel z-10">
            <tr>
              <SortTh label="Party" col="party" width="72px" />
              <SortTh label="Candidate" col="name" />
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal">Status / Office</th>
              <SortTh label="Donors" col="unique_donors" width="72px" />
              <th className="px-3 py-2 text-left text-terminal-muted uppercase tracking-wider border-b border-terminal-border font-normal w-28">Contributions</th>
              <SortTh label="Total Raised" col="total_raised" width="120px" />
              <SortTh label="Active" col="last_year" width="90px" />
              <th className="px-3 py-2 border-b border-terminal-border w-20"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const isOpen = expanded === row.mec_id
              const displayName = row.candidate_name || row.committee_name
              const effectiveParty = row.party || row.sos_party

              return (
                <>
                  <tr key={row.mec_id}
                    className={`border-b border-terminal-border transition-colors ${isOpen ? 'bg-terminal-panel' : i % 2 === 0 ? '' : 'bg-white/[0.04]'} hover:bg-white/30`}>
                    <td className="px-3 py-1.5">
                      <span className={
                        effectiveParty === 'DEM' ? 'text-blue-400 text-xs font-bold' :
                        effectiveParty === 'REP' ? 'text-red-400 text-xs font-bold' :
                        effectiveParty === 'SPLIT' ? 'text-purple-400 text-xs' :
                        'text-terminal-muted text-xs'
                      }>
                        {!effectiveParty || effectiveParty === 'UNKNOWN' ? '—' : effectiveParty}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        onClick={() => setExpanded(prev => prev === row.mec_id ? null : row.mec_id)}
                        className="text-terminal-accent hover:underline text-left flex items-center gap-1"
                      >
                        <span className={`text-terminal-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                        <span className="font-medium">{displayName}</span>
                      </button>
                      {row.candidate_name && row.candidate_name !== row.committee_name && (
                        <div className="text-terminal-muted text-[10px] ml-4 truncate max-w-xs">{row.committee_name}</div>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {row.currently_serving === 1
                          ? <ServingBadge office={row.office} district={row.district} />
                          : <span className="text-[10px] text-terminal-border">—</span>
                        }
                        {row.office && (
                          <OfficeBadge office={row.office} district={row.district} />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-terminal-text">{(row.unique_donors ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-terminal-muted">{(row.contribution_count ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-terminal-green font-bold">{fmt(row.total_raised)}</td>
                    <td className="px-3 py-1.5 text-terminal-muted">
                      {row.first_year && row.last_year
                        ? row.first_year === row.last_year ? String(row.first_year) : `${row.first_year}–${row.last_year}`
                        : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        onClick={() => setExpanded(prev => prev === row.mec_id ? null : row.mec_id)}
                        className={`text-xs uppercase tracking-wider px-2 py-0.5 border transition-colors ${
                          isOpen ? 'border-terminal-accent text-terminal-accent' : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'
                        }`}>
                        {isOpen ? 'HIDE' : 'DATA'}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${row.mec_id}-panel`} className="border-b-2 border-yellow-400">
                      <td colSpan={8} className="p-0">
                        <DonorPanel candidate={row} onClose={() => setExpanded(null)} />
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
