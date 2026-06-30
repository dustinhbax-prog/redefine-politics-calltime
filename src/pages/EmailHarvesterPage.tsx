import { useState, useEffect } from 'react'
import { fecApi, type HarvestedLead, type HarvestSummary, type HarvesterNiches, type EnrichSummary } from '../api/fec'
import { TopBarPortal } from '../lib/topbar'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)

const CONF_STYLE: Record<string, string> = {
  high: 'text-terminal-green border-terminal-green',
  medium: 'text-yellow-400 border-yellow-600',
  low: 'text-orange-400 border-orange-600',
}

const STATUS_STYLE: Record<string, string> = {
  valid: 'text-terminal-green',
  risky: 'text-yellow-400',
  invalid: 'text-orange-400',
}

function csv(leads: HarvestedLead[]): string {
  const cols = ['email', 'name', 'party', 'is_donor', 'donor_confidence', 'lifetime_total', 'verify_score', 'verify_status', 'platform', 'source_url', 'campaign']
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [cols.join(','), ...leads.map(l => cols.map(c => esc((l as unknown as Record<string, unknown>)[c])).join(','))].join('\n')
}

export default function EmailHarvesterPage() {
  const [niches, setNiches] = useState<HarvesterNiches | null>(null)
  const [name, setName] = useState('boone-2026')
  const [places, setPlaces] = useState('Columbia Missouri')
  const [categories, setCategories] = useState<string[]>(['business', 'professional'])
  const [extra, setExtra] = useState('')
  const [party, setParty] = useState('')
  const [maxUrls, setMaxUrls] = useState(25)

  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<HarvestSummary | null>(null)
  const [leads, setLeads] = useState<HarvestedLead[]>([])
  const [donorsOnly, setDonorsOnly] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<{ total: number; donors: number; valid: number } | null>(null)

  // AI enrich-by-industry
  const [industries, setIndustries] = useState<string[]>([])
  const [industry, setIndustry] = useState('construction')
  const [enrichLimit, setEnrichLimit] = useState(8)
  const [enriching, setEnriching] = useState(false)
  const [enrichSummary, setEnrichSummary] = useState<EnrichSummary | null>(null)

  useEffect(() => { fecApi.harvesterNiches().then(setNiches).catch(() => {}) }, [])
  useEffect(() => { fecApi.harvesterIndustries().then(r => setIndustries(r.industries)).catch(() => {}) }, [])
  const loadStats = () => fecApi.harvesterStats().then(s => setStats(s)).catch(() => {})
  useEffect(() => { loadStats() }, [])

  const loadLeads = (campaign: string) =>
    fecApi.harvesterLeads({ campaign, donors_only: donorsOnly, limit: 500 })
      .then(r => setLeads(r.leads)).catch(() => {})

  useEffect(() => { if (summary) loadLeads(summary.campaign) }, [donorsOnly]) // eslint-disable-line

  const toggleCat = (c: string) =>
    setCategories(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c])

  async function run() {
    setRunning(true); setError(''); setSummary(null)
    try {
      const res = await fecApi.runHarvest({
        name,
        places: places.split(',').map(s => s.trim()).filter(Boolean),
        categories,
        extra_niches: extra.split(',').map(s => s.trim()).filter(Boolean),
        platforms: ['web'],
        party,
        state: 'MO',
        max_urls: maxUrls,
        max_queries: 20,
      })
      setSummary(res.summary)
      setLeads(res.leads)
      loadStats()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Harvest failed')
    } finally {
      setRunning(false)
    }
  }

  async function runEnrich() {
    setEnriching(true); setError(''); setEnrichSummary(null); setSummary(null)
    try {
      const res = await fecApi.enrichIndustry({ industry_id: industry, limit: enrichLimit })
      setEnrichSummary(res.summary)
      setLeads(res.leads)
      loadStats()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enrichment failed')
    } finally {
      setEnriching(false)
    }
  }

  function download() {
    const blob = new Blob([csv(leads)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name || 'harvest'}_leads.csv`
    a.click()
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <TopBarPortal><span className="font-display uppercase tracking-wide">📧 Email Harvester</span></TopBarPortal>

      <h1 className="page-title mb-1">Email Harvester</h1>
      <p className="font-body text-terminal-muted text-sm mb-5 max-w-3xl">
        Finds publicly-published emails for a region and set of niches, verifies deliverability,
        and auto-cross-matches each to a donor profile. Runs here on demand and nightly on its own.
        High yield on business / professional / org pages; private residents aren’t on the public web.
      </p>

      {stats && (
        <div className="flex gap-3 mb-5 text-sm">
          <div className="card-brand px-4 py-2"><span className="text-terminal-muted">Stored </span><b>{stats.total.toLocaleString()}</b></div>
          <div className="card-brand px-4 py-2"><span className="text-terminal-muted">Donor matches </span><b className="text-terminal-green">{stats.donors.toLocaleString()}</b></div>
          <div className="card-brand px-4 py-2"><span className="text-terminal-muted">Deliverable </span><b>{stats.valid.toLocaleString()}</b></div>
        </div>
      )}

      <div className="card-brand p-4 mb-6 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs uppercase text-terminal-muted">Campaign label</span>
          <input className="input-field w-full mt-1" value={name} onChange={e => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs uppercase text-terminal-muted">Places (comma-separated)</span>
          <input className="input-field w-full mt-1" value={places} onChange={e => setPlaces(e.target.value)}
            placeholder="Columbia Missouri, Jefferson City Missouri" />
        </label>

        <div className="block">
          <span className="text-xs uppercase text-terminal-muted">Categories</span>
          <div className="flex flex-wrap gap-2 mt-1">
            {(niches ? Object.keys(niches.library) : ['business', 'professional', 'political']).map(c => (
              <button key={c} type="button" onClick={() => toggleCat(c)}
                className={`px-3 py-1 rounded-full border text-xs uppercase ${categories.includes(c)
                  ? 'bg-terminal-green/10 text-terminal-green border-terminal-green'
                  : 'text-terminal-muted border-terminal-border'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-xs uppercase text-terminal-muted">Extra niches (comma-separated)</span>
          <input className="input-field w-full mt-1" value={extra} onChange={e => setExtra(e.target.value)}
            placeholder="gun shop, farm equipment dealer" />
        </label>

        <label className="block">
          <span className="text-xs uppercase text-terminal-muted">Partisan footprint</span>
          <select className="input-field w-full mt-1" value={party} onChange={e => setParty(e.target.value)}>
            <option value="">None</option>
            <option value="dem">ActBlue (Dem)</option>
            <option value="rep">WinRed (Rep)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase text-terminal-muted">Max sites this run ({maxUrls})</span>
          <input type="range" min={10} max={60} value={maxUrls} className="w-full mt-3"
            onChange={e => setMaxUrls(Number(e.target.value))} />
        </label>

        <div className="md:col-span-2 flex items-center gap-3">
          <button className="btn-primary" disabled={running || !categories.length && !extra.trim()} onClick={run}>
            {running ? 'Finding emails…' : '📧 Find Emails'}
          </button>
          <span className="text-xs text-terminal-muted">
            A live run is a quick sample (≈1–2 min). The nightly job does the full sweep.
          </span>
        </div>
      </div>

      <div className="card-brand p-4 mb-6">
        <div className="font-display uppercase text-sm mb-1">🤖 AI Enrich by Industry</div>
        <p className="font-body text-terminal-muted text-xs mb-3 max-w-3xl">
          Uses the employer data already in the database: ranks an industry’s employers by donor dollars,
          has AI find each one’s official website, then scrapes & verifies its emails. Highest-value path —
          these are businesses whose people already give.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs uppercase text-terminal-muted">Industry</span>
            <select className="input-field mt-1" value={industry} onChange={e => setIndustry(e.target.value)}>
              {(industries.length ? industries : [industry]).map(i =>
                <option key={i} value={i}>{i.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase text-terminal-muted">Top employers ({enrichLimit})</span>
            <input type="range" min={3} max={12} value={enrichLimit} className="w-40 mt-3 block"
              onChange={e => setEnrichLimit(Number(e.target.value))} />
          </label>
          <button className="btn-primary" disabled={enriching} onClick={runEnrich}>
            {enriching ? 'AI enriching…' : '🤖 Enrich Industry'}
          </button>
          <span className="text-xs text-terminal-muted">Haiku picks each official site. ≈1–2 min.</span>
        </div>
        {enrichSummary && (
          <div className="text-sm text-terminal-muted mt-3">
            {enrichSummary.industry}: {enrichSummary.with_site}/{enrichSummary.employers} employers had a site ·
            <b className="text-terminal-text"> {enrichSummary.emails} emails stored</b>
          </div>
        )}
      </div>

      {error && <div className="text-orange-400 text-sm mb-4">⚠ {error}</div>}

      {summary && (
        <div className="text-sm text-terminal-muted mb-3">
          Discovered {summary.urls_discovered} sites · harvested {summary.urls_harvested} ·
          <b className="text-terminal-text"> +{summary.new_emails} new emails</b> ·
          <b className="text-terminal-green"> +{summary.new_donors} donor matches</b>
        </div>
      )}

      {leads.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-terminal-muted flex items-center gap-2">
              <input type="checkbox" checked={donorsOnly} onChange={e => setDonorsOnly(e.target.checked)} />
              Donor matches only
            </label>
            <button className="btn-ghost text-xs" onClick={download}>⬇ Export CSV</button>
          </div>
          <div className="overflow-x-auto card-brand">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-terminal-muted text-xs uppercase border-b border-terminal-border">
                  <th className="p-2">Email</th><th className="p-2">Name / Source</th>
                  <th className="p-2">Donor</th><th className="p-2">Deliverability</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(l => (
                  <tr key={l.email} className="border-b border-terminal-border/40">
                    <td className="p-2 font-mono">{l.email}{l.is_role ? <span className="text-terminal-muted text-xs"> (role)</span> : null}</td>
                    <td className="p-2">
                      <div className="truncate max-w-xs">{l.name}</div>
                      <a href={l.source_url} target="_blank" rel="noreferrer"
                        className="text-terminal-muted text-xs hover:text-terminal-green truncate block max-w-xs">{l.source_url}</a>
                    </td>
                    <td className="p-2">
                      {l.is_donor ? (
                        <span className="inline-flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full border text-xs ${CONF_STYLE[l.donor_confidence || ''] || 'text-terminal-muted border-terminal-border'}`}>
                            {l.party || '—'} {l.donor_confidence}
                          </span>
                          <span className="text-terminal-muted text-xs">{fmt(l.lifetime_total)}</span>
                        </span>
                      ) : <span className="text-terminal-muted text-xs">—</span>}
                    </td>
                    <td className="p-2">
                      <span className={STATUS_STYLE[l.verify_status] || 'text-terminal-muted'}>
                        {l.verify_score}/10 {l.verify_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
