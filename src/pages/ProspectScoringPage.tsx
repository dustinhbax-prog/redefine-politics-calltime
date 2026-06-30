import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DataTable from '../components/DataTable'
import PartyBadge from '../components/PartyBadge'
import Tooltip from '../components/Tooltip'
import { fecApi, logExport, type Prospect, type ProspectResponse, type ProspectOptions } from '../api/fec'
import { getClientCandidate, setClientCandidate, updateClientCandidate } from '../lib/clientCandidate'
import CallsheetLauncher from '../components/CallsheetLauncher'
import CampaignFields from '../components/CampaignFields'
import { TopBarPortal } from '../lib/topbar'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

// Canonical national-issue set (mirrors backend issue_taxonomy / DonorsPage).
const ISSUE_OPTIONS = [
  { id: 'labor', label: 'Labor' },
  { id: 'reproductive_rights', label: 'Reproductive Rights' },
  { id: 'gun_policy', label: 'Gun Policy' },
  { id: 'democracy_voting', label: 'Democracy / Voting' },
  { id: 'campaign_finance_reform', label: 'Campaign Finance' },
  { id: 'taxation', label: 'Taxation' },
  { id: 'rural_healthcare', label: 'Rural Healthcare' },
  { id: 'pharmaceutical_reform', label: 'Pharma Reform' },
  { id: 'medicare_reform', label: 'Medicare Reform' },
  { id: 'family_farm', label: 'Family Farm' },
  { id: 'agribusiness', label: 'Agribusiness' },
  { id: 'tort_judicial', label: 'Tort / Judicial' },
  { id: 'veterans_support', label: 'Veterans' },
  { id: 'lgbtq_rights', label: 'LGBTQ+ Rights' },
  { id: 'economic_reform', label: 'Economic Reform' },
  { id: 'marijuana_reform', label: 'Cannabis' },
  { id: 'environmental_climate', label: 'Climate' },
  { id: 'immigration_reform', label: 'Immigration' },
  { id: 'national_security', label: 'National Security' },
  { id: 'ai_tech_reform', label: 'AI / Tech' },
  { id: 'energy_utility', label: 'Energy / Utility' },
  { id: 'police_reform', label: 'Police Reform' },
  { id: 'israel_international', label: 'Israel / Intl' },
]

const DISTRICT_LABELS: Record<string, string> = {
  us_house: 'US House (CD)',
  mo_house: 'MO House',
  mo_senate: 'MO Senate',
}

// Quintile pips: 5 dots, filled up to the score.
function Quintile({ score, label }: { score: number; label: string }) {
  return (
    <Tooltip content={`${label}: quintile ${score}/5`}>
      <span className="inline-flex gap-px cursor-default">
        {[1, 2, 3, 4, 5].map(i => (
          <span key={i} className={`w-1 h-3 rounded-sm ${i <= score ? 'bg-terminal-accent' : 'bg-terminal-border'}`} />
        ))}
      </span>
    </Tooltip>
  )
}

function Composite({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  const color = v >= 70 ? 'bg-terminal-green' : v >= 45 ? 'bg-terminal-accent' : 'bg-terminal-border'
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 h-2 bg-terminal-border/40 rounded overflow-hidden min-w-[40px]">
        <div className={`absolute inset-y-0 left-0 rounded ${color}`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-terminal-text font-bold text-xs w-8 text-right">{v.toFixed(0)}</span>
    </div>
  )
}

export default function ProspectScoringPage() {
  const navigate = useNavigate()
  const [opts, setOpts] = useState<ProspectOptions | null>(null)
  const [industries, setIndustries] = useState<{ industry_id: string; label: string }[]>([])

  // Candidate identity (persisted) — personalizes call sheets/scripts.
  const _cc = getClientCandidate()
  const [candName, setCandName] = useState(_cc?.candidate_name || '')
  const [candOffice, setCandOffice] = useState(_cc?.office_label || '')
  const [candUrl, setCandUrl] = useState(_cc?.fundraising_url || '')

  // Client-candidate form
  const [party, setParty] = useState('')
  const [districtType, setDistrictType] = useState('')
  const [districtValue, setDistrictValue] = useState('')
  const [county, setCounty] = useState('')
  const [selIndustries, setSelIndustries] = useState<Set<string>>(new Set())
  const [selIssues, setSelIssues] = useState<Set<string>>(new Set())
  const [stateFilter, setStateFilter] = useState('MO')
  const [minTotal, setMinTotal] = useState('200')
  const [excludeOrgs, setExcludeOrgs] = useState(true)
  const [requireDistrict, setRequireDistrict] = useState(false)
  const [requirePartyMatch, setRequirePartyMatch] = useState(false)
  const [onlyWithContact, setOnlyWithContact] = useState(false)
  const [prioritizeContacts, setPrioritizeContacts] = useState(false)

  const [data, setData] = useState<ProspectResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const PER = 100

  useEffect(() => {
    fecApi.prospectOptions().then(setOpts).catch(() => {})
    fetch('/api/industries').then(r => r.json())
      .then(d => setIndustries((d.industries || []).map((i: { industry_id: string; label: string }) => ({ industry_id: i.industry_id, label: i.label }))))
      .catch(() => {})
  }, [])

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const runScore = async (offset = 0) => {
    setLoading(true); setError(null)
    // Remember this candidate context so call sheets opened elsewhere (e.g. a
    // donor profile) carry the same fit picture.
    setClientCandidate({
      party: party || undefined,
      district_type: districtType || undefined,
      district_value: districtValue || undefined,
      target_industries: [...selIndustries],
      target_issues: [...selIssues],
      candidate_name: candName.trim() || undefined,
      office_label: candOffice.trim() || undefined,
      fundraising_url: candUrl.trim() || undefined,
    })
    try {
      const res = await fecApi.scoreProspects({
        party: party || undefined,
        district_type: districtType || undefined,
        district_value: districtValue || undefined,
        county: county || undefined,
        target_industries: [...selIndustries],
        target_issues: [...selIssues],
        state: stateFilter || undefined,
        min_total: minTotal ? Number(minTotal) : 0,
        exclude_orgs: excludeOrgs,
        require_district: requireDistrict,
        require_party_match: requirePartyMatch,
        only_with_contact: onlyWithContact,
        prioritize_contacts: prioritizeContacts,
        limit: PER,
        offset,
      })
      setData(res)
      setPage(Math.floor(offset / PER))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scoring failed')
    } finally {
      setLoading(false)
    }
  }

  const rowCallsheet = (r: Prospect) => {
    const [keyName, keyState] = r.contributor_key.split('|')
    const params: Record<string, string> = { composite: r.composite.toFixed(1) }
    if (districtType) params.district_type = districtType
    if (districtValue) params.district_value = districtValue
    if (candName.trim()) params.candidate_name = candName.trim()
    if (candOffice.trim()) params.office_label = candOffice.trim()
    if (candUrl.trim()) params.fundraising_url = candUrl.trim()
    return { name: r.contributor_name || keyName, state: keyState || '', params }
  }

  const [batchLoading, setBatchLoading] = useState(false)
  // Batch call-sheet candidate/campaign prompt (mirrors the single-donor CallsheetLauncher + DonorsPage)
  const [csFormOpen, setCsFormOpen] = useState(false)
  const [csRole, setCsRole] = useState<'candidate' | 'staff'>(_cc?.caller_role || 'staff')

  const downloadBatch = async () => {
    if (!data?.results.length) return
    // Persist the candidate/caller choices so every sheet (and other pages) match.
    updateClientCandidate({
      caller_role: csRole,
      candidate_name: candName.trim() || undefined,
      office_label: candOffice.trim() || undefined,
      fundraising_url: candUrl.trim() || undefined,
    })
    setBatchLoading(true)
    try {
      const donors = data.results.slice(0, 25).map(r => {
        const [name, state] = r.contributor_key.split('|')
        return { name: r.contributor_name || name, state, composite: r.composite }
      })
      const res = await fetch('/api/prospects/callsheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donors,
          district_type: districtType || undefined,
          district_value: districtValue || undefined,
          candidate_name: candName.trim() || undefined,
          office_label: candOffice.trim() || undefined,
          fundraising_url: candUrl.trim() || undefined,
          caller_role: csRole,
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `callsheets_${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setCsFormOpen(false)
    } catch {
      setError('Callsheet batch failed')
    } finally {
      setBatchLoading(false)
    }
  }

  const districtCell = (r: Prospect) => {
    const d = districtType === 'us_house' ? r.us_house_district
      : districtType === 'mo_senate' ? r.mo_senate_district
      : districtType === 'mo_house' ? r.mo_house_district
      : (r.mo_house_district || r.us_house_district)
    if (!d) return <span className="text-terminal-border">—</span>
    const inTarget = districtType && districtValue && d === districtValue.padStart(3, '0')
    return <span className={inTarget ? 'text-terminal-green font-bold' : 'text-terminal-muted'}>{d}</span>
  }

  const industryLabel = (id: string | null) =>
    id ? (industries.find(i => i.industry_id === id)?.label ?? id) : null

  const cols = [
    {
      key: 'rank', header: '#', width: '4%',
      render: (r: Prospect) => {
        const idx = (data?.results.indexOf(r) ?? 0) + page * PER + 1
        return <span className="text-terminal-border text-xs">{idx}</span>
      },
    },
    {
      key: 'score', header: 'Score', width: '12%',
      render: (r: Prospect) => <Composite value={r.composite} />,
    },
    {
      key: 'name', header: 'Donor', width: '17%',
      render: (r: Prospect) => {
        const [name, state] = r.contributor_key.split('|')
        return (
          <div className="flex items-center gap-1 leading-tight">
            <button
              onClick={() => {
                const p = new URLSearchParams({ name: r.contributor_name || name })
                if (state) p.set('state', state)
                navigate(`/donors/profile?${p}`)
              }}
              className="text-terminal-accent hover:underline text-left"
            >
              {r.contributor_name}
              {r.source === 'fec' && <span className="ml-1 text-[10px] text-terminal-border">FEC</span>}
            </button>
            {r.has_contact ? (
              <Tooltip content="We have saved contact info for this donor"><span className="text-[9px] text-terminal-green border border-terminal-green rounded px-1 cursor-default">✓</span></Tooltip>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'party', header: 'Lean', width: '9%',
      render: (r: Prospect) => <PartyBadge party={r.party} confidence={r.party_confidence} />,
    },
    {
      key: 'rfm', header: 'R / F / M', width: '13%',
      render: (r: Prospect) => (
        <div className="flex items-center gap-1.5">
          <Quintile score={r.r_score} label="Recency" />
          <Quintile score={r.f_score} label="Frequency" />
          <Quintile score={r.m_score} label="Monetary" />
        </div>
      ),
    },
    {
      key: 'cap', header: 'Capacity', width: '8%',
      render: (r: Prospect) => (
        <Tooltip content={`Max single gift ${fmt(r.max_gift)} (quintile ${r.cap_score}/5)`}>
          <span className="text-terminal-muted text-xs cursor-default">{fmt(r.max_gift)}</span>
        </Tooltip>
      ),
    },
    {
      key: 'district', header: 'District', width: '8%',
      render: districtCell,
    },
    {
      key: 'industry', header: 'Industry', width: '11%',
      render: (r: Prospect) => {
        const lbl = industryLabel(r.industry_id)
        const hit = selIndustries.has(r.industry_id || '')
        return lbl
          ? <span className={`text-xs ${hit ? 'text-terminal-green font-bold' : 'text-terminal-muted'}`}>{lbl}</span>
          : <span className="text-terminal-border">—</span>
      },
    },
    {
      key: 'total', header: 'Lifetime $', width: '9%',
      render: (r: Prospect) => (
        <span className="text-terminal-text text-xs">{fmt(r.total_amount)}</span>
      ),
    },
    {
      key: 'last', header: 'Last', width: '6%',
      render: (r: Prospect) => (
        <span className="text-terminal-muted text-xs">{r.last_gift_year || '—'}</span>
      ),
    },
    {
      key: 'sheet', header: '', width: '5%',
      render: (r: Prospect) => {
        const cs = rowCallsheet(r)
        return (
          <Tooltip content="Generate a tailored 2-page call sheet + script (asks who's calling; optional donor contact)">
            <CallsheetLauncher name={cs.name} state={cs.state} params={cs.params}
              className="text-terminal-border hover:text-terminal-accent transition-colors text-sm cursor-pointer">📄</CallsheetLauncher>
          </Tooltip>
        )
      },
    },
  ]

  const exportCsv = () => {
    if (!data) return
    const headers = ['Rank', 'Score', 'Donor', 'State', 'Lean', 'Confidence', 'R', 'F', 'M', 'Capacity', 'MaxGift', 'District', 'Industry', 'LifetimeTotal', 'Gifts', 'LastYear', 'Source']
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const dCol = (r: Prospect) => districtType === 'us_house' ? r.us_house_district
      : districtType === 'mo_senate' ? r.mo_senate_district : r.mo_house_district
    const lines = [headers.join(',')]
    data.results.forEach((r, i) => {
      lines.push([
        i + 1 + page * PER, r.composite.toFixed(1), r.contributor_name, r.contributor_state ?? '',
        r.party ?? '', r.party_confidence, r.r_score, r.f_score, r.m_score, r.cap_score, r.max_gift,
        dCol(r) ?? '', industryLabel(r.industry_id) ?? '', r.total_amount, r.gift_count,
        r.last_gift_year ?? '', r.source,
      ].map(esc).join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prospects_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    logExport('prospects', `party:${party} district:${districtType}/${districtValue}`, data.results.length)
  }

  const built = opts?.built ? new Date(opts.built + 'Z').toLocaleDateString() : null
  const totalPages = data ? Math.ceil(data.count / PER) : 0

  return (
    <div className="flex flex-col h-full">
      <TopBarPortal>
      {/* ── Header / client-candidate form ─────────────────────────────── */}
      <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-terminal-accent font-bold uppercase tracking-wider text-sm">Prospect Scoring</h1>
          <span className="text-terminal-muted text-xs">Rank donors as fundraising prospects for a client candidate</span>
          {opts && (
            <span className="ml-auto text-terminal-muted text-[11px]">
              {opts.rfm_stats.total.toLocaleString()} donors scored{built ? ` · built ${built}` : ''}
            </span>
          )}
        </div>

        {/* Candidate identity — personalizes call sheets/scripts. Set once, reused everywhere. */}
        <div className="mb-2 pb-2 border-b border-terminal-border/50">
          <div className="text-terminal-muted text-[11px] uppercase tracking-wider mb-1">
            Your Candidate <span className="text-terminal-border normal-case">(fills the call script — set once, reused on every sheet; blanks left if empty)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input className="input-field" value={candName} placeholder="Candidate name (e.g. Jane Smith)"
              onChange={e => setCandName(e.target.value)}
              onBlur={() => updateClientCandidate({ candidate_name: candName.trim() || undefined })} />
            <input className="input-field" value={candOffice} placeholder="Office / region (e.g. Missouri House District 50)"
              onChange={e => setCandOffice(e.target.value)}
              onBlur={() => updateClientCandidate({ office_label: candOffice.trim() || undefined })} />
            <input className="input-field" value={candUrl} placeholder="Donate link (ActBlue/WinRed URL)"
              onChange={e => setCandUrl(e.target.value)}
              onBlur={() => updateClientCandidate({ fundraising_url: candUrl.trim() || undefined })} />
          </div>
        </div>

        {/* Candidate profile row */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
          <label className="flex flex-col gap-0.5">
            <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Candidate Party</span>
            <select className="input-field" value={party} onChange={e => setParty(e.target.value)}>
              <option value="">— Any —</option>
              <option value="DEM">Democrat</option>
              <option value="REP">Republican</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-terminal-muted text-[11px] uppercase tracking-wider">District Type</span>
            <select className="input-field" value={districtType} onChange={e => { setDistrictType(e.target.value); setDistrictValue('') }}>
              <option value="">— None —</option>
              {Object.entries(DISTRICT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-terminal-muted text-[11px] uppercase tracking-wider">District #</span>
            {districtType && opts?.districts[districtType as keyof ProspectOptions['districts']]?.length
              ? (
                <select className="input-field" value={districtValue} onChange={e => setDistrictValue(e.target.value)}>
                  <option value="">— Select —</option>
                  {opts.districts[districtType as keyof ProspectOptions['districts']].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              )
              : <input className="input-field" value={districtValue} onChange={e => setDistrictValue(e.target.value)} placeholder="e.g. 24" disabled={!districtType} />}
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-terminal-muted text-[11px] uppercase tracking-wider">County</span>
            {opts?.counties?.length
              ? (
                <select className="input-field" value={county} onChange={e => setCounty(e.target.value)}>
                  <option value="">— Any —</option>
                  {opts.counties.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )
              : <input className="input-field" value={county} onChange={e => setCounty(e.target.value)} placeholder="e.g. Boone" />}
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Donor State</span>
            <input className="input-field" value={stateFilter} onChange={e => setStateFilter(e.target.value.toUpperCase())} placeholder="MO" maxLength={2} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Min Lifetime $</span>
            <input className="input-field" value={minTotal} onChange={e => setMinTotal(e.target.value)} type="number" placeholder="200" />
          </label>
          <button onClick={() => runScore(0)} disabled={loading} className="btn-primary py-2 disabled:opacity-50">
            {loading ? 'Scoring…' : 'Score Prospects'}
          </button>
        </div>

        {/* Target industries */}
        <div className="mt-2 pt-2 border-t border-terminal-border/50">
          <div className="text-terminal-muted text-[11px] uppercase tracking-wider mb-1">Target Industries <span className="text-terminal-border normal-case">(donors in these industries score higher)</span></div>
          <div className="flex flex-wrap gap-1">
            {industries.map(i => (
              <button key={i.industry_id} onClick={() => toggle(setSelIndustries, i.industry_id)}
                className={`px-2 py-0.5 text-[11px] border rounded transition-colors ${selIndustries.has(i.industry_id) ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10' : 'border-terminal-border text-terminal-muted hover:border-terminal-muted'}`}>
                {i.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target issues */}
        <div className="mt-2 pt-2 border-t border-terminal-border/50">
          <div className="text-terminal-muted text-[11px] uppercase tracking-wider mb-1">Campaign Issues <span className="text-terminal-border normal-case">(donors motivated by these score higher)</span></div>
          <div className="flex flex-wrap gap-1">
            {ISSUE_OPTIONS.map(i => (
              <button key={i.id} onClick={() => toggle(setSelIssues, i.id)}
                className={`px-2 py-0.5 text-[11px] border rounded transition-colors ${selIssues.has(i.id) ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10' : 'border-terminal-border text-terminal-muted hover:border-terminal-muted'}`}>
                {i.label}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="mt-2 pt-2 border-t border-terminal-border/50 flex flex-wrap gap-4 text-[11px] text-terminal-muted">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={excludeOrgs} onChange={e => setExcludeOrgs(e.target.checked)} />
            Exclude organizations / PACs
          </label>
          <label className={`flex items-center gap-1.5 cursor-pointer ${!districtType ? 'opacity-40' : ''}`}>
            <input type="checkbox" checked={requireDistrict} disabled={!districtType} onChange={e => setRequireDistrict(e.target.checked)} />
            Only in-district donors
          </label>
          <label className={`flex items-center gap-1.5 cursor-pointer ${!party ? 'opacity-40' : ''}`}>
            <input type="checkbox" checked={requirePartyMatch} disabled={!party} onChange={e => setRequirePartyMatch(e.target.checked)} />
            Only party-aligned donors
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={onlyWithContact} onChange={e => setOnlyWithContact(e.target.checked)} />
            Only donors with saved contact info
          </label>
          <label className={`flex items-center gap-1.5 cursor-pointer ${onlyWithContact ? 'opacity-40' : ''}`}>
            <input type="checkbox" checked={prioritizeContacts} disabled={onlyWithContact} onChange={e => setPrioritizeContacts(e.target.checked)} />
            Prioritize contacts, then same-party prospects
          </label>
          {data && (
            <span className="ml-auto text-terminal-border">
              Weighting: {data.active_components.join(' · ')}
            </span>
          )}
        </div>
      </div>
      </TopBarPortal>

      {/* ── Results ────────────────────────────────────────────────────── */}
      {data && (
        <div className="px-4 py-1.5 border-b border-terminal-border flex items-center gap-3 text-xs text-terminal-muted">
          <span><span className="text-terminal-text font-bold">{data.count.toLocaleString()}</span> prospects ranked</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button disabled={page === 0 || loading} onClick={() => runScore((page - 1) * PER)}
                className="px-2 py-0.5 border border-terminal-border hover:border-terminal-accent hover:text-terminal-accent disabled:opacity-30 transition-colors">‹</button>
              <span>{page + 1} / {totalPages}</span>
              <button disabled={page + 1 >= totalPages || loading} onClick={() => runScore((page + 1) * PER)}
                className="px-2 py-0.5 border border-terminal-border hover:border-terminal-accent hover:text-terminal-accent disabled:opacity-30 transition-colors">›</button>
            </div>
          )}
          <button onClick={() => setCsFormOpen(true)} disabled={batchLoading} className="ml-auto border border-terminal-border hover:border-terminal-accent hover:text-terminal-accent px-2 py-0.5 uppercase tracking-wider transition-colors disabled:opacity-40">
            {batchLoading ? 'Building…' : '📄 Callsheets (top 25)'}
          </button>
          <button onClick={exportCsv} className="border border-terminal-border hover:border-terminal-accent hover:text-terminal-accent px-2 py-0.5 uppercase tracking-wider transition-colors">Export CSV</button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {!data && !loading && !error && (
          <div className="p-8 text-center text-terminal-muted text-sm">
            Set a client-candidate profile above and click <span className="text-terminal-accent">Score Prospects</span> to rank donors by fit.
          </div>
        )}
        <DataTable<Prospect>
          columns={cols}
          rows={data?.results ?? []}
          rowKey={r => r.contributor_key}
          loading={loading}
          error={error}
          count={data?.count}
        />
      </div>

      {/* ── Batch call-sheet: verify candidate + caller before generating ─── */}
      {csFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setCsFormOpen(false)}>
          <div className="bg-terminal-panel border border-terminal-border rounded-lg p-4 w-[24rem] max-w-full max-h-[90vh] overflow-auto text-sm" onClick={e => e.stopPropagation()}>
            <div className="text-terminal-accent font-bold uppercase tracking-wider text-xs mb-1">
              Call sheets — top {Math.min(data?.results.length ?? 0, 25)} prospect{(data?.results.length ?? 0) === 1 ? '' : 's'}
            </div>
            <div className="text-terminal-muted text-xs mb-3">One PDF — a dossier + tailored call script per person, personalized to your candidate and a suggested-ask ladder.</div>

            <div className="text-terminal-muted text-[11px] uppercase tracking-wider mb-1.5">Your candidate</div>
            <div className="mb-3">
              <CampaignFields
                candidateName={candName} setCandidateName={setCandName}
                office={candOffice} setOffice={setCandOffice}
                link={candUrl} setLink={setCandUrl}
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
              <button onClick={downloadBatch} disabled={batchLoading} className="btn-primary flex-1 py-1.5 disabled:opacity-50">
                {batchLoading ? 'Building PDF…' : 'Generate PDF'}
              </button>
              <button onClick={() => setCsFormOpen(false)}
                className="px-3 py-1.5 text-xs text-terminal-muted border border-terminal-border rounded hover:text-terminal-text transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
