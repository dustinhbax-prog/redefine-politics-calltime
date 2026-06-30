import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DataTable from '../components/DataTable'
import PartyBadge from '../components/PartyBadge'
import Tooltip from '../components/Tooltip'
import CallsheetLauncher from '../components/CallsheetLauncher'
import CampaignFields from '../components/CampaignFields'
import { TopBarPortal } from '../lib/topbar'
import { fecApi, logExport, type DonorListRow, type ProspectOptions } from '../api/fec'
import { getClientCandidate, updateClientCandidate } from '../lib/clientCandidate'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const DISTRICT_LABELS: Record<string, string> = {
  us_house: 'US House (CD)',
  mo_house: 'MO House',
  mo_senate: 'MO Senate',
}

type Mode = 'lookalike' | 'lapsed' | 'sustainers'

const MODES: { id: Mode; label: string; glyph: string; blurb: string }[] = [
  { id: 'lookalike', label: 'Look-alike', glyph: '👥',
    blurb: 'Find donors statistically similar to a committee’s existing supporters — “people like your donors.”' },
  { id: 'lapsed', label: 'Lapsed donors', glyph: '🕰',
    blurb: 'Valuable donors who’ve gone quiet — ranked for reactivation, freshest lapses first.' },
  { id: 'sustainers', label: 'Sustainer targets', glyph: '🔁',
    blurb: 'Loyal small-dollar donors — the best candidates to convert to monthly recurring gifts.' },
]

// 5 dots, filled up to the quintile score.
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

// 0..100 score bar (shared by every mode's primary metric).
function ScoreBar({ value }: { value: number }) {
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

export default function FundraisingListsPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('lookalike')
  const [opts, setOpts] = useState<ProspectOptions | null>(null)
  const [industries, setIndustries] = useState<{ industry_id: string; label: string }[]>([])

  // Candidate identity (persisted) — personalizes the call sheets these lists feed.
  const _cc = getClientCandidate()
  const [candName, setCandName] = useState(_cc?.candidate_name || '')
  const [candOffice, setCandOffice] = useState(_cc?.office_label || '')
  const [candUrl, setCandUrl] = useState(_cc?.fundraising_url || '')
  const [csRole, setCsRole] = useState<'candidate' | 'staff'>(_cc?.caller_role || 'staff')

  // Shared filters
  const [party, setParty] = useState(_cc?.party || '')
  const [districtType, setDistrictType] = useState(_cc?.district_type || '')
  const [districtValue, setDistrictValue] = useState(_cc?.district_value || '')
  const [county, setCounty] = useState('')
  const [stateFilter, setStateFilter] = useState('MO')
  const [excludeOrgs, setExcludeOrgs] = useState(true)
  const [requirePartyMatch, setRequirePartyMatch] = useState(false)

  // Mode-specific
  const [seedCommittee, setSeedCommittee] = useState('')   // look-alike: seed MEC id
  const [minTotal, setMinTotal] = useState('100')          // look-alike + lapsed
  const [quietYears, setQuietYears] = useState('2')        // lapsed
  const [minGifts, setMinGifts] = useState('2')            // lapsed + sustainers
  const [maxGift, setMaxGift] = useState('250')            // sustainers
  const [activeSince, setActiveSince] = useState('')       // sustainers (blank → backend default)

  const [rows, setRows] = useState<DonorListRow[]>([])
  const [count, setCount] = useState<number | null>(null)   // null = unknown (look-alike)
  const [seedSize, setSeedSize] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ran, setRan] = useState(false)
  const [page, setPage] = useState(0)
  const PER = 100

  useEffect(() => {
    fecApi.prospectOptions().then(setOpts).catch(() => {})
    fetch('/api/industries').then(r => r.json())
      .then(d => setIndustries((d.industries || []).map((i: { industry_id: string; label: string }) =>
        ({ industry_id: i.industry_id, label: i.label }))))
      .catch(() => {})
  }, [])

  const industryLabel = (id: string | null) =>
    id ? (industries.find(i => i.industry_id === id)?.label ?? id) : null

  const run = async (offset = 0) => {
    setLoading(true); setError(null)
    updateClientCandidate({
      candidate_name: candName.trim() || undefined,
      office_label: candOffice.trim() || undefined,
      fundraising_url: candUrl.trim() || undefined,
      caller_role: csRole,
      party: party || undefined,
      district_type: districtType || undefined,
      district_value: districtValue || undefined,
    })
    try {
      if (mode === 'lookalike') {
        if (!seedCommittee.trim()) {
          setError('Enter a committee MEC ID to seed the look-alike model.')
          setLoading(false); return
        }
        const res = await fecApi.lookalike({
          seed_committee: seedCommittee.trim(),
          state: stateFilter || undefined,
          exclude_orgs: excludeOrgs,
          min_total: minTotal ? Number(minTotal) : 0,
          limit: PER, offset,
        })
        setRows(res.results); setCount(null); setSeedSize(res.seed_size)
      } else if (mode === 'lapsed') {
        const res = await fecApi.lapsedDonors({
          party: party || undefined,
          district_type: districtType || undefined,
          district_value: districtValue || undefined,
          county: county || undefined,
          state: stateFilter || undefined,
          quiet_years: Number(quietYears) || 2,
          min_total: minTotal ? Number(minTotal) : 0,
          min_gifts: Number(minGifts) || 2,
          exclude_orgs: excludeOrgs,
          require_party_match: requirePartyMatch,
          limit: PER, offset,
        })
        setRows(res.results); setCount(res.count); setSeedSize(null)
      } else {
        const res = await fecApi.sustainers({
          party: party || undefined,
          district_type: districtType || undefined,
          district_value: districtValue || undefined,
          county: county || undefined,
          state: stateFilter || undefined,
          max_gift: Number(maxGift) || 250,
          min_gifts: Number(minGifts) || 3,
          active_since_year: activeSince ? Number(activeSince) : undefined,
          exclude_orgs: excludeOrgs,
          require_party_match: requirePartyMatch,
          limit: PER, offset,
        })
        setRows(res.results); setCount(res.count); setSeedSize(null)
      }
      setPage(Math.floor(offset / PER))
      setRan(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  // Switching mode clears stale results so the table never shows the wrong metric.
  const switchMode = (m: Mode) => {
    if (m === mode) return
    setMode(m); setRows([]); setCount(null); setSeedSize(null); setRan(false); setError(null); setPage(0)
  }

  const metricVal = (r: DonorListRow) =>
    mode === 'lookalike' ? (r.similarity ?? 0)
      : mode === 'lapsed' ? (r.reactivation_score ?? 0)
        : (r.sustainer_score ?? 0)
  const metricHeader = mode === 'lookalike' ? 'Similarity' : mode === 'lapsed' ? 'Reactivate' : 'Sustainer'

  const rowCallsheet = (r: DonorListRow) => {
    const [keyName, keyState] = r.contributor_key.split('|')
    const params: Record<string, string> = {}
    if (districtType) params.district_type = districtType
    if (districtValue) params.district_value = districtValue
    if (party) params.party = party
    if (candName.trim()) params.candidate_name = candName.trim()
    if (candOffice.trim()) params.office_label = candOffice.trim()
    if (candUrl.trim()) params.fundraising_url = candUrl.trim()
    if (mode === 'sustainers' && r.suggested_monthly) params.ask_override = String(r.suggested_monthly)
    return { name: r.contributor_name || keyName, state: keyState || '', params }
  }

  const districtCell = (r: DonorListRow) => {
    const d = districtType === 'us_house' ? r.us_house_district
      : districtType === 'mo_senate' ? r.mo_senate_district
        : districtType === 'mo_house' ? r.mo_house_district
          : (r.mo_house_district || r.us_house_district)
    if (!d) return <span className="text-terminal-border">—</span>
    const inTarget = districtType && districtValue && d === districtValue.padStart(3, '0')
    return <span className={inTarget ? 'text-terminal-green font-bold' : 'text-terminal-muted'}>{d}</span>
  }

  const cols = [
    {
      key: 'rank', header: '#', width: '4%',
      render: (r: DonorListRow) => <span className="text-terminal-border text-xs">{rows.indexOf(r) + 1 + page * PER}</span>,
    },
    {
      key: 'metric', header: metricHeader, width: '12%',
      render: (r: DonorListRow) => <ScoreBar value={metricVal(r)} />,
    },
    {
      key: 'name', header: 'Donor', width: '18%',
      render: (r: DonorListRow) => {
        const [name, state] = r.contributor_key.split('|')
        return (
          <div className="flex items-center gap-1 leading-tight">
            <button
              onClick={() => {
                const p = new URLSearchParams({ name: r.contributor_name || name })
                if (state) p.set('state', state)
                navigate(`/donors/profile?${p}`)
              }}
              className="text-terminal-accent hover:underline text-left">
              {r.contributor_name}
              {r.source === 'fec' && <span className="ml-1 text-[10px] text-terminal-border">FEC</span>}
            </button>
            {r.has_contact ? (
              <Tooltip content="We have saved contact info for this donor">
                <span className="text-[9px] text-terminal-green border border-terminal-green rounded px-1 cursor-default">✓</span>
              </Tooltip>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'party', header: 'Lean', width: '9%',
      render: (r: DonorListRow) => <PartyBadge party={r.party} confidence={r.party_confidence} />,
    },
    {
      key: 'rfm', header: 'R / F / M', width: '12%',
      render: (r: DonorListRow) => (
        <div className="flex items-center gap-1.5">
          <Quintile score={r.r_score} label="Recency" />
          <Quintile score={r.f_score} label="Frequency" />
          <Quintile score={r.m_score} label="Monetary" />
        </div>
      ),
    },
    {
      key: 'cap', header: 'Largest', width: '8%',
      render: (r: DonorListRow) => (
        <Tooltip content={`Largest single gift ${fmt(r.max_gift)} (quintile ${r.cap_score}/5)`}>
          <span className="text-terminal-muted text-xs cursor-default">{fmt(r.max_gift)}</span>
        </Tooltip>
      ),
    },
    // Mode-specific extra column
    ...(mode === 'lapsed' ? [{
      key: 'quiet', header: 'Quiet', width: '7%',
      render: (r: DonorListRow) => (
        <Tooltip content={`No gift in ~${r.years_quiet} year(s)`}>
          <span className="text-terminal-muted text-xs cursor-default">{r.years_quiet ?? '—'}y</span>
        </Tooltip>
      ),
    }] : []),
    ...(mode === 'sustainers' ? [{
      key: 'monthly', header: 'Monthly', width: '8%',
      render: (r: DonorListRow) => (
        <Tooltip content="Suggested monthly recurring ask (heuristic anchor from their typical gift)">
          <span className="text-terminal-green text-xs font-bold cursor-default">{fmt(r.suggested_monthly ?? 0)}/mo</span>
        </Tooltip>
      ),
    }] : []),
    {
      key: 'district', header: 'District', width: '8%',
      render: districtCell,
    },
    {
      key: 'total', header: 'Lifetime $', width: '9%',
      render: (r: DonorListRow) => <span className="text-terminal-text text-xs">{fmt(r.total_amount)}</span>,
    },
    {
      key: 'last', header: 'Last', width: '6%',
      render: (r: DonorListRow) => <span className="text-terminal-muted text-xs">{r.last_gift_year || '—'}</span>,
    },
    {
      key: 'sheet', header: '', width: '5%',
      render: (r: DonorListRow) => {
        const cs = rowCallsheet(r)
        return (
          <CallsheetLauncher name={cs.name} state={cs.state} params={cs.params}
            title="Generate a tailored 2-page call sheet + script"
            className="text-terminal-border hover:text-terminal-accent transition-colors text-sm cursor-pointer">📄</CallsheetLauncher>
        )
      },
    },
  ]

  const [batchLoading, setBatchLoading] = useState(false)
  const downloadBatch = async () => {
    if (!rows.length) return
    updateClientCandidate({
      caller_role: csRole,
      candidate_name: candName.trim() || undefined,
      office_label: candOffice.trim() || undefined,
      fundraising_url: candUrl.trim() || undefined,
    })
    setBatchLoading(true)
    try {
      const donors = rows.slice(0, 25).map(r => {
        const [name, state] = r.contributor_key.split('|')
        return { name: r.contributor_name || name, state, composite: metricVal(r) }
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
      a.download = `${mode}_callsheets_${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Callsheet batch failed')
    } finally {
      setBatchLoading(false)
    }
  }

  const exportCsv = () => {
    if (!rows.length) return
    const headers = ['Rank', metricHeader, 'Donor', 'State', 'Lean', 'Confidence',
      'R', 'F', 'M', 'LargestGift', ...(mode === 'lapsed' ? ['YearsQuiet'] : []),
      ...(mode === 'sustainers' ? ['SuggestedMonthly'] : []),
      'District', 'Industry', 'LifetimeTotal', 'Gifts', 'LastYear', 'Source']
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const dCol = (r: DonorListRow) => districtType === 'us_house' ? r.us_house_district
      : districtType === 'mo_senate' ? r.mo_senate_district : r.mo_house_district
    const lines = [headers.join(',')]
    rows.forEach((r, i) => {
      lines.push([
        i + 1 + page * PER, metricVal(r).toFixed(1), r.contributor_name, r.contributor_state ?? '',
        r.party ?? '', r.party_confidence, r.r_score, r.f_score, r.m_score, r.max_gift,
        ...(mode === 'lapsed' ? [r.years_quiet ?? ''] : []),
        ...(mode === 'sustainers' ? [r.suggested_monthly ?? ''] : []),
        dCol(r) ?? '', industryLabel(r.industry_id) ?? '', r.total_amount, r.gift_count,
        r.last_gift_year ?? '', r.source,
      ].map(esc).join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${mode}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    logExport(`fundraising_${mode}`, `party:${party} district:${districtType}/${districtValue}`, rows.length)
  }

  const totalPages = count != null ? Math.ceil(count / PER) : null
  const hasNext = count != null ? page + 1 < (totalPages ?? 0) : rows.length === PER
  const activeMode = MODES.find(m => m.id === mode)!

  // District + county selectors (shared by lapsed + sustainers)
  const districtControls = (
    <>
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
              <option value="">— Any —</option>
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
        <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Party</span>
        <select className="input-field" value={party} onChange={e => setParty(e.target.value)}>
          <option value="">— Any —</option>
          <option value="DEM">Democrat</option>
          <option value="REP">Republican</option>
        </select>
      </label>
    </>
  )

  return (
    <div className="flex flex-col h-full">
      <TopBarPortal>
        <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-terminal-accent font-bold uppercase tracking-wider text-sm">Fundraising Lists</h1>
            <span className="text-terminal-muted text-xs">Ready-made donor lists that feed straight into call sheets & exports</span>
            {opts && (
              <span className="ml-auto text-terminal-muted text-[11px]">
                {opts.rfm_stats.total.toLocaleString()} donors in pool
              </span>
            )}
          </div>

          {/* Mode tabs */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {MODES.map(m => (
              <button key={m.id} onClick={() => switchMode(m.id)}
                className={`px-3 py-1.5 text-xs border rounded transition-colors ${mode === m.id
                  ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10 font-bold'
                  : 'border-terminal-border text-terminal-muted hover:border-terminal-muted'}`}>
                <span className="mr-1">{m.glyph}</span>{m.label}
              </button>
            ))}
          </div>
          <div className="text-terminal-border text-[11px] mb-3">{activeMode.blurb}</div>

          {/* Candidate identity — personalizes the call sheets these lists feed. */}
          <div className="mb-2 pb-2 border-b border-terminal-border/50">
            <div className="text-terminal-muted text-[11px] uppercase tracking-wider mb-1">
              Your Candidate <span className="text-terminal-border normal-case">(fills the call sheet/script — set once, reused everywhere)</span>
            </div>
            <CampaignFields
              candidateName={candName} setCandidateName={setCandName}
              office={candOffice} setOffice={setCandOffice}
              link={candUrl} setLink={setCandUrl}
            />
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Caller:</span>
              {([['candidate', "I'm the candidate"], ['staff', 'Staff / proxy']] as const).map(([v, lbl]) => (
                <button key={v} onClick={() => setCsRole(v)}
                  className={`px-2 py-0.5 text-[11px] border rounded transition-colors ${csRole === v
                    ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
                    : 'border-terminal-border text-terminal-muted hover:border-terminal-muted'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Mode-specific filter row */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
            {mode === 'lookalike' && (
              <>
                <label className="flex flex-col gap-0.5 col-span-2 md:col-span-2">
                  <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Seed committee (MEC ID)</span>
                  <input className="input-field" value={seedCommittee} onChange={e => setSeedCommittee(e.target.value)}
                    placeholder="e.g. C201499 — model this committee's donors" />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Donor State</span>
                  <input className="input-field" value={stateFilter} onChange={e => setStateFilter(e.target.value.toUpperCase())} placeholder="MO" maxLength={2} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Min Lifetime $</span>
                  <input className="input-field" value={minTotal} onChange={e => setMinTotal(e.target.value)} type="number" placeholder="100" />
                </label>
              </>
            )}

            {mode === 'lapsed' && (
              <>
                {districtControls}
                <label className="flex flex-col gap-0.5">
                  <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Quiet ≥ (yrs)</span>
                  <input className="input-field" value={quietYears} onChange={e => setQuietYears(e.target.value)} type="number" min={1} placeholder="2" />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Min Lifetime $</span>
                  <input className="input-field" value={minTotal} onChange={e => setMinTotal(e.target.value)} type="number" placeholder="100" />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Min gifts</span>
                  <input className="input-field" value={minGifts} onChange={e => setMinGifts(e.target.value)} type="number" min={1} placeholder="2" />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Donor State</span>
                  <input className="input-field" value={stateFilter} onChange={e => setStateFilter(e.target.value.toUpperCase())} placeholder="MO" maxLength={2} />
                </label>
              </>
            )}

            {mode === 'sustainers' && (
              <>
                {districtControls}
                <label className="flex flex-col gap-0.5">
                  <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Max single gift $</span>
                  <input className="input-field" value={maxGift} onChange={e => setMaxGift(e.target.value)} type="number" placeholder="250" />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Min gifts</span>
                  <input className="input-field" value={minGifts} onChange={e => setMinGifts(e.target.value)} type="number" min={2} placeholder="3" />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Active since (yr)</span>
                  <input className="input-field" value={activeSince} onChange={e => setActiveSince(e.target.value)} type="number" placeholder="auto" />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-terminal-muted text-[11px] uppercase tracking-wider">Donor State</span>
                  <input className="input-field" value={stateFilter} onChange={e => setStateFilter(e.target.value.toUpperCase())} placeholder="MO" maxLength={2} />
                </label>
              </>
            )}

            <button onClick={() => run(0)} disabled={loading} className="btn-primary py-2 disabled:opacity-50">
              {loading ? 'Building…' : 'Build list'}
            </button>
          </div>

          {/* Toggles */}
          <div className="mt-2 pt-2 border-t border-terminal-border/50 flex flex-wrap gap-4 text-[11px] text-terminal-muted">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={excludeOrgs} onChange={e => setExcludeOrgs(e.target.checked)} />
              Exclude organizations / PACs
            </label>
            {mode !== 'lookalike' && (
              <label className={`flex items-center gap-1.5 cursor-pointer ${!party ? 'opacity-40' : ''}`}>
                <input type="checkbox" checked={requirePartyMatch} disabled={!party} onChange={e => setRequirePartyMatch(e.target.checked)} />
                Only party-aligned donors
              </label>
            )}
            {seedSize != null && (
              <span className="text-terminal-border">Modeled on {seedSize.toLocaleString()} seed donors</span>
            )}
          </div>
        </div>
      </TopBarPortal>

      {/* Results toolbar */}
      {ran && (
        <div className="px-4 py-1.5 border-b border-terminal-border flex items-center gap-3 text-xs text-terminal-muted">
          <span>
            <span className="text-terminal-text font-bold">{(count ?? rows.length).toLocaleString()}</span>
            {count != null ? ' donors' : ' shown'}
          </span>
          {(page > 0 || hasNext) && (
            <div className="flex items-center gap-2">
              <button disabled={page === 0 || loading} onClick={() => run((page - 1) * PER)}
                className="px-2 py-0.5 border border-terminal-border hover:border-terminal-accent hover:text-terminal-accent disabled:opacity-30 transition-colors">‹</button>
              <span>{page + 1}{totalPages ? ` / ${totalPages}` : ''}</span>
              <button disabled={!hasNext || loading} onClick={() => run((page + 1) * PER)}
                className="px-2 py-0.5 border border-terminal-border hover:border-terminal-accent hover:text-terminal-accent disabled:opacity-30 transition-colors">›</button>
            </div>
          )}
          <button onClick={downloadBatch} disabled={batchLoading || !rows.length}
            className="ml-auto border border-terminal-border hover:border-terminal-accent hover:text-terminal-accent px-2 py-0.5 uppercase tracking-wider transition-colors disabled:opacity-40">
            {batchLoading ? 'Building…' : '📄 Callsheets (top 25)'}
          </button>
          <button onClick={exportCsv} disabled={!rows.length}
            className="border border-terminal-border hover:border-terminal-accent hover:text-terminal-accent px-2 py-0.5 uppercase tracking-wider transition-colors disabled:opacity-40">Export CSV</button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {!ran && !loading && !error && (
          <div className="p-8 text-center text-terminal-muted text-sm">
            {mode === 'lookalike'
              ? <>Paste a committee’s MEC ID above and click <span className="text-terminal-accent">Build list</span> to find donors like its supporters.</>
              : <>Set your filters above and click <span className="text-terminal-accent">Build list</span>.</>}
          </div>
        )}
        <DataTable<DonorListRow>
          columns={cols}
          rows={rows}
          rowKey={r => r.contributor_key}
          loading={loading}
          error={error}
          count={count ?? (ran ? rows.length : undefined)}
        />
      </div>
    </div>
  )
}
