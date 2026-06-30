import { Fragment, useState, useEffect, useCallback, useRef } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'
import { TopBarPortal } from '../lib/topbar'

const API = '/api/mo-house'

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

type MainTab = 'members' | 'bills' | 'committees' | 'correlate'
type CorrMode = 'issue' | 'member' | 'committee' | 'industry' | 'bill' | 'donor' | 'changes' | 'anomalies' | 'network' | 'timeline'
type NetworkFocus = 'issue' | 'rep' | 'employer' | 'committee'

const ISSUES = [
  { id: 'gun_policy',           label: 'Gun Policy' },
  { id: 'reproductive_rights',  label: 'Reproductive Rights' },
  { id: 'labor_employment',     label: 'Labor & Employment' },
  { id: 'immigration',          label: 'Immigration' },
  { id: 'healthcare',           label: 'Healthcare' },
  { id: 'criminal_justice',     label: 'Criminal Justice' },
  { id: 'environment',          label: 'Environment' },
  { id: 'tax_fiscal',           label: 'Tax & Fiscal Policy' },
  { id: 'election_voting',      label: 'Elections & Voting' },
  { id: 'education_k12',        label: 'K-12 Education' },
  { id: 'education_higher',     label: 'Higher Education' },
  { id: 'infrastructure',       label: 'Infrastructure' },
  { id: 'local_government',     label: 'Local Government' },
  { id: 'property_real_estate', label: 'Property & Real Estate' },
  { id: 'gambling_gaming',      label: 'Gambling & Gaming' },
  { id: 'insurance_regulation', label: 'Insurance & Financial Services' },
]

// ── Shared helpers ────────────────────────────────────────────────────────────

function PartyBadge({ party }: { party: string }) {
  const cls = party === 'REP' ? 'text-red-400' : party === 'DEM' ? 'text-blue-400' : 'text-terminal-muted'
  return <span className={`font-mono font-bold ${cls}`}>{party || '?'}</span>
}

function Spinner() {
  return <div className="text-terminal-muted text-xs py-8 text-center animate-pulse tracking-widest">LOADING…</div>
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-xs tracking-wider uppercase border-b-2 transition-colors whitespace-nowrap ${
        active ? 'border-terminal-accent text-terminal-accent' : 'border-transparent text-terminal-muted hover:text-terminal-text'
      }`}
    >
      {label}
    </button>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <div className="text-terminal-accent text-[10px] uppercase tracking-wider mb-2 mt-3">{children}</div>
}

// ── Members tab ───────────────────────────────────────────────────────────────

function VoteBadge({ vote }: { vote: string }) {
  const cls = vote === 'Y' ? 'text-terminal-green' : vote === 'N' ? 'text-red-400' : vote === 'P' ? 'text-amber-400' : 'text-terminal-muted'
  const label = vote === 'Y' ? 'YEA' : vote === 'N' ? 'NAY' : vote === 'P' ? 'PRES' : 'ABS'
  return <span className={`font-mono font-bold ${cls}`}>{label}</span>
}

function MemberDetail({ data, loading, onCorrelate }: { data: any; loading: boolean; onCorrelate: () => void }) {
  const [showVotes, setShowVotes] = useState(false)
  const [votes, setVotes] = useState<any[] | null>(null)
  const [votesLoading, setVotesLoading] = useState(false)

  const loadVotes = useCallback(async () => {
    if (votes !== null) { setShowVotes(v => !v); return }
    const district = data?.member?.district
    if (!district) return
    setShowVotes(true)
    setVotesLoading(true)
    try {
      const json = await fetch(`${API}/members/${district}/votes`).then(r => r.json())
      setVotes(json.votes ?? [])
    } catch {}
    setVotesLoading(false)
  }, [data, votes])

  if (loading) return <Spinner />
  if (!data) return <div className="text-terminal-muted text-xs p-4">No data.</div>
  const { member, bills, committees, legislative_subjects } = data
  return (
    <div className="p-4 text-xs font-mono">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <SectionHead>Member Info</SectionHead>
          {member?.phone && <div className="text-terminal-muted mb-0.5">{member.phone}</div>}
          {member?.email && <div className="text-terminal-muted break-all mb-0.5">{member.email}</div>}
          {member?.years_served != null && <div className="text-terminal-muted">Years served: {member.years_served}</div>}
          <button
            onClick={onCorrelate}
            className="mt-3 px-3 py-1 border border-terminal-accent text-terminal-accent text-[10px] uppercase tracking-wider hover:bg-terminal-accent hover:text-terminal-bg transition-colors"
          >
            FOLLOW THE MONEY →
          </button>
        </div>
        <div>
          {committees?.length > 0 && (
            <>
              <SectionHead>Committees</SectionHead>
              {committees.map((c: any, i: number) => (
                <div key={i} className="text-terminal-text mb-0.5">
                  <span className="text-terminal-muted">{c.position}: </span>{c.name}
                </div>
              ))}
            </>
          )}
          {legislative_subjects?.length > 0 && (
            <>
              <SectionHead>Top Legislative Subjects</SectionHead>
              {legislative_subjects.slice(0, 8).map((s: any, i: number) => (
                <div key={i} className="flex justify-between text-terminal-muted">
                  <span>{s.subject}</span>
                  <span className="text-terminal-text ml-4">{s.bill_count}</span>
                </div>
              ))}
            </>
          )}
        </div>
        <div>
          <SectionHead>Bills Sponsored</SectionHead>
          {!bills?.length && <div className="text-terminal-muted">None</div>}
          <div className="space-y-1 max-h-52 overflow-y-auto">
            {bills?.map((b: any, i: number) => (
              <div key={i} className="text-terminal-muted">
                <span className="text-terminal-text">{b.bill_string}</span>
                {b.sponsor_type === 'CoSponsor' && <span className="text-[10px] text-terminal-muted ml-1">(co)</span>}
                {' — '}
                <span className="text-[10px]">{b.short_title?.substring(0, 60)}{(b.short_title?.length ?? 0) > 60 ? '…' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Voting Record */}
      <div className="mt-3 pt-3 border-t border-terminal-border">
        <button onClick={loadVotes}
          className="text-[10px] uppercase tracking-wider text-terminal-muted hover:text-terminal-accent transition-colors border border-terminal-border px-3 py-1">
          {showVotes ? 'HIDE VOTING RECORD ↑' : 'VOTING RECORD ↓'}
        </button>
        {showVotes && (
          votesLoading ? <Spinner /> : !votes?.length ? (
            <div className="text-terminal-muted text-xs mt-2">No vote records found.</div>
          ) : (
            <div className="mt-2 max-h-56 overflow-y-auto">
              <table className="w-full text-xs font-mono">
                <thead className="sticky top-0 bg-terminal-bg text-terminal-muted uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="text-left px-2 py-1">Bill</th>
                    <th className="text-left px-2 py-1 hidden sm:table-cell">Date</th>
                    <th className="text-left px-2 py-1">Description</th>
                    <th className="text-left px-2 py-1">Vote</th>
                    <th className="text-right px-2 py-1 hidden md:table-cell">Ayes/Noes</th>
                  </tr>
                </thead>
                <tbody>
                  {votes.map((v: any, i: number) => (
                    <tr key={i} className="border-b border-terminal-border/50">
                      <td className="px-2 py-1 text-terminal-accent whitespace-nowrap">{v.bill_string}</td>
                      <td className="px-2 py-1 text-terminal-muted whitespace-nowrap hidden sm:table-cell">{v.action_date?.substring(0, 10)}</td>
                      <td className="px-2 py-1 text-terminal-muted max-w-xs">{v.description?.substring(0, 60)}{(v.description?.length ?? 0) > 60 ? '…' : ''}</td>
                      <td className="px-2 py-1"><VoteBadge vote={v.vote} /></td>
                      <td className="px-2 py-1 text-terminal-muted text-[10px] text-right whitespace-nowrap hidden md:table-cell">
                        {v.total_yes != null && <><span className="text-terminal-green">{v.total_yes}</span>/<span className="text-red-400">{v.total_no}</span></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-terminal-muted text-[10px] mt-1 px-2">{votes.length} roll calls · 2018–present</div>
            </div>
          )
        )}
      </div>
    </div>
  )
}

function MembersPanel({ onCorrelate }: { onCorrelate: (district: string) => void }) {
  const [search, setSearch] = useState('')
  const [party, setParty] = useState<'all' | 'REP' | 'DEM'>('all')
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, any>>({})
  const [detailLoading, setDetailLoading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (party !== 'all') p.set('party', party)
      if (search.trim()) p.set('q', search.trim())
      const data = await fetch(`${API}/members?${p}`).then(r => r.json())
      setMembers(data.members ?? [])
    } catch {}
    setLoading(false)
  }, [party, search])

  useEffect(() => { load() }, [load])

  const toggle = async (district: string) => {
    if (expanded === district) { setExpanded(null); return }
    setExpanded(district)
    if (detail[district]) return
    setDetailLoading(district)
    try {
      const data = await fetch(`${API}/members/${district}`).then(r => r.json())
      setDetail(d => ({ ...d, [district]: data }))
    } catch {}
    setDetailLoading(null)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 items-center p-3 border-b border-terminal-border flex-wrap">
        <div className="flex border border-terminal-border text-xs">
          {(['all', 'REP', 'DEM'] as const).map(p => (
            <button key={p} onClick={() => setParty(p)}
              className={`px-3 py-1.5 uppercase tracking-wider transition-colors ${
                party === p ? 'bg-terminal-accent text-terminal-bg' : 'text-terminal-muted hover:text-terminal-text'
              }`}>{p === 'all' ? 'All' : p}</button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, county, district…"
          className="flex-1 min-w-40 bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono"
        />
        <span className="text-terminal-muted text-xs">{members.length} members</span>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? <Spinner /> : (
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0 bg-terminal-panel text-terminal-muted uppercase tracking-wider text-[10px]">
              <tr>
                <th className="text-left px-3 py-2">Dist</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Party</th>
                <th className="text-left px-3 py-2">County</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">Hometown</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <Fragment key={m.district}>
                  <tr onClick={() => toggle(m.district)}
                    className={`border-b border-terminal-border cursor-pointer transition-colors hover:bg-terminal-panel ${expanded === m.district ? 'bg-terminal-panel' : ''}`}
                  >
                    <td className="px-3 py-2 text-terminal-accent">{m.district}</td>
                    <td className="px-3 py-2 text-terminal-text font-semibold">{m.full_name}</td>
                    <td className="px-3 py-2"><PartyBadge party={m.party} /></td>
                    <td className="px-3 py-2 text-terminal-muted">{m.county}</td>
                    <td className="px-3 py-2 text-terminal-muted hidden md:table-cell">{m.hometown}</td>
                  </tr>
                  {expanded === m.district && (
                    <tr>
                      <td colSpan={5} className="bg-terminal-bg border-b border-terminal-border p-0">
                        <MemberDetail data={detail[m.district]} loading={detailLoading === m.district}
                          onCorrelate={() => onCorrelate(m.district)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Bills tab ─────────────────────────────────────────────────────────────────

function RollCallVotes({ billId }: { billId: string }) {
  const [rollCalls, setRollCalls] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/bills/${billId}/votes`)
      .then(r => r.json())
      .then(json => setRollCalls(json.roll_calls ?? []))
      .catch(() => setRollCalls([]))
      .finally(() => setLoading(false))
  }, [billId])

  if (loading) return <div className="text-terminal-muted text-[10px] animate-pulse">Loading votes…</div>
  if (!rollCalls?.length) return <div className="text-terminal-muted text-[10px]">No recorded roll call votes.</div>

  return (
    <div className="space-y-2">
      {rollCalls.map((rc: any, i: number) => {
        const isOpen = expanded === i
        const ayes = rc.total_yes ?? rc.votes?.filter((v: any) => v.vote === 'Y').length ?? 0
        const noes = rc.total_no ?? rc.votes?.filter((v: any) => v.vote === 'N').length ?? 0
        const pres = rc.total_present ?? rc.votes?.filter((v: any) => v.vote === 'P').length ?? 0
        const byVote: Record<string, any[]> = { Y: [], N: [], P: [], A: [] }
        for (const v of rc.votes ?? []) (byVote[v.vote] ?? (byVote['A'] = [])).push(v)
        return (
          <div key={i} className="border border-terminal-border">
            <button className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-terminal-panel transition-colors"
              onClick={() => setExpanded(isOpen ? null : i)}>
              <span className="text-terminal-muted text-[10px] whitespace-nowrap">{rc.action_date?.substring(0, 10)}</span>
              <span className="text-terminal-text text-xs flex-1">{rc.description?.substring(0, 70)}{(rc.description?.length ?? 0) > 70 ? '…' : ''}</span>
              <span className="text-terminal-green text-[10px] whitespace-nowrap">YEA {ayes}</span>
              <span className="text-red-400 text-[10px] whitespace-nowrap">NAY {noes}</span>
              {pres > 0 && <span className="text-amber-400 text-[10px] whitespace-nowrap">PRES {pres}</span>}
              <span className="text-terminal-muted text-[10px]">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && rc.votes?.length > 0 && (
              <div className="border-t border-terminal-border px-3 py-2 max-h-48 overflow-y-auto">
                {(['Y', 'N', 'P', 'A'] as const).map(vt => {
                  const group = (rc.votes as any[]).filter((v: any) => v.vote === vt)
                  if (!group.length) return null
                  const label = vt === 'Y' ? 'YEA' : vt === 'N' ? 'NAY' : vt === 'P' ? 'PRESENT' : 'ABSENT'
                  const cls = vt === 'Y' ? 'text-terminal-green' : vt === 'N' ? 'text-red-400' : vt === 'P' ? 'text-amber-400' : 'text-terminal-muted'
                  return (
                    <div key={vt} className="mb-2">
                      <div className={`text-[10px] uppercase tracking-wider mb-1 ${cls}`}>{label} ({group.length})</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                        {group.map((v: any, j: number) => (
                          <span key={j} className="text-[10px] text-terminal-muted">
                            {v.full_name || v.member_name}
                            {v.party && <span className={`ml-0.5 ${v.party === 'REP' ? 'text-red-400' : v.party === 'DEM' ? 'text-blue-400' : ''}`}> ({v.party})</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function BillDetail({ data, loading, billId }: { data: any; loading: boolean; billId: string }) {
  if (loading) return <Spinner />
  if (!data) return <div className="text-terminal-muted text-xs p-4">No data.</div>
  const { sponsors, actions, subjects, hearings, amendments } = data
  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
      <div>
        <SectionHead>Subjects</SectionHead>
        {!(subjects as string[])?.length && <div className="text-terminal-muted">None</div>}
        {(subjects as string[])?.map((s, i) => <div key={i} className="text-terminal-muted">{s}</div>)}

        <SectionHead>Sponsors</SectionHead>
        {sponsors?.map((sp: any, i: number) => (
          <div key={i} className="mb-1">
            <span className="text-terminal-text">{sp.full_name}</span>
            <span className="text-terminal-muted text-[10px] ml-1">Dist {sp.district} ({sp.sponsor_type})</span>
          </div>
        ))}

        {hearings?.length > 0 && (
          <>
            <SectionHead>Hearings</SectionHead>
            {hearings.map((h: any, i: number) => (
              <div key={i} className="text-terminal-muted">{h.committee_name} — {h.notice_date?.substring(0, 10)}</div>
            ))}
          </>
        )}
        {amendments?.length > 0 && (
          <>
            <SectionHead>Amendments ({amendments.length})</SectionHead>
            {amendments.slice(0, 5).map((a: any, i: number) => (
              <div key={i} className="text-terminal-muted text-[10px]">
                {a.lr_number && <span className="text-terminal-accent mr-1">{a.lr_number}</span>}
                {a.description?.substring(0, 70)}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="md:col-span-2">
        <SectionHead>Action History</SectionHead>
        {!actions?.length && <div className="text-terminal-muted">No actions.</div>}
        <div className="max-h-48 overflow-y-auto space-y-1">
          {actions?.map((a: any, i: number) => (
            <div key={i} className="flex gap-3 items-start border-b border-terminal-border pb-1">
              <span className="text-terminal-muted whitespace-nowrap">{a.pub_date?.substring(0, 10)}</span>
              <span className="text-terminal-text flex-1">{a.description}</span>
              {a.journal_link && <span className="text-terminal-accent text-[10px] whitespace-nowrap">journal ↗</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="md:col-span-3">
        <SectionHead>Roll Call Votes</SectionHead>
        <RollCallVotes billId={billId} />
      </div>
    </div>
  )
}

function BillsPanel() {
  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState('')
  const [billType, setBillType] = useState('')
  const [district, setDistrict] = useState('')
  const [bills, setBills] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, any>>({})
  const [detailLoading, setDetailLoading] = useState<string | null>(null)

  const doSearch = async () => {
    setLoading(true); setSearched(true)
    try {
      const p = new URLSearchParams()
      if (search.trim()) p.set('q', search.trim())
      if (subject.trim()) p.set('subject', subject.trim())
      if (billType) p.set('bill_type', billType)
      if (district.trim()) p.set('district', district.trim())
      p.set('limit', '200')
      const data = await fetch(`${API}/bills?${p}`).then(r => r.json())
      setBills(data.bills ?? [])
    } catch {}
    setLoading(false)
  }

  const toggle = async (bill_id: string) => {
    if (expanded === bill_id) { setExpanded(null); return }
    setExpanded(bill_id)
    if (detail[bill_id]) return
    setDetailLoading(bill_id)
    try {
      const data = await fetch(`${API}/bills/${bill_id}`).then(r => r.json())
      setDetail(d => ({ ...d, [bill_id]: data }))
    } catch {}
    setDetailLoading(null)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-terminal-border flex flex-wrap gap-2 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="Search title or description…"
          className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono w-52" />
        <input value={subject} onChange={e => setSubject(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="Subject (e.g. FIREARMS)"
          className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono w-36" />
        <select value={billType} onChange={e => setBillType(e.target.value)}
          className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent font-mono">
          <option value="">All Types</option>
          <option value="HB">HB — House Bill</option>
          <option value="HJR">HJR — Joint Resolution</option>
          <option value="HR">HR — House Resolution</option>
          <option value="HCR">HCR — Concurrent Resolution</option>
        </select>
        <input value={district} onChange={e => setDistrict(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="District #"
          className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono w-24" />
        <button onClick={doSearch}
          className="px-4 py-1.5 border border-terminal-accent text-terminal-accent text-xs uppercase tracking-wider hover:bg-terminal-accent hover:text-terminal-bg transition-colors font-mono">
          Search
        </button>
        {bills.length > 0 && <span className="text-terminal-muted text-xs">{bills.length} bills</span>}
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? <Spinner /> : !searched ? (
          <div className="text-terminal-muted text-xs text-center py-12">Enter search terms above and press Search.</div>
        ) : !bills.length ? (
          <div className="text-terminal-muted text-xs text-center py-12">No bills found.</div>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0 bg-terminal-panel text-terminal-muted uppercase tracking-wider text-[10px]">
              <tr>
                <th className="text-left px-3 py-2">Bill</th>
                <th className="text-left px-3 py-2">Title</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">Last Action</th>
                <th className="text-left px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {bills.map(b => (
                <Fragment key={b.bill_id}>
                  <tr onClick={() => toggle(b.bill_id)}
                    className="border-b border-terminal-border cursor-pointer hover:bg-terminal-panel text-terminal-text">
                    <td className="px-3 py-2 text-terminal-accent whitespace-nowrap">{b.bill_string}</td>
                    <td className="px-3 py-2 max-w-xs">{b.short_title?.substring(0, 80)}{(b.short_title?.length ?? 0) > 80 ? '…' : ''}</td>
                    <td className="px-3 py-2 text-terminal-muted max-w-xs hidden md:table-cell">{b.last_action?.substring(0, 50)}</td>
                    <td className="px-3 py-2 text-terminal-muted whitespace-nowrap">{b.last_action_date?.substring(0, 10)}</td>
                  </tr>
                  {expanded === b.bill_id && (
                    <tr>
                      <td colSpan={4} className="bg-terminal-bg border-b border-terminal-border p-0">
                        <BillDetail data={detail[b.bill_id]} loading={detailLoading === b.bill_id} billId={b.bill_id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Committees tab ────────────────────────────────────────────────────────────

function CommitteeDetail({ data, loading, onCorrelate }: { data: any; loading: boolean; onCorrelate: () => void }) {
  if (loading) return <Spinner />
  if (!data) return <div className="text-terminal-muted text-xs p-4">No data.</div>
  const { committee, members } = data
  return (
    <div className="p-4 text-xs font-mono">
      <div className="flex items-center justify-between mb-3">
        <span className="text-terminal-accent uppercase tracking-wider">{committee?.name}</span>
        <button onClick={onCorrelate}
          className="px-3 py-1 border border-terminal-accent text-terminal-accent text-[10px] uppercase tracking-wider hover:bg-terminal-accent hover:text-terminal-bg transition-colors">
          CORRELATE COMMITTEE →
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {members?.map((m: any, i: number) => (
          <div key={i}>
            <div className="text-[10px] text-terminal-muted">{m.position}</div>
            <div className="text-terminal-text">Dist {m.district}</div>
            <div className="text-terminal-muted">{m.full_name}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommitteesPanel({ onCorrelate }: { onCorrelate: (committee_id: string) => void }) {
  const [search, setSearch] = useState('')
  const [committees, setCommittees] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, any>>({})
  const [detailLoading, setDetailLoading] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/committees`).then(r => r.json()).then(data => setCommittees(data.committees ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const filtered = search.trim() ? committees.filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase())) : committees

  const toggle = async (committee_id: string) => {
    if (expanded === committee_id) { setExpanded(null); return }
    setExpanded(committee_id)
    if (detail[committee_id]) return
    setDetailLoading(committee_id)
    try {
      const data = await fetch(`${API}/committees/${committee_id}`).then(r => r.json())
      setDetail(d => ({ ...d, [committee_id]: data }))
    } catch {}
    setDetailLoading(null)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-terminal-border flex gap-2 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter committees…"
          className="flex-1 max-w-sm bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono" />
        <span className="text-terminal-muted text-xs">{filtered.length} committees</span>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? <Spinner /> : (
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0 bg-terminal-panel text-terminal-muted uppercase tracking-wider text-[10px]">
              <tr>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <Fragment key={c.committee_id}>
                  <tr onClick={() => toggle(c.committee_id)}
                    className="border-b border-terminal-border cursor-pointer hover:bg-terminal-panel text-terminal-text">
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 text-terminal-muted">{c.type}</td>
                  </tr>
                  {expanded === c.committee_id && (
                    <tr>
                      <td colSpan={2} className="bg-terminal-bg border-b border-terminal-border p-0">
                        <CommitteeDetail data={detail[c.committee_id]} loading={detailLoading === c.committee_id}
                          onCorrelate={() => onCorrelate(c.committee_id)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Correlate result views ────────────────────────────────────────────────────

function IssueResult({ data }: { data: any }) {
  const { issue_label, bills, sponsors } = data
  if (!bills?.length && !sponsors?.length) return <div className="text-terminal-muted text-xs py-6">No data found for this issue.</div>
  return (
    <div>
      <div className="text-terminal-accent font-bold mb-4">{issue_label} — {bills?.length} bills · {sponsors?.length} sponsors</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bills */}
        <div>
          <SectionHead>Bills Tagged to This Issue</SectionHead>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {bills?.map((b: any, i: number) => (
              <div key={i} className="border-b border-terminal-border pb-1 text-xs">
                <span className="text-terminal-accent font-mono">{b.bill_string}</span>
                <span className="text-terminal-muted text-[10px] ml-2">{b.last_action_date?.substring(0, 10)}</span>
                <div className="text-terminal-text">{b.short_title?.substring(0, 70)}{(b.short_title?.length ?? 0) > 70 ? '…' : ''}</div>
                <div className="text-terminal-muted text-[10px]">{b.last_action?.substring(0, 60)}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Sponsors */}
        <div>
          <SectionHead>Sponsors (All Bills in This Area)</SectionHead>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {sponsors?.map((sp: any, i: number) => (
              <div key={i} className="border border-terminal-border p-2">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <span className="text-terminal-text text-xs">{sp.full_name}</span>
                    <span className="text-terminal-muted text-[10px] ml-1">Dist {sp.district}</span>
                    {sp.party && <span className="ml-1"><PartyBadge party={sp.party} /></span>}
                  </div>
                  <div className="text-right text-[10px]">
                    <div className="text-terminal-accent">{sp.bill_count} bills</div>
                    {sp.total_raised != null && <div className="text-terminal-green">{fmt(sp.total_raised)}</div>}
                  </div>
                </div>
                {sp.top_employer_sectors?.slice(0, 3).map((e: any, j: number) => (
                  <div key={j} className="flex justify-between text-[10px] text-terminal-muted">
                    <span>{e.contributor_employer}</span>
                    <span className="text-terminal-text ml-4">{fmt(e.total)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MemberCorrelateResult({ data }: { data: any }) {
  const { member, issue_scores, top_employer_sectors, top_donors, legislative_subjects, committee_memberships } = data
  const topScore = Math.max(...(issue_scores?.map((s: any) => s.activity_score ?? 0) ?? [1]), 1)
  return (
    <div>
      <div className="mb-4">
        <div className="text-terminal-accent font-bold text-sm">{member?.full_name}</div>
        <div className="text-terminal-muted text-xs font-mono">
          District {member?.district} · <PartyBadge party={member?.party || ''} /> · {member?.county} County
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <SectionHead>Legislative Priorities (by issue area)</SectionHead>
          {issue_scores?.filter((s: any) => (s.activity_score ?? 0) > 0).slice(0, 12).map((s: any, i: number) => (
            <div key={i} className="flex items-center gap-2 mb-1.5 text-xs">
              <div className="w-36 text-terminal-text truncate">{s.label}</div>
              <div className="flex-1 bg-terminal-border h-1.5 relative min-w-16">
                <div className="absolute top-0 left-0 h-full bg-terminal-accent transition-all"
                  style={{ width: `${Math.min(100, ((s.activity_score ?? 0) / topScore) * 100)}%` }} />
              </div>
              <div className="text-terminal-muted text-[10px] w-8 text-right">{(s.activity_score ?? 0).toFixed(1)}</div>
            </div>
          ))}
          {(!issue_scores?.find((s: any) => s.activity_score > 0)) && (
            <div className="text-terminal-muted text-xs">No bills scored to issue areas yet.</div>
          )}
          {legislative_subjects?.length > 0 && (
            <>
              <SectionHead>Raw Legislative Subjects</SectionHead>
              {legislative_subjects.slice(0, 8).map((s: any, i: number) => (
                <div key={i} className="flex justify-between text-[10px] text-terminal-muted mb-0.5">
                  <span>{s.subject}</span>
                  <span className="text-terminal-text ml-4">{s.bill_count} bills</span>
                </div>
              ))}
            </>
          )}
        </div>
        <div>
          <SectionHead>Top Donor Employer Sectors</SectionHead>
          {!top_employer_sectors?.length && <div className="text-terminal-muted text-xs">No employer data (MEC link not found or no contributions).</div>}
          {top_employer_sectors?.slice(0, 10).map((e: any, i: number) => (
            <div key={i} className="flex justify-between text-xs mb-1">
              <span className="text-terminal-text truncate max-w-48">{e.contributor_employer || 'Unknown'}</span>
              <span className="text-terminal-green ml-4 whitespace-nowrap">{fmt(e.total)}</span>
            </div>
          ))}
          {top_donors?.length > 0 && (
            <>
              <SectionHead>Top Individual Donors</SectionHead>
              {top_donors.slice(0, 8).map((d: any, i: number) => (
                <div key={i} className="flex justify-between text-xs mb-1">
                  <span className="text-terminal-text truncate max-w-48">{d.contributor_name}</span>
                  <span className="text-terminal-green ml-4 whitespace-nowrap">{fmt(d.total_amount)}</span>
                </div>
              ))}
            </>
          )}
          {committee_memberships?.length > 0 && (
            <>
              <SectionHead>Committee Memberships</SectionHead>
              <div className="flex flex-wrap gap-1.5">
                {committee_memberships.map((c: any, i: number) => (
                  <span key={i} className="text-[10px] border border-terminal-border text-terminal-muted px-2 py-0.5">
                    {c.position}: {c.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CommitteeCorrelateResult({ data }: { data: any }) {
  const { committee, members } = data
  return (
    <div>
      <div className="text-terminal-accent font-bold mb-1">{committee?.name}</div>
      <div className="text-terminal-muted text-xs mb-4">{members?.length} members — campaign finance analysis</div>
      <div className="space-y-3">
        {members?.map((m: any, i: number) => (
          <div key={i} className="border border-terminal-border p-3">
            <div className="flex justify-between items-start mb-2 flex-wrap gap-1">
              <div>
                <span className="text-terminal-text font-semibold text-xs">{m.full_name}</span>
                <span className="text-terminal-muted text-[10px] ml-2">Dist {m.district} · {m.position}</span>
                {m.party && <span className="ml-2 text-[10px]"><PartyBadge party={m.party} /></span>}
              </div>
              {m.total_raised != null
                ? <span className="text-terminal-green text-xs">Raised: {fmt(m.total_raised)}</span>
                : <span className="text-terminal-muted text-[10px]">No MEC link</span>}
            </div>
            {m.top_employer_sectors?.slice(0, 4).map((e: any, j: number) => (
              <div key={j} className="flex justify-between text-[10px] text-terminal-muted">
                <span>{e.contributor_employer || 'Unknown employer'}</span>
                <span className="text-terminal-text ml-4">{fmt(e.total)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function IndustryResult({ data }: { data: any }) {
  const { employer_query, reps } = data
  if (!reps?.length) return <div className="text-terminal-muted text-xs py-6">No representatives found receiving money from "{employer_query}".</div>
  return (
    <div>
      <div className="text-terminal-accent font-bold mb-1">Industry: "{employer_query}"</div>
      <div className="text-terminal-muted text-xs mb-4">{reps.length} representatives received contributions</div>
      <div className="space-y-3">
        {reps.map((r: any, i: number) => (
          <div key={i} className="border border-terminal-border p-3">
            <div className="flex justify-between items-start mb-2 flex-wrap gap-1">
              <div>
                <span className="text-terminal-text font-semibold text-xs">{r.full_name}</span>
                <span className="text-terminal-muted text-[10px] ml-2">Dist {r.district}</span>
                {r.party && <span className="ml-2"><PartyBadge party={r.party} /></span>}
              </div>
              <div className="text-right">
                <div className="text-terminal-green text-xs">{fmt(r.total_from_employer)}</div>
                <div className="text-terminal-muted text-[10px]">{r.contributions} contributions</div>
              </div>
            </div>
            {r.committees?.length > 0 && (
              <div className="text-[10px] text-terminal-muted mb-1">Committees: {r.committees.slice(0, 3).join(', ')}{r.committees.length > 3 ? ` +${r.committees.length - 3}` : ''}</div>
            )}
            {r.legislative_subjects?.length > 0 && (
              <div className="text-[10px] text-terminal-muted">Top subjects: {r.legislative_subjects.slice(0, 4).map((s: any) => s.subject).join(', ')}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function BillDonorsResult({ data }: { data: any }) {
  const { bill, subjects, sponsors } = data
  return (
    <div>
      <div className="text-terminal-accent font-bold mb-1 font-mono">{bill?.bill_string}</div>
      <div className="text-terminal-text text-xs mb-1">{bill?.short_title}</div>
      <div className="text-terminal-muted text-[10px] mb-4">Subjects: {(subjects as string[])?.join(', ') || 'None'}</div>
      {!sponsors?.length && <div className="text-terminal-muted text-xs">No sponsors found.</div>}
      <div className="space-y-4">
        {sponsors?.map((sp: any, i: number) => (
          <div key={i} className="border border-terminal-border p-3">
            <div className="flex justify-between items-start mb-2 flex-wrap gap-1">
              <div>
                <span className="text-terminal-text font-semibold text-xs">{sp.full_name}</span>
                <span className="text-terminal-muted text-[10px] ml-2">Dist {sp.district} · {sp.sponsor_type}</span>
              </div>
              {sp.total_raised != null
                ? <span className="text-terminal-green text-xs">Raised: {fmt(sp.total_raised)}</span>
                : <span className="text-terminal-muted text-[10px]">No MEC link</span>}
            </div>
            {sp.top_employer_sectors?.length > 0 && (
              <>
                <div className="text-[10px] text-terminal-muted uppercase tracking-wider mb-1">Top donor employers:</div>
                {sp.top_employer_sectors.slice(0, 6).map((e: any, j: number) => (
                  <div key={j} className="flex justify-between text-[10px]">
                    <span className="text-terminal-text">{e.contributor_employer}</span>
                    <span className="text-terminal-green ml-4">{fmt(e.total)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ChangesView({ changes, loading }: { changes: any[]; loading: boolean }) {
  if (loading) return <Spinner />
  if (!changes.length) return <div className="text-terminal-muted text-xs py-6 text-center">No recent changes found.</div>
  return (
    <div>
      <SectionHead>Bill Status Changes — Recent Sync</SectionHead>
      <div className="space-y-0.5 text-xs font-mono">
        {changes.map((c: any, i: number) => (
          <div key={i} className="flex gap-3 border-b border-terminal-border pb-1 items-start">
            <span className="text-terminal-muted whitespace-nowrap text-[10px]">{c.changed_at?.substring(0, 16)}</span>
            <span className="text-terminal-accent font-bold whitespace-nowrap">{c.bill_string}</span>
            <span className="text-terminal-muted whitespace-nowrap">{c.field}:</span>
            <span className="text-terminal-text flex-1">{c.new_value?.substring(0, 100)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Anomaly detection result ──────────────────────────────────────────────────

function AnomaliesResult({ data }: { data: any }) {
  const { anomalies, count } = data
  if (!anomalies?.length) return <div className="text-terminal-muted text-xs py-6">No anomalies detected. Try lowering thresholds or running a sync first.</div>
  const maxSignal = Math.max(...anomalies.map((a: any) => a.signal_strength), 1)
  return (
    <div>
      <div className="text-terminal-accent font-bold mb-1">Detected Correlations — {count} Representatives</div>
      <div className="text-terminal-muted text-xs mb-4 leading-relaxed">
        Ranked by signal strength = employer concentration × bill count × log(fundraising scale).
        Higher score = more concentrated donor + legislative pattern.
      </div>
      <div className="space-y-3">
        {anomalies.map((a: any, i: number) => (
          <div key={i} className="border border-terminal-border p-3 relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-terminal-accent/8 pointer-events-none"
              style={{ width: `${(a.signal_strength / maxSignal) * 100}%` }} />
            <div className="relative">
              <div className="flex justify-between items-start mb-2 flex-wrap gap-1">
                <div>
                  <span className="font-bold text-terminal-text text-xs">#{i + 1} {a.full_name}</span>
                  <span className="text-terminal-muted text-[10px] ml-2">Dist {a.district}</span>
                  <span className="ml-2"><PartyBadge party={a.party} /></span>
                </div>
                <div className="text-right text-[10px]">
                  <div className="text-terminal-accent font-bold">Signal: {a.signal_strength.toFixed(2)}</div>
                  <div className="text-terminal-muted">Raised: {fmt(a.total_raised)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-[10px] text-terminal-muted uppercase tracking-wider mb-0.5">Top Donor Employer</div>
                  <div className="text-terminal-green">{a.top_employer}</div>
                  <div className="text-terminal-muted text-[10px]">{fmt(a.employer_total)} — {a.employer_pct}% of total raised</div>
                </div>
                <div>
                  <div className="text-[10px] text-terminal-muted uppercase tracking-wider mb-0.5">Top Legislative Issue</div>
                  <div className="text-amber-400">{a.top_issue_label}</div>
                  <div className="text-terminal-muted text-[10px]">{a.issue_bill_count} bills sponsored</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Timeline view ─────────────────────────────────────────────────────────────

function TimelineView({ data }: { data: any }) {
  const { member, events } = data
  const [filter, setFilter] = useState<'all' | 'donation' | 'bill'>('all')
  if (!events?.length) return <div className="text-terminal-muted text-xs py-6">No timeline data available. This member may not have a MEC link or no bills in the current session.</div>

  const donations = (events as any[]).filter(e => e.type === 'donation')
  const billEvents = (events as any[]).filter(e => e.type === 'bill_intro' || e.type === 'bill_action')
  const totalDonated = donations.reduce((sum: number, e: any) => sum + (e.amount ?? 0), 0)

  const visible = filter === 'all' ? events
    : filter === 'donation' ? donations
    : billEvents

  return (
    <div>
      <div className="text-terminal-accent font-bold mb-1">{member?.full_name} — Legislative & Donor Timeline</div>
      <div className="flex gap-4 text-xs text-terminal-muted mb-3">
        <span><span className="text-terminal-green">●</span> {donations.length} donations · {fmt(totalDonated)}</span>
        <span><span className="text-purple-400">●</span> {billEvents.length} bill events</span>
      </div>
      <div className="flex gap-1 mb-4">
        {(['all', 'donation', 'bill'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs uppercase tracking-wider border transition-colors ${
              filter === f ? 'border-terminal-accent text-terminal-accent' : 'border-terminal-border text-terminal-muted hover:text-terminal-text'
            }`}>
            {f === 'all' ? 'All Events' : f === 'donation' ? 'Donations Only' : 'Bills Only'}
          </button>
        ))}
      </div>
      <div className="relative max-h-[500px] overflow-y-auto">
        <div className="absolute left-20 top-0 bottom-0 w-px bg-terminal-border pointer-events-none" />
        {visible.map((e: any, i: number) => (
          <div key={i} className="flex gap-3 items-start mb-1 group">
            <div className="w-20 text-[10px] text-terminal-muted text-right shrink-0 pt-1">{e.date?.substring(0, 7)}</div>
            <div className="relative pl-4 flex-1 pb-1.5 border-b border-terminal-border/30">
              <div className="absolute left-[-4px] top-1.5 w-2.5 h-2.5 rounded-full shrink-0 border-2 border-terminal-bg" style={{
                background: e.type === 'donation' ? '#22c55e' : e.type === 'bill_intro' ? '#a78bfa' : '#374151'
              }} />
              <div className={`text-xs ${e.type === 'donation' ? 'text-terminal-green' : e.type === 'bill_intro' ? 'text-purple-300' : 'text-terminal-muted'}`}>
                {e.type === 'donation' && (
                  <>
                    <span className="text-terminal-text">{e.label}</span>
                    {e.employer && <span className="text-terminal-muted text-[10px] ml-1">({e.employer})</span>}
                    <span className="text-terminal-green ml-2">{fmt(e.amount)}</span>
                  </>
                )}
                {e.type === 'bill_intro' && (
                  <>
                    <span className="text-purple-300 font-mono font-bold">{e.label}</span>
                    <span className="text-terminal-muted text-[10px] ml-1">introduced</span>
                    {e.sponsor_type === 'CoSponsor' && <span className="text-[10px] text-terminal-muted ml-1">(co-sponsor)</span>}
                    {e.title && <div className="text-terminal-muted text-[10px]">{e.title.substring(0, 70)}</div>}
                  </>
                )}
                {e.type === 'bill_action' && (
                  <>
                    <span className="text-terminal-accent font-mono">{e.label}</span>
                    <span className="text-terminal-muted text-[10px] ml-1">{e.description?.substring(0, 80)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DonorNetworkResult({ data }: { data: any }) {
  const { query, total_donated, total_reps, reps, committee_exposure } = data
  const [expanded, setExpanded] = useState<string | null>(null)
  if (!total_reps) return <div className="text-terminal-muted text-xs py-6">No representatives found receiving money from "{query}".</div>
  return (
    <div>
      <div className="mb-4">
        <div className="text-terminal-accent font-bold text-sm font-mono">DONOR: "{query}"</div>
        <div className="flex gap-6 text-xs text-terminal-muted mt-1 font-mono">
          <span><span className="text-terminal-green">{fmt(total_donated)}</span> total donated</span>
          <span><span className="text-terminal-text">{total_reps}</span> representatives funded</span>
        </div>
      </div>

      {committee_exposure?.length > 0 && (
        <div className="mb-5">
          <SectionHead>Committee Penetration — Same Donor Funds Multiple Members</SectionHead>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {committee_exposure.map((ce: any, i: number) => (
              <div key={i} className="border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-amber-400 font-semibold">{ce.committee_name}</span>
                  <span className="text-amber-400 text-[10px] font-mono">{ce.funded_reps} FUNDED REPS</span>
                </div>
                <div className="text-terminal-muted text-[10px]">Districts: {ce.districts.join(', ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <SectionHead>Funded Representatives</SectionHead>
      <div className="space-y-2">
        {reps?.map((r: any, i: number) => {
          const isOpen = expanded === r.district
          return (
            <div key={i} className="border border-terminal-border">
              <button className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-terminal-panel transition-colors"
                onClick={() => setExpanded(isOpen ? null : r.district)}>
                <div className="flex-1 min-w-0">
                  <span className="text-terminal-text text-xs font-semibold">{r.full_name}</span>
                  <span className="text-terminal-muted text-[10px] ml-2">Dist {r.district} · {r.county}</span>
                  {r.party && <span className="ml-2 text-[10px]"><PartyBadge party={r.party} /></span>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-terminal-green text-xs">{fmt(r.total_received)}</div>
                  <div className="text-terminal-muted text-[10px]">{r.contribution_count} contribs · {r.first_year}–{r.last_year}</div>
                </div>
                <span className="text-terminal-muted text-[10px]">{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <div className="border-t border-terminal-border px-3 py-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] text-terminal-muted uppercase tracking-wider mb-1">Contributions from Donor</div>
                    {r.contributions_detail?.map((c: any, j: number) => (
                      <div key={j} className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-terminal-text truncate max-w-40">{c.contributor_name || c.contributor_employer}</span>
                        <span className="text-terminal-muted ml-1">{c.mec_year}</span>
                        <span className="text-terminal-green ml-2">{fmt(c.total)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-[10px] text-terminal-muted uppercase tracking-wider mb-1">Committee Memberships</div>
                    {r.committees?.slice(0, 6).map((cn: string, j: number) => (
                      <div key={j} className="text-terminal-muted text-[10px] mb-0.5">{cn}</div>
                    ))}
                  </div>
                  <div>
                    <div className="text-[10px] text-terminal-muted uppercase tracking-wider mb-1">Bills Filed (Session 251)</div>
                    {!r.bills?.length && <div className="text-terminal-muted text-[10px]">None in this session</div>}
                    {r.bills?.map((b: any, j: number) => (
                      <div key={j} className="text-[10px] mb-0.5">
                        <span className="text-terminal-accent font-mono">{b.bill_string}</span>
                        <span className="text-terminal-muted ml-1">{b.short_title?.substring(0, 50)}{(b.short_title?.length ?? 0) > 50 ? '…' : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BillInfluenceResult({ data }: { data: any }) {
  const { bill, sponsors, shared_funders, key_vote, vote_funding_split, pre_vote_contributions } = data
  return (
    <div>
      <div className="mb-4">
        <div className="text-terminal-accent font-bold font-mono">{bill?.bill_string} — Influence Analysis</div>
        <div className="text-terminal-text text-xs mt-0.5">{bill?.short_title}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-5">
        {/* Sponsors */}
        <div>
          <SectionHead>Sponsors</SectionHead>
          {sponsors?.map((sp: any, i: number) => (
            <div key={i} className="text-xs mb-1 flex justify-between">
              <div>
                <span className="text-terminal-text">{sp.full_name}</span>
                <span className="text-terminal-muted text-[10px] ml-1">Dist {sp.district}</span>
                {sp.party && <span className="ml-1 text-[10px]"><PartyBadge party={sp.party} /></span>}
                {!sp.mec_id && <span className="text-terminal-muted text-[10px] ml-1">(no MEC link)</span>}
              </div>
              {sp.total_raised != null && <span className="text-terminal-green text-[10px]">{fmt(sp.total_raised)}</span>}
            </div>
          ))}
        </div>

        {/* Shared funders */}
        <div>
          <SectionHead>Shared Funders Across Sponsors</SectionHead>
          {!shared_funders?.length && (
            <div className="text-terminal-muted text-xs">No shared employer funders found across sponsors{sponsors?.length < 2 ? ' (need ≥2 sponsors)' : ''}.</div>
          )}
          {shared_funders?.map((sf: any, i: number) => (
            <div key={i} className="flex justify-between text-xs mb-1">
              <span className="text-terminal-text truncate max-w-60">{sf.employer}</span>
              <div className="text-right ml-4 shrink-0">
                <span className="text-amber-400 text-[10px]">{sf.rep_count} sponsors</span>
                <span className="text-terminal-green ml-2 text-[10px]">{fmt(sf.total_given)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Vote funding split */}
      {vote_funding_split && (
        <div className="mb-5">
          <SectionHead>Vote Funding Split — Who Had More Money?</SectionHead>
          <div className="text-terminal-muted text-[10px] mb-2">
            {vote_funding_split.vote_date?.substring(0, 10)} · {vote_funding_split.description?.substring(0, 80)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-terminal-green/30 bg-terminal-green/5 p-3 text-center">
              <div className="text-terminal-green text-lg font-mono font-bold">{vote_funding_split.yea_count}</div>
              <div className="text-terminal-green text-[10px] uppercase tracking-wider mb-2">Voted YEA</div>
              <div className="text-terminal-muted text-[10px]">Avg total raised</div>
              <div className="text-terminal-green text-sm font-mono">{fmt(vote_funding_split.yea_avg_total_raised)}</div>
            </div>
            <div className="border border-red-400/30 bg-red-400/5 p-3 text-center">
              <div className="text-red-400 text-lg font-mono font-bold">{vote_funding_split.nay_count}</div>
              <div className="text-red-400 text-[10px] uppercase tracking-wider mb-2">Voted NAY</div>
              <div className="text-terminal-muted text-[10px]">Avg total raised</div>
              <div className="text-red-400 text-sm font-mono">{fmt(vote_funding_split.nay_avg_total_raised)}</div>
            </div>
          </div>
          {vote_funding_split.yea_avg_total_raised != null && vote_funding_split.nay_avg_total_raised != null && (
            <div className="mt-2 text-[10px] text-terminal-muted text-center">
              {vote_funding_split.yea_avg_total_raised > vote_funding_split.nay_avg_total_raised
                ? `YEA voters raised ${fmt(vote_funding_split.yea_avg_total_raised - vote_funding_split.nay_avg_total_raised)} more on average`
                : `NAY voters raised ${fmt(vote_funding_split.nay_avg_total_raised - vote_funding_split.yea_avg_total_raised)} more on average`}
            </div>
          )}
        </div>
      )}
      {!key_vote && (
        <div className="text-terminal-muted text-xs mb-5">No scraped floor vote found for this bill.</div>
      )}

      {/* Pre-vote contributions */}
      {pre_vote_contributions?.length > 0 && (
        <div>
          <SectionHead>Pre-Vote Contributions — 90 Days Before Floor Vote</SectionHead>
          <div className="text-terminal-muted text-[10px] mb-2">Donations made to sponsor committees in the 90 days before {vote_funding_split?.vote_date?.substring(0, 10)}</div>
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-xs font-mono">
              <thead className="sticky top-0 bg-terminal-bg text-terminal-muted uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left px-2 py-1">Date</th>
                  <th className="text-left px-2 py-1">Donor</th>
                  <th className="text-left px-2 py-1 hidden md:table-cell">Employer</th>
                  <th className="text-right px-2 py-1">Amount</th>
                </tr>
              </thead>
              <tbody>
                {pre_vote_contributions.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-terminal-border/50">
                    <td className="px-2 py-1 text-terminal-muted whitespace-nowrap">{c.contribution_date?.substring(0, 10)}</td>
                    <td className="px-2 py-1 text-terminal-text max-w-xs truncate">{c.contributor_name}</td>
                    <td className="px-2 py-1 text-terminal-muted text-[10px] max-w-xs truncate hidden md:table-cell">{c.contributor_employer}</td>
                    <td className="px-2 py-1 text-terminal-green text-right whitespace-nowrap">{fmt(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Network graph (canvas + d3-force) ─────────────────────────────────────────

function NetworkGraph({ data }: { data: { nodes: any[]; edges: any[] } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<ReturnType<typeof forceSimulation> | null>(null)
  const nodesRef = useRef<any[]>([])
  const edgesRef = useRef<any[]>([])
  const panRef = useRef({ x: 0, y: 0, scale: 1 })
  const dragRef = useRef({ active: false, startX: 0, startY: 0, initPanX: 0, initPanY: 0 })
  const hoveredRef = useRef<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<any | null>(null)
  const [selectedNode, setSelectedNode] = useState<any | null>(null)
  const [dims, setDims] = useState({ w: 800, h: 520 })
  const [stats, setStats] = useState({ nodes: 0, edges: 0 })

  const getNodeColor = (type: string, party?: string): string => {
    if (type === 'rep') return party === 'REP' ? '#ef4444' : party === 'DEM' ? '#3b82f6' : '#6b7280'
    if (type === 'employer') return '#22c55e'
    if (type === 'issue') return '#f59e0b'
    if (type === 'bill') return '#8b5cf6'
    if (type === 'committee') return '#06b6d4'
    return '#6b7280'
  }

  const getNodeRadius = useCallback((n: any): number => {
    if (n.type === 'issue' || n.type === 'committee') return 18
    if (n.type === 'rep') return 14
    if (n.type === 'employer') return Math.min(22, Math.max(8, Math.log10(Math.max(n.total ?? 1000, 1000)) * 4))
    return 5
  }, [])

  const getEdgeColor = (type: string): string => {
    if (type === 'donation') return '#22c55e'
    if (type === 'sponsored' || type === 'legislates') return '#a78bfa'
    if (type === 'tagged') return '#f59e0b'
    if (type === 'member_of') return '#06b6d4'
    return '#4b5563'
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const { x: px, y: py, scale: ps } = panRef.current
    const hov = hoveredRef.current
    const sel = selectedRef.current

    ctx.save()
    ctx.translate(px, py)
    ctx.scale(ps, ps)

    // Edges
    for (const e of edgesRef.current) {
      const s = typeof e.source === 'object' ? e.source : nodesRef.current.find(n => n.id === e.source)
      const t = typeof e.target === 'object' ? e.target : nodesRef.current.find(n => n.id === e.target)
      if (!s?.x || !t?.x) continue
      const isHl = hov === s.id || hov === t.id || sel === s.id || sel === t.id
      const maxW = e.type === 'donation' ? Math.min(6, Math.log10(Math.max(e.weight ?? 1, 100)) * 1.4) : 1.5
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y)
      ctx.strokeStyle = getEdgeColor(e.type)
      ctx.lineWidth = isHl ? maxW + 2 : maxW
      ctx.globalAlpha = isHl ? 0.75 : 0.18
      ctx.stroke(); ctx.globalAlpha = 1
    }

    // Nodes
    for (const n of nodesRef.current) {
      if (n.x == null) continue
      const r = getNodeRadius(n)
      const isHov = hov === n.id; const isSel = sel === n.id
      const dim = !!(hov && !isHov && !isSel)
      ctx.beginPath(); ctx.arc(n.x, n.y, isHov || isSel ? r + 3 : r, 0, Math.PI * 2)
      ctx.fillStyle = getNodeColor(n.type, n.party)
      ctx.globalAlpha = dim ? 0.12 : isHov || isSel ? 0.95 : 0.72
      ctx.fill()
      if (isSel || isHov) {
        ctx.strokeStyle = isSel ? '#fff' : getNodeColor(n.type, n.party)
        ctx.lineWidth = isSel ? 2.5 : 1.5; ctx.globalAlpha = 1; ctx.stroke()
      }
      ctx.globalAlpha = 1
      if ((n.type !== 'bill' || isHov) && ps >= 0.2) {
        const label = n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label
        ctx.fillStyle = dim ? '#4b5563' : '#d1d5db'
        ctx.font = `${n.type === 'issue' || n.type === 'committee' ? 10 : 9}px monospace`
        ctx.textAlign = 'center'; ctx.globalAlpha = dim ? 0.35 : 1
        ctx.fillText(label, n.x, n.y + r + 12); ctx.globalAlpha = 1
      }
    }
    ctx.restore()
  }, [getNodeRadius])

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDims({ w: Math.max(400, width), h: Math.max(400, height) })
    })
    ro.observe(el); return () => ro.disconnect()
  }, [])

  useEffect(() => {
    simRef.current?.stop()
    if (!data.nodes.length) return
    const { w, h } = dims
    const nodes = data.nodes.map(n => ({ ...n, x: w / 2 + (Math.random() - 0.5) * 200, y: h / 2 + (Math.random() - 0.5) * 200 }))
    const edges = data.edges.map(e => ({ ...e }))
    nodesRef.current = nodes; edgesRef.current = edges
    setStats({ nodes: nodes.length, edges: edges.length })
    const sim = forceSimulation(nodes)
      .force('link', forceLink(edges).id((d: any) => d.id)
        .distance((e: any) => e.type === 'tagged' ? 70 : e.type === 'donation' ? 140 : 100)
        .strength(0.4))
      .force('charge', forceManyBody().strength((n: any) =>
        n.type === 'issue' || n.type === 'committee' ? -380 : n.type === 'rep' ? -260 : n.type === 'employer' ? -200 : -80
      ))
      .force('center', forceCenter(w / 2, h / 2))
      .force('collision', forceCollide((n: any) => getNodeRadius(n) + 6))
    sim.on('tick', draw); simRef.current = sim
  }, [data, dims, draw, getNodeRadius])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) { canvas.width = dims.w; canvas.height = dims.h }
    draw()
  }, [dims, draw])

  const screenToWorld = useCallback((ex: number, ey: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { wx: 0, wy: 0 }
    return { wx: (ex - rect.left - panRef.current.x) / panRef.current.scale, wy: (ey - rect.top - panRef.current.y) / panRef.current.scale }
  }, [])

  const findNodeAt = useCallback((ex: number, ey: number): any | null => {
    const { wx, wy } = screenToWorld(ex, ey)
    for (const n of nodesRef.current) {
      if (n.x == null) continue
      const r = getNodeRadius(n) + 5
      if ((n.x - wx) ** 2 + (n.y - wy) ** 2 <= r * r) return n
    }
    return null
  }, [screenToWorld, getNodeRadius])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const found = findNodeAt(e.clientX, e.clientY)
    if (found) {
      const newSel = selectedRef.current === found.id ? null : found.id
      selectedRef.current = newSel; setSelectedNode(newSel ? found : null); draw(); return
    }
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, initPanX: panRef.current.x, initPanY: panRef.current.y }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active) {
      panRef.current.x = dragRef.current.initPanX + e.clientX - dragRef.current.startX
      panRef.current.y = dragRef.current.initPanY + e.clientY - dragRef.current.startY
      draw(); return
    }
    const found = findNodeAt(e.clientX, e.clientY)
    const newId = found?.id ?? null
    if (newId !== hoveredRef.current) { hoveredRef.current = newId; setHoveredNode(found ?? null); draw() }
  }

  const handleMouseUp = () => { dragRef.current.active = false }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.12 : 0.88
    const newScale = Math.max(0.15, Math.min(5, panRef.current.scale * factor))
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left; const my = e.clientY - rect.top
    panRef.current.x = mx - (mx - panRef.current.x) * (newScale / panRef.current.scale)
    panRef.current.y = my - (my - panRef.current.y) * (newScale / panRef.current.scale)
    panRef.current.scale = newScale; draw()
  }

  const inspected = selectedNode ?? hoveredNode

  return (
    <div ref={containerRef} className="w-full h-full relative select-none" style={{ minHeight: 480 }}>
      {/* Legend */}
      <div className="absolute top-2 left-2 z-10 bg-terminal-bg/90 border border-terminal-border p-2 text-[9px] font-mono space-y-0.5 backdrop-blur">
        {[['rep', 'Representative'], ['employer', 'Donor Employer'], ['issue', 'Issue Area'], ['bill', 'Bill'], ['committee', 'Committee']].map(([t, l]) => (
          <div key={t} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getNodeColor(t) }} />
            <span className="text-terminal-muted">{l}</span>
          </div>
        ))}
        <div className="border-t border-terminal-border pt-0.5 mt-1 space-y-0.5">
          <div className="flex items-center gap-1.5"><div className="w-4 h-px bg-green-400" /><span className="text-terminal-muted">Donation</span></div>
          <div className="flex items-center gap-1.5"><div className="w-4 h-px bg-purple-400" /><span className="text-terminal-muted">Sponsors / Legislates</span></div>
          <div className="flex items-center gap-1.5"><div className="w-4 h-px bg-amber-400" /><span className="text-terminal-muted">Tagged to Issue</span></div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        {[['＋', 1.25], ['－', 0.8]].map(([label, factor]) => (
          <button key={label as string} onClick={() => {
            const ns = Math.max(0.15, Math.min(5, panRef.current.scale * (factor as number)))
            const c = canvasRef.current?.getBoundingClientRect()
            if (c) {
              const mx = c.width / 2; const my = c.height / 2
              panRef.current.x = mx - (mx - panRef.current.x) * (ns / panRef.current.scale)
              panRef.current.y = my - (my - panRef.current.y) * (ns / panRef.current.scale)
            }
            panRef.current.scale = ns; draw()
          }} className="w-7 h-7 bg-terminal-bg border border-terminal-border text-terminal-muted hover:text-terminal-accent text-sm flex items-center justify-center font-mono">
            {label}
          </button>
        ))}
        <button onClick={() => { panRef.current = { x: 0, y: 0, scale: 1 }; draw() }}
          className="w-7 h-7 bg-terminal-bg border border-terminal-border text-terminal-muted hover:text-terminal-accent text-[9px] flex items-center justify-center uppercase">
          RST
        </button>
      </div>

      {/* Stats bar */}
      <div className="absolute bottom-2 left-2 z-10 text-[9px] text-terminal-muted font-mono">
        {stats.nodes} nodes · {stats.edges} edges · scroll=zoom · drag=pan · click=inspect
      </div>

      <canvas ref={canvasRef} width={dims.w} height={dims.h}
        className="cursor-crosshair" style={{ display: 'block', width: '100%', height: '100%' }}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel} />

      {/* Inspect panel */}
      {inspected && (
        <div className="absolute bottom-8 right-2 z-20 bg-terminal-bg border border-terminal-accent p-3 text-xs font-mono max-w-xs shadow-xl">
          <div className="text-terminal-accent font-bold uppercase tracking-wider mb-1 text-[10px]">{inspected.type}</div>
          <div className="text-terminal-text font-semibold">{inspected.label}</div>
          {inspected.district && <div className="text-terminal-muted text-[10px]">District {inspected.district}</div>}
          {inspected.party && (
            <div className="text-[10px]"><PartyBadge party={inspected.party} /></div>
          )}
          {inspected.total != null && <div className="text-terminal-green text-[10px]">{fmt(inspected.total)} donated</div>}
          {inspected.title && <div className="text-terminal-muted text-[10px] mt-1 leading-relaxed">{inspected.title.substring(0, 100)}</div>}
          {inspected.role && <div className="text-terminal-muted text-[10px]">Role: {inspected.role}</div>}
          {inspected.sponsor_type && <div className="text-terminal-muted text-[10px]">{inspected.sponsor_type}</div>}
        </div>
      )}
    </div>
  )
}

// ── Correlate panel ───────────────────────────────────────────────────────────

function CorrelatePanel({ initialMember, initialCommittee }: { initialMember?: string; initialCommittee?: string }) {
  const [mode, setMode] = useState<CorrMode>(initialMember ? 'member' : initialCommittee ? 'committee' : 'issue')
  const [issueId, setIssueId] = useState('gun_policy')
  const [memberDistrict, setMemberDistrict] = useState(initialMember ?? '')
  const [cmteId, setCmteId] = useState(initialCommittee ?? '')
  const [employer, setEmployer] = useState('')
  const [donorQuery, setDonorQuery] = useState('')
  const [billId, setBillId] = useState('')
  const [networkFocus, setNetworkFocus] = useState<NetworkFocus>('issue')
  const [networkIssue, setNetworkIssue] = useState('gun_policy')
  const [networkDistrict, setNetworkDistrict] = useState('')
  const [networkEmployer, setNetworkEmployer] = useState('')
  const [networkCmte, setNetworkCmte] = useState('')
  const [timelineDistrict, setTimelineDistrict] = useState(initialMember ?? '')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [changes, setChanges] = useState<any[]>([])
  const [changesLoading, setChangesLoading] = useState(false)
  const didAutoRun = useRef(false)

  const runAnalysis = useCallback(async (m: CorrMode, arg: string, arg2?: string) => {
    if (!arg.trim() && m !== 'issue' && m !== 'anomalies') return
    setLoading(true); setResult(null)
    try {
      let url = ''
      if (m === 'issue') url = `${API}/correlate/issue/${encodeURIComponent(arg)}`
      else if (m === 'member') url = `${API}/correlate/member/${arg}`
      else if (m === 'committee') url = `${API}/correlate/committee/${arg}`
      else if (m === 'industry') url = `${API}/correlate/donor-industry?employer=${encodeURIComponent(arg)}`
      else if (m === 'donor') url = `${API}/donor-network?q=${encodeURIComponent(arg)}`
      else if (m === 'bill') url = `${API}/bills/${arg}/influence`
      else if (m === 'anomalies') url = `${API}/correlate/anomalies?limit=50`
      else if (m === 'timeline') url = `${API}/correlate/member/${arg}/timeline`
      else if (m === 'network') {
        const focus_type = arg; const focus_id = arg2 ?? ''
        url = `${API}/network?focus_type=${focus_type}&focus_id=${encodeURIComponent(focus_id)}`
      }
      if (url) setResult(await fetch(url).then(r => r.json()))
    } catch {}
    setLoading(false)
  }, [])

  const run = () => {
    if (mode === 'issue') runAnalysis('issue', issueId)
    else if (mode === 'member') runAnalysis('member', memberDistrict)
    else if (mode === 'committee') runAnalysis('committee', cmteId)
    else if (mode === 'industry') runAnalysis('industry', employer)
    else if (mode === 'donor') runAnalysis('donor', donorQuery)
    else if (mode === 'bill') runAnalysis('bill', billId)
    else if (mode === 'anomalies') runAnalysis('anomalies', '')
    else if (mode === 'timeline') runAnalysis('timeline', timelineDistrict)
    else if (mode === 'network') {
      const id = networkFocus === 'issue' ? networkIssue : networkFocus === 'rep' ? networkDistrict : networkFocus === 'employer' ? networkEmployer : networkCmte
      runAnalysis('network', networkFocus, id)
    }
  }

  useEffect(() => {
    if (didAutoRun.current) return; didAutoRun.current = true
    if (initialMember) runAnalysis('member', initialMember)
    else if (initialCommittee) runAnalysis('committee', initialCommittee)
  }, [initialMember, initialCommittee, runAnalysis])

  useEffect(() => {
    if (mode === 'changes') {
      setChangesLoading(true)
      fetch(`${API}/changes?limit=100`).then(r => r.json()).then(d => setChanges(d.changes ?? [])).catch(() => {}).finally(() => setChangesLoading(false))
    }
  }, [mode])

  const MODES: [CorrMode, string][] = [
    ['donor', 'By Donor'], ['issue', 'By Issue'], ['member', 'By Member'],
    ['committee', 'By Committee'], ['industry', 'By Industry'], ['bill', 'By Bill'],
    ['changes', 'Changes'], ['anomalies', 'Anomalies'], ['network', 'Network Graph'], ['timeline', 'Timeline'],
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Mode selector */}
      <div className="flex flex-wrap gap-1 p-3 border-b border-terminal-border">
        {MODES.map(([m, label]) => (
          <button key={m} onClick={() => { setMode(m); setResult(null) }}
            className={`px-3 py-1.5 text-xs uppercase tracking-wider border transition-colors ${
              mode === m ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
                : 'border-terminal-border text-terminal-muted hover:text-terminal-text hover:border-terminal-text'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Inputs */}
      {mode !== 'changes' && mode !== 'anomalies' && (
        <div className="p-3 border-b border-terminal-border flex flex-wrap gap-2 items-center">
          {mode === 'issue' && (
            <select value={issueId} onChange={e => setIssueId(e.target.value)}
              className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent font-mono">
              {ISSUES.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          )}
          {mode === 'member' && (
            <input value={memberDistrict} onChange={e => setMemberDistrict(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run()} placeholder="District number (e.g. 127)"
              className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono w-48" />
          )}
          {mode === 'committee' && (
            <>
              <input value={cmteId} onChange={e => setCmteId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && run()} placeholder="Committee ID"
                className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono w-48" />
              <span className="text-terminal-muted text-[10px]">Tip: browse Committees tab → click "Correlate Committee →"</span>
            </>
          )}
          {mode === 'industry' && (
            <input value={employer} onChange={e => setEmployer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run()} placeholder="Employer keyword (e.g. BOEING, NRA)"
              className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono w-60" />
          )}
          {mode === 'donor' && (
            <input value={donorQuery} onChange={e => setDonorQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run()} placeholder="Donor name or organization (e.g. MO Corn Growers)"
              className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono w-72" />
          )}
          {mode === 'bill' && (
            <input value={billId} onChange={e => setBillId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run()} placeholder="Bill ID (e.g. 251-HB0123)"
              className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono w-52" />
          )}
          {mode === 'timeline' && (
            <input value={timelineDistrict} onChange={e => setTimelineDistrict(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run()} placeholder="District number (e.g. 127)"
              className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono w-48" />
          )}
          {mode === 'network' && (
            <>
              <div className="flex border border-terminal-border text-xs">
                {(['issue', 'rep', 'employer', 'committee'] as NetworkFocus[]).map(f => (
                  <button key={f} onClick={() => setNetworkFocus(f)}
                    className={`px-2.5 py-1.5 uppercase tracking-wider transition-colors ${networkFocus === f ? 'bg-terminal-accent text-terminal-bg' : 'text-terminal-muted hover:text-terminal-text'}`}>
                    {f}
                  </button>
                ))}
              </div>
              {networkFocus === 'issue' && (
                <select value={networkIssue} onChange={e => setNetworkIssue(e.target.value)}
                  className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent font-mono">
                  {ISSUES.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                </select>
              )}
              {networkFocus === 'rep' && (
                <input value={networkDistrict} onChange={e => setNetworkDistrict(e.target.value)}
                  placeholder="District #" className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono w-28" />
              )}
              {networkFocus === 'employer' && (
                <input value={networkEmployer} onChange={e => setNetworkEmployer(e.target.value)}
                  placeholder="Employer keyword" className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono w-52" />
              )}
              {networkFocus === 'committee' && (
                <input value={networkCmte} onChange={e => setNetworkCmte(e.target.value)}
                  placeholder="Committee ID" className="bg-terminal-panel border border-terminal-border text-terminal-text text-xs px-3 py-1.5 focus:outline-none focus:border-terminal-accent placeholder-terminal-muted font-mono w-48" />
              )}
            </>
          )}
          <button onClick={run} disabled={loading}
            className="px-4 py-1.5 border border-terminal-accent text-terminal-accent text-xs uppercase tracking-wider hover:bg-terminal-accent hover:text-terminal-bg transition-colors font-mono disabled:opacity-40">
            {loading ? 'Running…' : 'Run Analysis'}
          </button>
          {result && !loading && <span className="text-terminal-green text-[10px] tracking-wider animate-pulse">● COMPLETE</span>}
        </div>
      )}
      {(mode === 'anomalies') && (
        <div className="p-3 border-b border-terminal-border flex gap-2 items-center">
          <span className="text-terminal-muted text-xs">Scans all representatives for high-concentration donor + legislation patterns.</span>
          <button onClick={run} disabled={loading}
            className="px-4 py-1.5 border border-terminal-accent text-terminal-accent text-xs uppercase tracking-wider hover:bg-terminal-accent hover:text-terminal-bg transition-colors font-mono disabled:opacity-40">
            {loading ? 'Scanning…' : 'Run Scan'}
          </button>
        </div>
      )}

      {/* Results */}
      <div className={`flex-1 overflow-auto ${mode === 'network' && result ? 'p-0' : 'p-4'}`}>
        {mode === 'changes' ? <ChangesView changes={changes} loading={changesLoading} />
          : loading ? <Spinner />
          : result ? (
            mode === 'issue'      ? <IssueResult data={result} /> :
            mode === 'member'     ? <MemberCorrelateResult data={result} /> :
            mode === 'committee'  ? <CommitteeCorrelateResult data={result} /> :
            mode === 'industry'   ? <IndustryResult data={result} /> :
            mode === 'donor'      ? <DonorNetworkResult data={result} /> :
            mode === 'bill'       ? <BillInfluenceResult data={result} /> :
            mode === 'anomalies'  ? <AnomaliesResult data={result} /> :
            mode === 'timeline'   ? <TimelineView data={result} /> :
            mode === 'network'    ? <NetworkGraph data={result} /> :
            null
          ) : (
            <div className="text-terminal-muted text-xs text-center py-12 max-w-md mx-auto leading-relaxed">
              {mode === 'donor' && 'Search by donor name or organization to see every rep they funded, which committees those reps sit on, and what bills they filed — the full influence map for one entity.'}
              {mode === 'issue' && 'Select an issue area and run the analysis to see which bills touched it and who funded the sponsors.'}
              {mode === 'member' && 'Enter a district number to see a representative\'s legislative priorities side-by-side with their campaign donors.'}
              {mode === 'committee' && 'Enter a committee ID to see all members and their campaign finance. Browse the Committees tab and click "Correlate Committee →" to auto-fill.'}
              {mode === 'industry' && 'Search by employer keyword to find all representatives funded by that industry and trace their legislation.'}
              {mode === 'bill' && 'Enter a bill ID to see shared funders across sponsors, how Y vs N voters compare in fundraising, and donations made in the 90 days before the floor vote.'}
              {mode === 'anomalies' && 'Scan all representatives for correlated donor + legislation patterns. High signal = concentrated money + concentrated bills in same area.'}
              {mode === 'network' && 'Select a focus type and run to visualize the donor → representative → legislation → issue network as a force-directed graph.'}
              {mode === 'timeline' && 'Enter a district number to see a chronological timeline of donations received vs bills introduced and acted upon.'}
            </div>
          )
        }
      </div>
    </div>
  )
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function LegislaturePage() {
  const [tab, setTab] = useState<MainTab>('members')
  const [corrMember, setCorrMember] = useState<string | undefined>()
  const [corrCommittee, setCorrCommittee] = useState<string | undefined>()
  const [corrKey, setCorrKey] = useState(0)

  const goCorrelate = (member?: string, committee?: string) => {
    setCorrMember(member); setCorrCommittee(committee)
    setCorrKey(k => k + 1); setTab('correlate')
  }

  return (
    <div className="flex flex-col h-full">
      <TopBarPortal>
      <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-border bg-terminal-panel">
        <div>
          <span className="text-terminal-accent font-mono font-bold tracking-wider">MO HOUSE LEGISLATURE</span>
          <span className="text-terminal-muted text-xs ml-3">Session 251 · 2025 Regular Session</span>
        </div>
      </div>
      <div className="flex border-b border-terminal-border px-2 bg-terminal-panel overflow-x-auto">
        <TabBtn label="Members"          active={tab === 'members'}    onClick={() => setTab('members')} />
        <TabBtn label="Bills"            active={tab === 'bills'}      onClick={() => setTab('bills')} />
        <TabBtn label="Committees"       active={tab === 'committees'} onClick={() => setTab('committees')} />
        <TabBtn label="Follow the Money" active={tab === 'correlate'}  onClick={() => setTab('correlate')} />
      </div>
      </TopBarPortal>
      <div className="flex-1 overflow-hidden">
        {tab === 'members'    && <MembersPanel    onCorrelate={d => goCorrelate(d, undefined)} />}
        {tab === 'bills'      && <BillsPanel />}
        {tab === 'committees' && <CommitteesPanel onCorrelate={id => goCorrelate(undefined, id)} />}
        {tab === 'correlate'  && <CorrelatePanel key={corrKey} initialMember={corrMember} initialCommittee={corrCommittee} />}
      </div>
    </div>
  )
}
