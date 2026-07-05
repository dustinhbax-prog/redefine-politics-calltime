import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DataTable from '../components/DataTable'
import PageHeader from '../components/PageHeader'
import PartyBadge from '../components/PartyBadge'
import Tooltip from '../components/Tooltip'
import { logExport } from '../api/fec'
import { getClientCandidate, updateClientCandidate } from '../lib/clientCandidate'
import CampaignFields from '../components/CampaignFields'
import { TopBarPortal } from '../lib/topbar'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

interface AggregatedDonor {
  contributor_name: string
  contributor_city: string
  contributor_state: string
  contributor_zip: string
  contributor_employer: string | null
  contributor_occupation: string | null
  entity_type: string
  entity_type_desc: string
  total_amount: number
  contribution_count: number
  first_date: string | null
  last_date: string | null
  committees: { committee_id: string; name: string; party: string | null }[]
  unique_committees: number
  result_lean: 'DEM' | 'REP' | 'SPLIT' | null
  result_lean_pct: number | null
  donor_party: 'DEM' | 'REP' | 'SPLIT' | null
  donor_party_confidence: number
  sources?: ('FEC' | 'MEC')[]
  district_match?: string
  businesses?: string[]
  business_count?: number
  reg_party?: string | null
}

// Voter-file registration party (a distinct fact from the behavioral giving lean) —
// compact chip styling by declared party word.
const REG_PARTY_STYLE: Record<string, string> = {
  Democratic:   'text-blue-400   border-blue-700',
  Republican:   'text-terminal-red border-red-800',
  Libertarian:  'text-amber-300  border-amber-600',
  Green:        'text-terminal-green border-green-700',
  Constitution: 'text-purple-400 border-purple-700',
}
function RegPartyChip({ party }: { party?: string | null }) {
  if (!party) return <span className="text-terminal-muted">—</span>
  const cls = REG_PARTY_STYLE[party] ?? 'text-terminal-text border-terminal-border'
  return (
    <Tooltip content={`Registered ${party} in the county voter file. This is the donor's declared party registration — a distinct fact from their behavioral giving lean.`}>
      <span className={`inline-block px-1.5 py-0.5 text-xs border rounded cursor-default ${cls}`}>
        {party.slice(0, 4)}
      </span>
    </Tooltip>
  )
}

const ISSUE_OPTIONS = [
  { id: 'labor',                  label: 'Labor' },
  { id: 'reproductive_rights',    label: 'Reproductive Rights' },
  { id: 'gun_policy',             label: 'Gun Policy' },
  { id: 'democracy_voting',       label: 'Democracy / Voting' },
  { id: 'campaign_finance_reform',label: 'Campaign Finance Reform' },
  { id: 'taxation',               label: 'Taxation' },
  { id: 'rural_healthcare',       label: 'Rural Healthcare' },
  { id: 'pharmaceutical_reform',  label: 'Pharmaceutical Reform' },
  { id: 'medicare_reform',        label: 'Medicare Reform' },
  { id: 'family_farm',            label: 'Family Farm' },
  { id: 'agribusiness',           label: 'Agribusiness' },
  { id: 'tort_judicial',          label: 'Tort / Judicial Reform' },
  { id: 'veterans_support',       label: 'Veterans Support' },
  { id: 'lgbtq_rights',           label: 'LGBTQ+ Rights' },
  { id: 'diverse_candidates',     label: 'Diverse Candidates' },
  { id: 'young_candidates',       label: 'Young / New Candidates' },
  { id: 'economic_reform',        label: 'Economic Reform' },
  { id: 'marijuana_reform',       label: 'Cannabis Policy' },
  { id: 'environmental_climate',  label: 'Climate / Environment' },
  { id: 'immigration_reform',     label: 'Immigration Reform' },
  { id: 'national_security',      label: 'National Security' },
  { id: 'ai_tech_reform',         label: 'AI / Tech Policy' },
  { id: 'energy_utility',         label: 'Energy / Utility' },
  { id: 'police_reform',          label: 'Police Reform' },
  { id: 'israel_international',   label: 'Israel / International' },
]

const STANCE_OPTIONS = [
  { id: 'any',          label: 'Any Signal' },
  { id: 'support',      label: 'Supports (incl. lean)' },
  { id: 'strong_support', label: 'Strongly Supports' },
  { id: 'lean_support', label: 'Leans Support' },
  { id: 'oppose',       label: 'Opposes (incl. lean)' },
  { id: 'strong_oppose',label: 'Strongly Opposes' },
  { id: 'lean_oppose',  label: 'Leans Oppose' },
  { id: 'mixed',        label: 'Mixed / Conflicted' },
]

const TAG_CLS: Record<string, string> = {
  supportive:        'border-terminal-green text-terminal-green',
  lean_supportive:   'border-green-700 text-green-600',
  oppositional:      'border-terminal-red text-terminal-red',
  lean_oppositional: 'border-red-800 text-red-400',
  mixed:             'border-yellow-600 text-yellow-400',
  neutral:           'border-terminal-muted text-terminal-muted',
}
const TAG_VERDICT: Record<string, string> = {
  supportive: 'SUPPORT', lean_supportive: 'LEAN +',
  oppositional: 'OPPOSE', lean_oppositional: 'LEAN −',
  mixed: 'MIXED', neutral: 'NEUTRAL',
}
const TAG_TIP: Record<string, string> = {
  supportive:        'Strong support — this donor consistently funds candidates and groups aligned with supporting this issue. Score is weighted across their full contribution history.',
  lean_supportive:   'Leans supportive — more contributions go to pro-issue candidates than anti-issue, but the signal is moderate. May reflect partial alignment or limited data.',
  oppositional:      'Strong opposition — this donor consistently funds candidates and groups opposed to this issue.',
  lean_oppositional: 'Leans opposed — more contributions go to anti-issue candidates, but the signal is moderate.',
  mixed:             'Mixed / Conflicted — this donor has funded both sides of this issue, suggesting tactical giving, a split portfolio, or conflicting interests.',
  neutral:           'Neutral — contributions don\'t show a meaningful lean on this issue, either due to limited data or balanced giving across both sides.',
}

interface IssueResult {
  contributor_key: string
  contributor_name: string
  contributor_state: string
  party: 'DEM' | 'REP' | 'SPLIT' | null
  party_confidence: number
  direction: number
  intensity: number
  confidence: number
  classification: string
}

const ENTITY_STYLE: Record<string, string> = {
  IND: 'text-terminal-green  border-green-700',
  ORG: 'text-orange-400     border-orange-700',
  COM: 'text-purple-400     border-purple-700',
  CCM: 'text-purple-400     border-purple-700',
  PAC: 'text-purple-400     border-purple-700',
  PTY: 'text-blue-400       border-blue-700',
}
const ENTITY_LABEL: Record<string, string> = {
  IND: 'PERSON', ORG: 'BUSINESS', COM: 'COMMITTEE', CCM: 'CAND. CMTE', PAC: 'PAC', PTY: 'PARTY',
}
const ENTITY_TIP: Record<string, string> = {
  IND: 'Individual — a natural person making contributions in their own name.',
  ORG: 'Business / Organization — a corporate entity, LLC, or non-profit.',
  COM: 'Political committee — a campaign committee or other registered political organization.',
  CCM: 'Candidate committee — the official fundraising committee for a specific candidate.',
  PAC: 'Political Action Committee — an organization that pools contributions from members to donate to campaigns.',
  PTY: 'Political party committee — an official party organization (DNC, RNC, state parties, etc.)',
}
function EntityBadge({ type }: { type: string }) {
  return (
    <Tooltip content={ENTITY_TIP[type] ?? type}>
      <span className={`inline-block px-1.5 py-0.5 text-xs border rounded tracking-wider cursor-default ${ENTITY_STYLE[type] ?? ENTITY_STYLE.IND}`}>
        {ENTITY_LABEL[type] ?? type}
      </span>
    </Tooltip>
  )
}

interface DonorSearchResponse {
  results: AggregatedDonor[]
  pagination: { count: number }
  unique_donors: number
  total_transactions: number
  queued_for_research: number
  district_filter?: string
}

const donorKey = (r: AggregatedDonor) =>
  `${r.contributor_name.toUpperCase().trim()}|${(r.contributor_state || '').toUpperCase().trim()}`

export default function DonorsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [form, setForm] = useState({
    contributor_employer: '',
    contributor_occupation: '',
    contributor_zip: '',
    radius: '',
    contributor_name: '',
    min_amount: '',
    min_date: '2018-01-01',
    max_date: '',
    entity_type: '',
    us_house_district: '',
    mo_house_district: '',
    mo_senate_district: '',
    county: '',
    business_only: false,
    reg_party: '',          // '' = all; 'ANY' = any registered; or a party word
  })
  const [counties, setCounties] = useState<string[]>([])
  const [data, setData] = useState<DonorSearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partyFilter, setPartyFilter] = useState<string>('ALL')
  const [watchlistKeys, setWatchlistKeys] = useState<Set<string>>(new Set())
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)
  // Batch call-sheet candidate/campaign prompt (mirrors the single-donor CallsheetLauncher)
  const [csFormOpen, setCsFormOpen] = useState(false)
  const cc0 = getClientCandidate()
  const [csRole, setCsRole] = useState<'candidate' | 'staff'>(cc0?.caller_role || 'staff')
  const [csName, setCsName] = useState(cc0?.candidate_name || '')
  const [csOffice, setCsOffice] = useState(cc0?.office_label || '')
  const [csLink, setCsLink] = useState(cc0?.fundraising_url || '')
  const [saveSearchName, setSaveSearchName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [savedConfirm, setSavedConfirm] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  const [issueId, setIssueId] = useState(() => searchParams.get('issue_id') || '')
  const [issueStance, setIssueStance] = useState(() => searchParams.get('stance') || 'any')
  const [issueResults, setIssueResults] = useState<IssueResult[] | null>(null)
  const [issueLoading, setIssueLoading] = useState(false)
  const [issueError, setIssueError] = useState<string | null>(null)
  const [issueNameFilter, setIssueNameFilter] = useState('')
  const [issueStateFilter, setIssueStateFilter] = useState('')
  const [issuePartyFilter, setIssuePartyFilter] = useState('ALL')
  const didAutoSearch = useRef(false)

  // Auto-populate on mount: watchlist + random donors in parallel
  useEffect(() => {
    Promise.all([
      fetch('/api/watchlist/').then(r => r.json()).catch(() => ({ keys: [] })),
      fetch('/api/donors/?per_page=50&randomize=true&page=1').then(r => r.json()).catch(() => null),
    ]).then(([watchData, donorData]) => {
      setWatchlistKeys(new Set(watchData.keys ?? []))
      if (donorData) setData(donorData)
    })
    // County list for the geographic narrow (shares donor_address_district vocab with prospects).
    fetch('/api/prospects/options').then(r => r.json())
      .then(d => setCounties(d.counties ?? [])).catch(() => {})

  }, [])

  const doSearch = async (f: typeof form, forceRandomize = false, targetPage = 1, targetPerPage = perPage) => {
    setLoading(true)
    setError(null)
    setPage(targetPage)
    try {
      const sp = new URLSearchParams()
      if (f.contributor_name) sp.set('contributor_name', f.contributor_name)
      if (f.contributor_employer) sp.set('contributor_employer', f.contributor_employer)
      if (f.entity_type) sp.set('entity_type', f.entity_type)
      if (f.business_only) sp.set('business_only', 'true')
      if (f.contributor_occupation) sp.set('contributor_occupation', f.contributor_occupation)
      if (f.contributor_zip) {
        sp.set('contributor_zip', f.contributor_zip)
        if (f.radius) sp.set('radius_miles', f.radius)
      }
      if (f.min_amount) sp.set('min_amount', f.min_amount)
      if (f.min_date) sp.set('min_date', f.min_date)
      if (f.max_date) sp.set('max_date', f.max_date)
      if (f.us_house_district) sp.set('us_house_district', f.us_house_district)
      if (f.mo_house_district) sp.set('mo_house_district', f.mo_house_district)
      if (f.mo_senate_district) sp.set('mo_senate_district', f.mo_senate_district)
      if (f.county) sp.set('county', f.county)
      if (f.reg_party) sp.set('reg_party', f.reg_party)
      sp.set('per_page', String(targetPerPage))
      sp.set('page', String(targetPage))
      const hasDistrict = !!(f.us_house_district || f.mo_house_district || f.mo_senate_district || f.county)
      const isEmpty = !f.contributor_name && !f.contributor_employer && !f.contributor_occupation && !f.contributor_zip && !hasDistrict && !f.business_only && !f.reg_party
      if (forceRandomize || isEmpty) sp.set('randomize', 'true')
      const res = await fetch(`/api/donors/?${sp}`)
      if (!res.ok) throw new Error(`API error ${res.status}`)
      setData(await res.json())
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault()
    doSearch(form, false, 1)
  }

  const doIssueSearch = async (overrideId?: string, overrideStance?: string) => {
    const id = overrideId ?? issueId
    const stance = overrideStance ?? issueStance
    if (!id) return
    setIssueLoading(true)
    setIssueError(null)
    setIssueResults(null)
    setIssueNameFilter('')
    setIssueStateFilter('')
    setIssuePartyFilter('ALL')
    try {
      const sp = new URLSearchParams({ issue_id: id, stance })
      const res = await fetch(`/api/donors/by-issue?${sp}`)
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const d = await res.json()
      setIssueResults(d.results ?? [])
    } catch (err) {
      setIssueError(String(err))
    } finally {
      setIssueLoading(false)
    }
  }

  const clearIssueSearch = () => {
    setIssueResults(null)
    setIssueId('')
    setIssueStance('any')
    setIssueError(null)
    setIssueNameFilter('')
    setIssueStateFilter('')
    setIssuePartyFilter('ALL')
  }

  // Auto-run when navigated here with issue params (e.g. from a profile tag click)
  useEffect(() => {
    if (didAutoSearch.current) return
    const id = searchParams.get('issue_id')
    const stance = searchParams.get('stance') || 'any'
    if (id) {
      didAutoSearch.current = true
      doIssueSearch(id, stance)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const searchByEmployer = (employer: string) => {
    const next = { ...form, contributor_employer: employer }
    setForm(next)
    doSearch(next, false, 1)
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const openProfile = (r: AggregatedDonor) => {
    const params = new URLSearchParams({ name: r.contributor_name })
    if (r.contributor_state) params.set('state', r.contributor_state)
    if (r.contributor_city) params.set('city', r.contributor_city)
    navigate(`/donors/profile?${params}`)
  }

  const toggleWatchlist = async (r: AggregatedDonor) => {
    const key = donorKey(r)
    if (watchlistKeys.has(key)) {
      await fetch(`/api/watchlist/?name=${encodeURIComponent(r.contributor_name)}&state=${r.contributor_state || ''}`, { method: 'DELETE' })
      setWatchlistKeys(prev => { const s = new Set(prev); s.delete(key); return s })
    } else {
      await fetch('/api/watchlist/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: r.contributor_name, state: r.contributor_state, city: r.contributor_city, tag: 'PROSPECT' }),
      })
      setWatchlistKeys(prev => new Set([...prev, key]))
    }
  }

  const effectiveParty = (r: AggregatedDonor) => r.donor_party ?? r.result_lean
  const effectiveConfidence = (r: AggregatedDonor) =>
    r.donor_party ? r.donor_party_confidence : (r.result_lean_pct ?? undefined)

  const CALLSHEET_CAP = 25
  const toggleSelect = (r: AggregatedDonor) => {
    const k = donorKey(r)
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else if (next.size < CALLSHEET_CAP) next.add(k)  // hard cap — can't select more
      return next
    })
  }
  const selectAllVisible = () => setSelectedKeys(new Set(rows.slice(0, CALLSHEET_CAP).map(donorKey)))
  const clearSelected = () => setSelectedKeys(new Set())

  // Build one multi-page PDF — a call sheet per selected donor.
  const downloadCallsheets = async () => {
    const selected = rows.filter(r => selectedKeys.has(donorKey(r))).slice(0, CALLSHEET_CAP)
    if (!selected.length) return
    // Persist the candidate/caller choices like the single-donor flow does
    updateClientCandidate({ caller_role: csRole, candidate_name: csName, office_label: csOffice, fundraising_url: csLink })
    const cc = getClientCandidate()
    setBatchLoading(true)
    try {
      const donors = selected.map(r => ({ name: r.contributor_name, state: r.contributor_state }))
      const res = await fetch('/api/prospects/callsheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donors,
          district_type: cc?.district_type, district_value: cc?.district_value,
          candidate_name: csName || undefined, office_label: csOffice || undefined,
          fundraising_url: csLink || undefined, caller_role: csRole,
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `callsheets_${new Date().toISOString().slice(0, 10)}.pdf`; a.click()
      URL.revokeObjectURL(url)
      logExport('callsheets', `n:${selected.length}`, selected.length)
      setCsFormOpen(false)
    } catch {
      setError('Call sheet PDF failed — try again.')
    }
    setBatchLoading(false)
  }

  const exportCsv = () => {
    const headers = ['Name', 'Party Lean', 'Confidence', 'Reg. Party', 'City', 'State', 'ZIP', 'Employer', 'Occupation', 'Entity Type', 'Total Given', 'Gifts', 'First Date', 'Last Date', 'Recipients']
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csvRows = [
      headers.join(','),
      ...rows.map(r => [
        r.contributor_name, effectiveParty(r) ?? '', effectiveConfidence(r) ?? '', r.reg_party ?? '',
        r.contributor_city, r.contributor_state, r.contributor_zip,
        r.contributor_employer ?? '', r.contributor_occupation ?? '', r.entity_type_desc,
        r.total_amount, r.contribution_count, r.first_date ?? '', r.last_date ?? '',
        r.committees.map(c => c.name).join(' | '),
      ].map(escape).join(','))
    ]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `donors_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
    logExport('donors', `employer:${form.contributor_employer || ''} occ:${form.contributor_occupation || ''} zip:${form.contributor_zip || ''}`, rows.length)
  }

  const hasFilters = !!(form.contributor_employer || form.contributor_occupation || form.contributor_name || form.contributor_zip || form.us_house_district || form.mo_house_district || form.mo_senate_district || form.county)

  const confirmSaveSearch = async () => {
    if (!saveSearchName.trim()) return
    const searchType = form.contributor_employer ? 'employer' : form.contributor_occupation ? 'occupation' : form.contributor_name ? 'name' : 'general'
    const params: Record<string, string> = {}
    if (form.contributor_name) params.contributor_name = form.contributor_name
    if (form.contributor_employer) params.contributor_employer = form.contributor_employer
    if (form.contributor_occupation) params.contributor_occupation = form.contributor_occupation
    if (form.contributor_zip) params.contributor_zip = form.contributor_zip
    if (form.radius) params.radius_miles = form.radius
    if (form.min_amount) params.min_amount = form.min_amount
    await fetch('/api/watchlist/searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: saveSearchName, search_type: searchType, params }),
    })
    setShowSaveInput(false)
    setSaveSearchName('')
    setSavedConfirm(true)
    setTimeout(() => setSavedConfirm(false), 2500)
  }

  const cols = [
    {
      key: 'select', header: '', width: '3%',
      render: (r: AggregatedDonor) => {
        const sel = selectedKeys.has(donorKey(r))
        const atCap = !sel && selectedKeys.size >= CALLSHEET_CAP
        return (
          <input
            type="checkbox"
            checked={sel}
            disabled={atCap}
            onChange={() => toggleSelect(r)}
            onClick={e => e.stopPropagation()}
            className="cursor-pointer accent-terminal-accent w-3.5 h-3.5 align-middle disabled:opacity-30 disabled:cursor-not-allowed"
            title={atCap ? `Max ${CALLSHEET_CAP} selected` : 'Select for call-sheet PDF'}
          />
        )
      },
    },
    {
      key: 'watch', header: '', width: '3%',
      render: (r: AggregatedDonor) => {
        const watched = watchlistKeys.has(donorKey(r))
        return (
          <button
            onClick={e => { e.stopPropagation(); toggleWatchlist(r) }}
            className={`text-base transition-colors leading-none ${watched ? 'text-terminal-accent' : 'text-terminal-border hover:text-terminal-muted'}`}
            title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            {watched ? '★' : '☆'}
          </button>
        )
      },
    },
    {
      key: 'type', header: 'Type', width: '8%',
      render: (r: AggregatedDonor) => <EntityBadge type={r.entity_type || 'IND'} />,
    },
    {
      key: 'party', header: 'Party Lean', width: '9%',
      render: (r: AggregatedDonor) => <PartyBadge party={effectiveParty(r)} confidence={effectiveConfidence(r)} />,
    },
    {
      key: 'reg_party', header: 'Reg.', width: '5%',
      render: (r: AggregatedDonor) => <RegPartyChip party={r.reg_party} />,
    },
    {
      key: 'name', header: 'Donor / Entity', width: '14%',
      render: (r: AggregatedDonor) => (
        <div className="leading-tight">
          <button onClick={() => openProfile(r)} className="text-terminal-accent hover:underline text-left">
            {r.contributor_name}
          </button>
          {r.sources?.includes('MEC') && (
            <span className="ml-1 text-xs font-bold text-yellow-400 bg-yellow-400/10 px-1 rounded">MEC</span>
          )}
        </div>
      ),
    },
    {
      key: 'location', header: 'City / State', width: '10%',
      render: (r: AggregatedDonor) =>
        [r.contributor_city, r.contributor_state].filter(Boolean).join(', ') || '—',
    },
    {
      key: 'employer', header: 'Employer', width: '15%',
      render: (r: AggregatedDonor) => r.contributor_employer
        ? (
          <button
            onClick={() => searchByEmployer(r.contributor_employer!)}
            className="text-terminal-text hover:text-terminal-accent hover:underline text-left"
            title={`Search all donors from ${r.contributor_employer}`}
          >
            {r.contributor_employer}
          </button>
        )
        : '—',
    },
    { key: 'occupation', header: 'Occupation', width: '11%', render: (r: AggregatedDonor) => r.contributor_occupation || '—' },
    {
      key: 'businesses', header: 'Businesses', width: '12%',
      render: (r: AggregatedDonor) => (r.business_count ? (
        <span title={(r.businesses || []).join('\n')}
          className="inline-flex items-center gap-1 text-amber-300 text-xs cursor-help whitespace-nowrap">
          💼 {r.business_count}
          {r.businesses && r.businesses[0] && (
            <span className="text-terminal-muted truncate max-w-[110px]">· {r.businesses[0]}</span>
          )}
        </span>
      ) : <span className="text-terminal-muted">—</span>),
    },
    {
      key: 'total', header: 'Total Given', width: '9%',
      render: (r: AggregatedDonor) => <span className="text-terminal-green font-bold">{fmt(r.total_amount)}</span>,
    },
    {
      key: 'count', header: 'Gifts', width: '5%',
      render: (r: AggregatedDonor) => <span className="text-terminal-muted">{r.contribution_count}</span>,
    },
    {
      key: 'dates', header: 'Active', width: '9%',
      render: (r: AggregatedDonor) =>
        r.first_date && r.last_date
          ? `${r.first_date.slice(0, 7)} – ${r.last_date.slice(0, 7)}`
          : '—',
    },
    {
      key: 'committees', header: 'Recipients', width: '10%',
      render: (r: AggregatedDonor) => {
        if (!r.committees.length) return '—'
        const topName = r.committees[0]?.name || '—'
        return (
          <span title={r.committees.map(c => c.name).join('\n')} className="cursor-help">
            {r.unique_committees > 1
              ? <>{topName.slice(0, 16)}{topName.length > 16 ? '…' : ''} <span className="text-terminal-muted">+{r.unique_committees - 1}</span></>
              : topName.slice(0, 20)}
          </span>
        )
      },
    },
  ]

  const filteredIssueResults = issueResults === null ? null : issueResults.filter(r => {
    if (issueNameFilter && !r.contributor_name.toLowerCase().includes(issueNameFilter.toLowerCase())) return false
    if (issueStateFilter && r.contributor_state?.toUpperCase() !== issueStateFilter.toUpperCase()) return false
    if (issuePartyFilter !== 'ALL') {
      if (issuePartyFilter === 'UNKNOWN' && r.party) return false
      if (issuePartyFilter !== 'UNKNOWN' && r.party !== issuePartyFilter) return false
    }
    return true
  })

  const allRows = data?.results ?? []
  const rows = partyFilter === 'ALL'
    ? allRows
    : partyFilter === 'UNKNOWN'
      ? allRows.filter(r => !r.donor_party && !r.result_lean)
      : allRows.filter(r => (r.donor_party ?? r.result_lean) === partyFilter)

  const allVisibleSelected = rows.length > 0 && rows.slice(0, CALLSHEET_CAP).every(r => selectedKeys.has(donorKey(r)))

  const issueCols = [
    {
      key: 'name', header: 'Donor', width: '28%',
      render: (r: IssueResult) => (
        <button
          onClick={() => {
            const [name, state] = r.contributor_key.split('|')
            const params = new URLSearchParams({ name: r.contributor_name || name })
            if (state) params.set('state', state)
            navigate(`/donors/profile?${params}`)
          }}
          className="text-terminal-accent hover:underline text-left leading-tight"
        >
          {r.contributor_name}
        </button>
      ),
    },
    {
      key: 'state', header: 'State', width: '7%',
      render: (r: IssueResult) => <span className="text-terminal-muted">{r.contributor_state || '—'}</span>,
    },
    {
      key: 'party', header: 'Party Lean', width: '11%',
      render: (r: IssueResult) => <PartyBadge party={r.party} confidence={r.party_confidence} />,
    },
    {
      key: 'tag', header: 'Issue Position', width: '16%',
      render: (r: IssueResult) => {
        const cls = TAG_CLS[r.classification] ?? 'border-terminal-border text-terminal-muted'
        const verdict = TAG_VERDICT[r.classification] ?? r.classification.toUpperCase()
        const tip = TAG_TIP[r.classification]
        const badge = (
          <span className={`inline-flex items-center gap-1 border rounded px-2 py-0.5 text-xs font-medium cursor-default ${cls}`}>
            {verdict}
          </span>
        )
        return tip ? <Tooltip content={tip}>{badge}</Tooltip> : badge
      },
    },
    {
      key: 'direction', header: 'Direction', width: '14%',
      render: (r: IssueResult) => {
        const pct = Math.round(Math.abs(r.direction) * 100)
        const color = r.direction >= 0 ? 'bg-terminal-green' : 'bg-terminal-red'
        const left = r.direction < 0 ? `${((r.direction + 1) / 2) * 100}%` : '50%'
        const w = `${Math.abs(r.direction) * 50}%`
        return (
          <div className="flex items-center gap-2">
            <div className="relative flex-1 h-1.5 bg-terminal-border rounded overflow-hidden">
              <div className="absolute top-0 bottom-0 w-px bg-terminal-muted/40" style={{ left: '50%' }} />
              <div className={`absolute top-0 bottom-0 rounded ${color}`} style={{ left, width: w, opacity: Math.max(0.3, r.confidence) }} />
            </div>
            <span className="text-terminal-muted text-xs w-8 text-right">{r.direction >= 0 ? '+' : ''}{pct}%</span>
          </div>
        )
      },
    },
    {
      key: 'confidence', header: 'Confidence', width: '10%',
      render: (r: IssueResult) => (
        <span className="text-terminal-muted text-xs">{Math.round(r.confidence * 100)}%</span>
      ),
    },
    {
      key: 'watch', header: '', width: '4%',
      render: (r: IssueResult) => {
        const key = r.contributor_key
        const watched = watchlistKeys.has(key)
        return (
          <button
            onClick={e => {
              e.stopPropagation()
              const [name, state] = key.split('|')
              if (watched) {
                fetch(`/api/watchlist/?name=${encodeURIComponent(r.contributor_name || name)}&state=${state || ''}`, { method: 'DELETE' })
                setWatchlistKeys(prev => { const s = new Set(prev); s.delete(key); return s })
              } else {
                fetch('/api/watchlist/', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: r.contributor_name || name, state: state || '', tag: 'PROSPECT' }),
                })
                setWatchlistKeys(prev => new Set([...prev, key]))
              }
            }}
            className={`text-base transition-colors leading-none ${watched ? 'text-terminal-accent' : 'text-terminal-border hover:text-terminal-muted'}`}
            title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            {watched ? '★' : '☆'}
          </button>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <TopBarPortal>
      <PageHeader
        title="Donor Prospect Search"
        subtitle="FEC Schedule A · search blank to browse recent MO donors · click employer to drill down · ☆ to watchlist · click name for full history"
      >
        <div className="text-terminal-muted text-xs border border-terminal-border px-2 py-0.5">MISSOURI ONLY</div>
      </PageHeader>
      <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel">
        <button
          className="md:hidden w-full text-left py-3 text-terminal-accent text-xs uppercase tracking-wider flex items-center justify-between"
          onClick={() => setFiltersOpen(v => !v)}
        >
          FILTERS <span>{filtersOpen ? '▲' : '▼'}</span>
        </button>
        <div className={`md:block ${filtersOpen ? 'block' : 'hidden'}`}>
        <form onSubmit={search} className="flex gap-3 items-end flex-col md:flex-row flex-wrap">
          <div className="w-full md:w-auto md:flex-1 md:min-w-40">
            <label className="label">Employer <span className="text-terminal-accent">★</span></label>
            <input className="input-field" value={form.contributor_employer} onChange={set('contributor_employer')} placeholder="Boeing, law firm, hospital…" />
          </div>
          <div className="w-full md:w-auto md:flex-1 md:min-w-36">
            <label className="label">Occupation <span className="text-terminal-accent">★</span></label>
            <input className="input-field" value={form.contributor_occupation} onChange={set('contributor_occupation')} placeholder="Attorney, Physician, CEO…" />
          </div>
          <div className="w-full md:w-20">
            <label className="label">ZIP <span className="text-terminal-accent">★</span></label>
            <input className="input-field" value={form.contributor_zip} onChange={set('contributor_zip')} placeholder="63101" maxLength={5} />
          </div>
          <div className="w-full md:w-28">
            <label className="label">Radius</label>
            <select className="input-field" value={form.radius} onChange={e => setForm(f => ({ ...f, radius: e.target.value }))}>
              <option value="">ZIP exact</option>
              <option value="10">10 mi</option>
              <option value="25">25 mi</option>
              <option value="50">50 mi</option>
            </select>
          </div>
          <div className="w-full md:w-20">
            <label className="label" title="US House District">US Hse</label>
            <input className="input-field" value={form.us_house_district} onChange={set('us_house_district')} placeholder="1" maxLength={3} />
          </div>
          <div className="w-full md:w-20">
            <label className="label" title="Missouri House District">MO Hse</label>
            <input className="input-field" value={form.mo_house_district} onChange={set('mo_house_district')} placeholder="24" maxLength={3} />
          </div>
          <div className="w-full md:w-20">
            <label className="label" title="Missouri Senate District">MO Sen</label>
            <input className="input-field" value={form.mo_senate_district} onChange={set('mo_senate_district')} placeholder="5" maxLength={3} />
          </div>
          <div className="w-full md:w-36">
            <label className="label" title="Narrow to donors in one Missouri county (geocoded MEC donors)">County</label>
            {counties.length
              ? (
                <select className="input-field" value={form.county} onChange={e => setForm(f => ({ ...f, county: e.target.value }))}>
                  <option value="">All counties</option>
                  {counties.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )
              : <input className="input-field" value={form.county} onChange={set('county')} placeholder="Boone" />}
          </div>
          <div className="w-full md:w-auto md:flex-1 md:min-w-36">
            <label className="label">Name (optional)</label>
            <input className="input-field" value={form.contributor_name} onChange={set('contributor_name')} placeholder="Last, First" />
          </div>
          <div className="w-full md:w-24">
            <label className="label">Min $</label>
            <input className="input-field" value={form.min_amount} onChange={set('min_amount')} placeholder="200" type="number" />
          </div>
          <div className="w-full md:w-28">
            <label className="label">From</label>
            <input className="input-field" value={form.min_date} onChange={set('min_date')} type="date" />
          </div>
          <div className="w-full md:w-28">
            <label className="label">To</label>
            <input className="input-field" value={form.max_date} onChange={set('max_date')} type="date" />
          </div>
          <div className="w-full md:w-36">
            <label className="label">Donor Type</label>
            <select className="input-field" value={form.entity_type} onChange={e => setForm(f => ({ ...f, entity_type: e.target.value }))}>
              <option value="">All Types</option>
              <option value="IND">People only</option>
              <option value="ORG">Businesses / Orgs</option>
              <option value="COM">Committees / PACs</option>
              <option value="CCM">Candidate Committees</option>
            </select>
          </div>
          <div className="w-full md:w-auto flex items-end">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-terminal-text border border-terminal-border rounded px-2.5 py-2 hover:border-amber-500/70 transition-colors"
              title="Show only donors who are the registered agent of a Missouri business (SOS filings)">
              <input type="checkbox" checked={form.business_only}
                onChange={e => { const nf = { ...form, business_only: e.target.checked }; setForm(nf); doSearch(nf, false, 1) }} />
              <span>💼 Business owners only</span>
            </label>
          </div>
          <div className="w-full md:w-40">
            <label className="label" title="Filter to donors who carry a declared party registration from the ingested county voter file (verified ✓ matches). Distinct from the giving-based Party Lean.">Reg. Party (voter file)</label>
            <select
              className="input-field"
              value={form.reg_party}
              onChange={e => { const nf = { ...form, reg_party: e.target.value }; setForm(nf); doSearch(nf, false, 1) }}
            >
              <option value="">All donors</option>
              <option value="ANY">Any registered</option>
              <option value="Democratic">Democratic</option>
              <option value="Republican">Republican</option>
              <option value="Libertarian">Libertarian</option>
              <option value="Green">Green</option>
            </select>
          </div>
          <div className="w-full md:w-32">
            <label className="label">Party Lean</label>
            <select className="input-field" value={partyFilter} onChange={e => setPartyFilter(e.target.value)}>
              <option value="ALL">All Parties</option>
              <option value="DEM">Democrat</option>
              <option value="REP">Republican</option>
              <option value="SPLIT">Split</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </div>
          <button type="submit" className="btn-primary py-3 md:py-1" disabled={loading}>SEARCH</button>
          {hasFilters && !showSaveInput && (
            <button
              type="button"
              onClick={() => setShowSaveInput(true)}
              className="border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent px-2 py-3 md:py-1 text-xs uppercase tracking-wider transition-colors"
              title="Save this search"
            >
              ☆ SAVE
            </button>
          )}
          {savedConfirm && <span className="text-terminal-green text-xs">✓ Saved!</span>}
        </form>

        {/* Issue / Score filter row */}
        <div className="flex gap-2 items-end flex-wrap mt-2 pt-2 border-t border-terminal-border/50">
          <div className="text-terminal-muted text-xs uppercase tracking-wider self-center pr-1">By Issue:</div>
          <div className="w-52">
            <select
              className="input-field"
              value={issueId}
              onChange={e => { setIssueId(e.target.value); setIssueResults(null) }}
            >
              <option value="">— Select Issue —</option>
              {ISSUE_OPTIONS.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="w-44">
            <select
              className="input-field"
              value={issueStance}
              onChange={e => { setIssueStance(e.target.value); setIssueResults(null) }}
              disabled={!issueId}
            >
              {STANCE_OPTIONS.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => doIssueSearch()}
            disabled={!issueId || issueLoading}
            className="btn-primary py-1 disabled:opacity-40"
          >
            {issueLoading ? 'SEARCHING…' : 'FIND DONORS'}
          </button>
          {issueResults !== null && (
            <button onClick={clearIssueSearch} className="text-xs text-terminal-muted hover:text-terminal-text border border-terminal-border px-2 py-1">
              ✕ Clear
            </button>
          )}
          {issueResults !== null && (
            <span className="text-terminal-muted text-xs self-center">
              {issueResults.length} scored donors match · results from local profile cache
            </span>
          )}
          {issueError && <span className="text-red-400 text-xs">{issueError}</span>}
        </div>

        {/* Post-result filters — shown only while issue results are active */}
        {issueResults !== null && (
          <div className="flex gap-2 items-center flex-wrap mt-2 pt-2 border-t border-terminal-border/50">
            <span className="text-terminal-muted text-xs uppercase tracking-wider">Refine:</span>
            <input
              className="input-field w-44 text-xs"
              placeholder="Filter by name…"
              value={issueNameFilter}
              onChange={e => setIssueNameFilter(e.target.value)}
            />
            <input
              className="input-field w-16 text-xs"
              placeholder="State"
              maxLength={2}
              value={issueStateFilter}
              onChange={e => setIssueStateFilter(e.target.value.toUpperCase())}
            />
            <select
              className="input-field w-32 text-xs"
              value={issuePartyFilter}
              onChange={e => setIssuePartyFilter(e.target.value)}
            >
              <option value="ALL">All Parties</option>
              <option value="DEM">Democrat</option>
              <option value="REP">Republican</option>
              <option value="SPLIT">Split</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
            {filteredIssueResults !== null && filteredIssueResults.length !== issueResults.length && (
              <span className="text-terminal-accent text-xs">
                {filteredIssueResults.length} of {issueResults.length} shown
              </span>
            )}
          </div>
        )}
        </div>
        {showSaveInput && (
          <div className="flex gap-2 items-center mt-2">
            <input
              autoFocus
              className="input-field w-56 text-xs"
              placeholder="Search name…"
              value={saveSearchName}
              onChange={e => setSaveSearchName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmSaveSearch(); if (e.key === 'Escape') setShowSaveInput(false) }}
            />
            <button onClick={confirmSaveSearch} className="btn-primary text-xs px-3 py-1">SAVE</button>
            <button onClick={() => setShowSaveInput(false)} className="text-terminal-muted text-xs hover:text-terminal-text px-1">✕</button>
          </div>
        )}
        {data && (
          <div className="mt-2 text-terminal-muted text-xs flex items-center gap-2 flex-wrap">
            <span>
              {rows.length}{partyFilter !== 'ALL' ? ` ${partyFilter}` : ''} donors shown · page {page}
              {data.total_transactions > 0 && <span className="ml-1">· {data.total_transactions} raw transactions</span>}
              {data.district_filter && <span className="ml-1 text-terminal-accent">· filtered to {data.district_filter}</span>}
            </span>
            {data.queued_for_research > 0 && (
              <span className="text-terminal-accent">↻ {data.queued_for_research} queued for research</span>
            )}

            {/* Per-page selector */}
            <div className="flex items-center gap-1 ml-2">
              <span className="text-terminal-border">per page:</span>
              {[25, 50, 100].map(n => (
                <button
                  key={n}
                  onClick={() => { setPerPage(n); doSearch(form, false, 1, n) }}
                  className={`px-1.5 py-0.5 border transition-colors ${perPage === n ? 'border-terminal-accent text-terminal-accent' : 'border-terminal-border text-terminal-border hover:border-terminal-muted hover:text-terminal-muted'}`}
                >
                  {n}
                </button>
              ))}
            </div>

            {/* Pagination prev/next */}
            <div className="flex items-center gap-1 ml-1">
              <button
                disabled={page <= 1 || loading}
                onClick={() => doSearch(form, false, page - 1)}
                className="px-2 py-0.5 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← prev
              </button>
              <span className="px-2 text-terminal-muted">pg {page}</span>
              <button
                disabled={rows.length < perPage || loading}
                onClick={() => doSearch(form, false, page + 1)}
                className="px-2 py-0.5 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                next →
              </button>
            </div>

            {rows.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <button onClick={allVisibleSelected ? clearSelected : selectAllVisible}
                  className="border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent px-2 py-0.5 uppercase tracking-wider transition-colors">
                  {allVisibleSelected ? 'Clear' : 'Select all'}
                </button>
                <button onClick={() => setCsFormOpen(true)} disabled={selectedKeys.size === 0 || batchLoading}
                  title="Generate one PDF with a call sheet for each selected donor (max 25)"
                  className="border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent px-2 py-0.5 uppercase tracking-wider transition-colors disabled:opacity-40">
                  {batchLoading ? 'Building…' : `📄 Call Sheets (${selectedKeys.size})`}
                </button>
                <button onClick={exportCsv}
                  className="border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent px-2 py-0.5 uppercase tracking-wider transition-colors">
                  ↓ Export CSV
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </TopBarPortal>
      {filteredIssueResults !== null ? (
        <DataTable
          columns={issueCols}
          rows={filteredIssueResults}
          rowKey={(r: IssueResult) => r.contributor_key}
          loading={issueLoading}
          error={issueError}
          count={filteredIssueResults.length}
        />
      ) : (
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(r) => `${r.contributor_name}|${r.contributor_state}`}
          loading={loading}
          error={error}
          count={rows.length}
        />
      )}

      {csFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setCsFormOpen(false)}>
          <div className="bg-terminal-panel border border-terminal-border rounded-lg p-4 w-[24rem] max-w-full max-h-[90vh] overflow-auto text-sm" onClick={e => e.stopPropagation()}>
            <div className="text-terminal-accent font-bold uppercase tracking-wider text-xs mb-1">
              Call sheets — {Math.min(selectedKeys.size, CALLSHEET_CAP)} donor{selectedKeys.size === 1 ? '' : 's'}
            </div>
            <div className="text-terminal-muted text-xs mb-3">One PDF — a dossier + tailored call script per person, personalized to your candidate.</div>

            <div className="text-terminal-muted text-[11px] uppercase tracking-wider mb-1.5">Your candidate</div>
            <div className="mb-3">
              <CampaignFields
                candidateName={csName} setCandidateName={setCsName}
                office={csOffice} setOffice={setCsOffice}
                link={csLink} setLink={setCsLink}
              />
            </div>

            <div className="text-terminal-muted text-[11px] uppercase tracking-wider mb-1.5">Who's making the calls?</div>
            <div className="grid grid-cols-2 gap-2 mb-1">
              {([['candidate', "I'm the candidate"], ['staff', 'Staff / proxy']] as const).map(([v, lbl]) => (
                <button key={v} onClick={() => setCsRole(v)}
                  className={`px-2 py-1.5 text-xs border rounded transition-colors ${csRole === v
                    ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
                    : 'border-terminal-border text-terminal-muted hover:border-terminal-muted'}`}>
                  {lbl}
                </button>
              ))}
            </div>
            <div className="text-terminal-border text-[10px] mb-3 leading-snug">
              {csRole === 'candidate'
                ? 'Scripts are written in first person — you introduce yourself and ask personally.'
                : 'Scripts introduce the caller on the candidate’s behalf (leaves a blank for the caller’s name).'}
            </div>

            <div className="flex gap-2">
              <button onClick={downloadCallsheets} disabled={batchLoading} className="btn-primary flex-1 py-1.5 disabled:opacity-50">
                {batchLoading ? 'Building PDF…' : 'Generate PDF'}
              </button>
              <button onClick={() => setCsFormOpen(false)}
                className="px-3 py-1.5 text-xs text-terminal-muted border border-terminal-border rounded hover:text-terminal-text transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
