import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useNavigate } from 'react-router-dom'
import DataTable from '../components/DataTable'
import Tooltip from '../components/Tooltip'
import HoverBubbles from '../components/HoverBubbles'
import DistrictMiniMap from '../components/DistrictMiniMap'
import { getClientCandidate, setClientCandidate, candidateLabel, candidateParams } from '../lib/clientCandidate'
import CallsheetLauncher from '../components/CallsheetLauncher'
import FundraisingLauncher from '../components/FundraisingLauncher'
import BrandedEmailLauncher from '../components/BrandedEmailLauncher'
import { fecApi } from '../api/fec'
import { TopBarPortal } from '../lib/topbar'

// Mirrors backend _normalize_contributor_name → contributor key (for saving a
// new contact when the donor has none yet; lookups try both name orders).
function donorContactKey(name: string, state: string): string {
  const n = name.toUpperCase().trim().replace(/\b([A-Z])\.\s*/g, '$1 ').trim()
  return `${n}|${(state || '').toUpperCase().trim()}`
}

/** "POTTS, DANNY" → "Danny's", "Danny Potts" → "Danny's". Empty string if unknown. */
function possessiveFirst(full: string): string {
  if (!full) return ''
  const raw = full.includes(',') ? full.split(',')[1] : full
  const first = (raw || '').trim().split(/\s+/)[0]
  if (!first) return ''
  const titled = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  return `${titled}'s`
}

function ReportDuplicateButton({ keyA, nameA }: { keyA: string; nameA: string }) {
  const [open, setOpen] = useState(false)
  const [nameB, setNameB] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  async function submit() {
    if (!nameB.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('/api/duplicates/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_a: keyA, name_a: nameA, name_b: nameB.trim(), note: note.trim() || null }),
      })
      if (!res.ok) throw new Error()
      setStatus('done')
      setTimeout(() => { setOpen(false); setStatus('idle'); setNameB(''); setNote('') }, 1800)
    } catch {
      setStatus('error')
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-terminal-muted border border-terminal-border px-2 py-0.5 hover:border-yellow-600 hover:text-yellow-500 transition-colors"
      >
        report duplicate
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 border border-yellow-700 bg-yellow-900/10 rounded px-3 py-2 text-xs max-w-xs">
      <div className="text-yellow-400 font-medium">Flag as duplicate of…</div>
      <input
        autoFocus
        value={nameB}
        onChange={e => setNameB(e.target.value)}
        placeholder="Other donor name"
        className="bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1 rounded text-xs outline-none focus:border-yellow-600"
      />
      <input
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1 rounded text-xs outline-none focus:border-yellow-600"
      />
      <div className="flex gap-2 mt-0.5">
        <button
          onClick={submit}
          disabled={status === 'sending' || !nameB.trim()}
          className="px-3 py-0.5 bg-yellow-700 text-yellow-100 rounded hover:bg-yellow-600 disabled:opacity-40 transition-colors"
        >
          {status === 'sending' ? 'submitting…' : status === 'done' ? '✓ flagged' : 'submit'}
        </button>
        <button onClick={() => { setOpen(false); setNameB(''); setNote('') }} className="px-2 py-0.5 text-terminal-muted hover:text-terminal-text transition-colors">
          cancel
        </button>
      </div>
      {status === 'error' && <div className="text-terminal-red text-xs">Failed — try again</div>}
    </div>
  )
}

interface IssueScore {
  issue_id: string
  label: string
  direction: number
  intensity: number
  confidence: number
  classification: string
  evidence_count: number
}

const CLASS_STYLE: Record<string, { label: string; color: string; dot: string }> = {
  supportive:        { label: 'SUPPORT', color: 'text-terminal-green', dot: 'bg-terminal-green' },
  lean_supportive:   { label: 'LEAN +',  color: 'text-green-600',      dot: 'bg-green-600' },
  oppositional:      { label: 'OPPOSE',  color: 'text-terminal-red',   dot: 'bg-terminal-red' },
  lean_oppositional: { label: 'LEAN −',  color: 'text-red-700',        dot: 'bg-red-700' },
  mixed:             { label: 'MIXED',   color: 'text-yellow-400',     dot: 'bg-yellow-400' },
  neutral:           { label: 'NEUTRAL', color: 'text-terminal-muted', dot: 'bg-terminal-muted' },
  low_information:   { label: 'NO DATA', color: 'text-terminal-muted', dot: 'bg-terminal-border' },
}

const CLASS_TIP: Record<string, (label: string, confidence: number, evidence: number) => React.ReactNode> = {
  supportive:        (l, c, e) => <><strong>{l} — Strong Support</strong><br/>Consistently funds candidates aligned with this issue ({e} transactions, {c}% confidence). Score is weighted across full contribution history.</>,
  lean_supportive:   (l, c, e) => <><strong>{l} — Leans Supportive</strong><br/>More contributions go to pro-issue candidates than anti-issue, but the signal is moderate ({e} transactions, {c}% confidence).</>,
  oppositional:      (l, c, e) => <><strong>{l} — Strong Opposition</strong><br/>Consistently funds candidates opposed to this issue ({e} transactions, {c}% confidence).</>,
  lean_oppositional: (l, c, e) => <><strong>{l} — Leans Opposed</strong><br/>More contributions go to anti-issue candidates, but the signal is moderate ({e} transactions, {c}% confidence).</>,
  mixed:             (l, c, e) => <><strong>{l} — Mixed / Conflicted</strong><br/>Has funded both sides of this issue ({e} transactions, {c}% confidence). May reflect tactical giving or conflicting interests.</>,
  neutral:           (l, c, e) => <><strong>{l} — Neutral</strong><br/>Contributions don't show a meaningful lean ({e} transactions, {c}% confidence). Possibly limited data or balanced giving.</>,
}

const ISSUE_ORDER = [
  'labor','reproductive_rights','gun_policy','democracy_voting','campaign_finance_reform',
  'taxation','rural_healthcare','pharmaceutical_reform','medicare_reform',
  'family_farm','agribusiness','tort_judicial','veterans_support','lgbtq_rights',
  'diverse_candidates','young_candidates',
  'economic_reform','marijuana_reform','environmental_climate','immigration_reform',
  'national_security','ai_tech_reform','energy_utility','police_reform','israel_international',
]

function DirectionBar({ direction, confidence }: { direction: number; confidence: number }) {
  const w = Math.abs(direction) * 50
  const left = direction < 0 ? ((direction + 1) / 2) * 100 : 50
  return (
    <div className="relative w-full h-1.5 bg-terminal-border rounded overflow-hidden">
      <div className="absolute top-0 bottom-0 w-px bg-terminal-muted/40" style={{ left: '50%' }} />
      <div
        className={`absolute top-0 bottom-0 rounded ${direction >= 0 ? 'bg-terminal-green' : 'bg-terminal-red'}`}
        style={{ left: `${left}%`, width: `${w}%`, opacity: Math.max(0.25, confidence) }}
      />
    </div>
  )
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtK = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

// Known conduit committee IDs that earmark to downstream recipients
const CONDUIT_IDS = new Set([
  'C00401224', // ActBlue
  'C00694323', // WinRed
  'C00490045', // ACTBLUE CHARITIES
  'C00027466', // EMILY'S LIST (sometimes acts as conduit)
])
const CONDUIT_RE = /\b(actblue|winred|earmark\s+express|conduit)\b/i

function isConduit(committee: { committee_id?: string; name?: string } | null): boolean {
  if (!committee) return false
  return CONDUIT_IDS.has(committee.committee_id || '') || CONDUIT_RE.test(committee.name || '')
}

function parseEarmark(memoText: string | null | undefined): string | null {
  if (!memoText) return null
  // FEC memo format: "EARMARKED FOR XYZ" or "EARMARKED CONTRIBUTION: XYZ"
  const m = memoText.match(/earmarked\s+(?:for\s+|contribution[:\s]+)?(.+)/i)
  if (m) return m[1].trim()
  // Sometimes just contains the destination without prefix
  if (memoText.length > 3 && memoText.length < 120) return memoText.trim()
  return null
}

interface Contribution {
  contributor_name: string
  contributor_street_1?: string
  contributor_city: string
  contributor_state: string
  contributor_zip: string
  contributor_employer: string
  contributor_occupation: string
  contribution_receipt_date: string
  contribution_receipt_amount: number
  receipt_type_full: string
  committee: { name: string; committee_id: string; party?: string } | null
  transaction_id: string
  resolved_party: 'DEM' | 'REP' | null
  memo_text?: string
  memo_code?: string
  source?: 'FEC' | 'MEC'
}

interface PartyLean {
  label: string
  dem_pct: number | null
  rep_pct: number | null
}

interface DonorDistricts {
  county_name: string | null
  us_house_district: string | null
  mo_house_district: string | null
  mo_senate_district: string | null
  school_district: string | null
  city_name: string | null
  shapefile_vintage: string | null
  street_raw: string | null
  city_raw: string | null
  addr_state: string | null
  zip5: string | null
  latitude: number | null
  longitude: number | null
  geocode_status: string | null
  most_recent_year: number | null
}

interface PartyCycle {
  cycle: number
  dem: number
  rep: number
  total: number
}

interface SavedContact {
  contributor_key: string
  display_name?: string | null
  phone?: string | null
  email?: string | null
  street?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  best_time?: string | null
  notes?: string | null
  gender?: string | null
  dob?: string | null
  age_range?: string | null
  marital_status?: string | null
}

interface OfficerPosition {
  committee_name: string
  committee_party?: string | null
  title: string
  role: string
}

interface Verification {
  source_id: string
  source_type: string
  source_label: string
  status: string                 // 'verified' | 'approved'
  match_basis?: string | null    // 'name+zip' | 'name+street' | 'name+zip+street' | 'name-only'
  matched_name?: string | null
  reg_party?: string | null      // declared/registration party (voter file)
  res_street?: string | null     // authoritative current address
  res_city?: string | null
  res_state?: string | null
  res_zip?: string | null
  record_status?: string | null  // e.g. voter Active/Inactive
  source_date?: string | null
  verified_at?: string | null
  payload?: string | null        // JSON; business_registry rows carry {businesses:[…]}
}

interface BizEntity { name: string; address?: string; zip?: string; url?: string; status?: string }

interface ProfileResponse {
  results: Contribution[]
  party_lean: PartyLean
  party_totals: Record<string, number>
  party_timeline?: PartyCycle[]
  districts?: DonorDistricts | null
  saved_contact?: SavedContact | null
  officer_positions?: OfficerPosition[]
  verifications?: Verification[]
  giving_scope?: GivingScope
  business_profile?: { industries: string; summary: string; enriched_at: string } | null
}

interface GivingScopeTag { label: string; kind: 'scope' | 'office' | 'region'; tip: string }
interface GivingScope {
  tags: GivingScopeTag[]
  federal_amount: number
  state_amount: number
  level_breakdown: Record<string, number>
}

const LEAN_STYLE: Record<string, string> = {
  'STRONG DEM': 'text-blue-400 font-bold',
  'LEAN DEM': 'text-blue-300',
  'SPLIT': 'text-terminal-muted',
  'LEAN REP': 'text-red-300',
  'STRONG REP': 'text-terminal-red font-bold',
  'UNKNOWN': 'text-terminal-muted',
}

// Plain-English labels for how a verification was matched.
const VERIF_BASIS: Record<string, string> = {
  'name+zip+street': 'name + street address + ZIP',
  'name+street': 'name + street address',
  'name+zip': 'name + ZIP',
  'name-only': 'name only (reviewer-confirmed)',
  'name-only-ambiguous': 'name (reviewer-confirmed)',
}

// Giving-scope chip colors by kind (federal/state scope, office level, region).
const SCOPE_STYLE: Record<string, string> = {
  scope:  'border-blue-500/60 bg-blue-500/10 text-blue-300',
  office: 'border-amber-500/60 bg-amber-500/10 text-amber-300',
  region: 'border-terminal-green/60 bg-terminal-green/10 text-terminal-green',
}

// Registration party → chip color (declared/registration, distinct from giving lean).
const REG_STYLE: Record<string, string> = {
  Democratic: 'border-blue-500/60 bg-blue-500/10 text-blue-300',
  Republican: 'border-red-500/60 bg-red-500/10 text-red-300',
  Libertarian: 'border-amber-500/60 bg-amber-500/10 text-amber-300',
}

const PARTY_DOT: Record<string, string> = {
  DEM: 'bg-blue-400',
  REP: 'bg-red-500',
}

// Compact per-cycle trajectory: one stacked column per cycle. Column height
// encodes total $ that cycle; the blue/red split encodes party lean. Reveals
// switchers — the most persuadable money — that a single lifetime label hides.
function PartyTimeline({ cycles }: { cycles: PartyCycle[] }) {
  if (!cycles || cycles.length < 2) return null
  const max = Math.max(...cycles.map((c) => c.total), 1)
  return (
    <div
      className="flex items-end gap-1 shrink-0"
      aria-label="Party support by election cycle"
    >
      {cycles.map((c) => {
        const h = Math.max(4, Math.round((c.total / max) * 22))
        const demPct = c.total > 0 ? (c.dem / c.total) * 100 : 0
        return (
          <div key={c.cycle} className="flex flex-col items-center gap-0.5">
            <div
              className="w-2.5 bg-terminal-border rounded-sm overflow-hidden flex flex-col-reverse"
              style={{ height: `${h}px` }}
            >
              <div className="bg-blue-500 w-full" style={{ height: `${demPct}%` }} />
              <div className="bg-red-500 w-full" style={{ height: `${100 - demPct}%` }} />
            </div>
            <div className="text-[8px] text-terminal-muted leading-none">{`'${String(c.cycle).slice(2)}`}</div>
          </div>
        )
      })}
    </div>
  )
}

const SLICE_COLORS = ['#3b82f6', '#C8102E', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#64748b']

interface Segment {
  key: string
  label: string
  value: number
  count: number
  color: string
  viaConduit?: string   // e.g. "ActBlue"
}

// For a contribution, return the effective recipient key+label
// (uses earmark destination for conduit committees)
function effectiveRecipient(r: Contribution): { key: string; label: string; viaConduit?: string } {
  const conduit = isConduit(r.committee)
  const earmark = conduit ? parseEarmark(r.memo_text || r.receipt_type_full) : null
  if (conduit && earmark) {
    return {
      key: `earmark:${earmark.toUpperCase()}`,
      label: earmark,
      viaConduit: r.committee?.name || 'Conduit',
    }
  }
  return {
    key: r.committee?.committee_id || '__none__',
    label: r.committee?.name || 'Unknown',
  }
}

const SHORT_LABELS: Record<string, string> = {
  labor:                   'Labor',
  reproductive_rights:     'Repro Rights',
  gun_policy:              'Gun Policy',
  democracy_voting:        'Democracy',
  campaign_finance_reform: 'Campaign Finance',
  taxation:                'Taxation',
  rural_healthcare:        'Rural Health',
  pharmaceutical_reform:   'Pharma Reform',
  medicare_reform:         'Medicare',
  family_farm:             'Family Farm',
  agribusiness:            'Agribusiness',
  tort_judicial:           'Tort Reform',
  veterans_support:        'Veterans',
  lgbtq_rights:            'LGBTQ+',
  diverse_candidates:      'Diverse Candidates',
  young_candidates:        'New Candidates',
  economic_reform:         'Economic Reform',
  marijuana_reform:        'Cannabis Policy',
  environmental_climate:   'Climate',
  immigration_reform:      'Immigration',
  national_security:       'Defense',
  ai_tech_reform:          'AI/Tech',
  energy_utility:          'Energy',
  police_reform:           'Police Reform',
  israel_international:    'Israel/Intl',
}

function RecipientDonut({
  segments,
  selected,
  onSelect,
  size = 100,
}: {
  segments: Segment[]
  selected: string | null
  onSelect: (key: string | null) => void
  size?: number
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; seg: Segment } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const total = segments.reduce((s, g) => s + g.value, 0)
  if (total === 0) return null

  const SIZE = size, cx = SIZE / 2, cy = SIZE / 2
  const R = SIZE * 0.43, r = SIZE * 0.26

  let angle = -Math.PI / 2
  const paths = segments.map(seg => {
    const frac = seg.value / total
    const startA = angle
    angle += frac * 2 * Math.PI
    const endA = angle
    const midA = (startA + endA) / 2
    const isHot = hovered === seg.key || selected === seg.key
    const push = isHot ? 5 : 0
    const ox = push * Math.cos(midA), oy = push * Math.sin(midA)
    const x1 = cx + ox + R * Math.cos(startA), y1 = cy + oy + R * Math.sin(startA)
    const x2 = cx + ox + R * Math.cos(endA),   y2 = cy + oy + R * Math.sin(endA)
    const ix1 = cx + ox + r * Math.cos(endA),  iy1 = cy + oy + r * Math.sin(endA)
    const ix2 = cx + ox + r * Math.cos(startA),iy2 = cy + oy + r * Math.sin(startA)
    const large = frac > 0.5 ? 1 : 0
    return {
      seg, isHot,
      d: `M${x1},${y1} A${R},${R},0,${large},1,${x2},${y2} L${ix1},${iy1} A${r},${r},0,${large},0,${ix2},${iy2} Z`,
    }
  })

  const handleMouseMove = (e: React.MouseEvent<SVGPathElement>, seg: Segment) => {
    // Viewport coords — the tooltip is portaled to <body> (fixed) so it's never
    // clipped by main's overflow-hidden or hidden under the top header bar.
    setTooltip({ x: e.clientX, y: e.clientY, seg })
  }

  const activeSeg = segments.find(s => s.key === (selected || hovered))

  return (
    <div className="relative flex-shrink-0" style={{ width: SIZE + 12, height: SIZE + 12 }}>
      <svg ref={svgRef} viewBox={`-6 -6 ${SIZE + 12} ${SIZE + 12}`} width={SIZE + 12} height={SIZE + 12}>
        {paths.map(({ seg, d, isHot }) => (
          <path
            key={seg.key}
            d={d}
            fill={seg.color}
            opacity={selected && selected !== seg.key ? 0.2 : isHot ? 1 : 0.82}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
            onClick={() => onSelect(selected === seg.key ? null : seg.key)}
            onMouseEnter={() => setHovered(seg.key)}
            onMouseLeave={() => { setHovered(null); setTooltip(null) }}
            onMouseMove={e => handleMouseMove(e, seg)}
          />
        ))}
        {!activeSeg && (
          <>
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize={SIZE * 0.085} fill="var(--color-muted)" fontFamily="inherit">CLICK</text>
            <text x={cx} y={cy + 7} textAnchor="middle" fontSize={SIZE * 0.085} fill="var(--color-muted)" fontFamily="inherit">TO FILTER</text>
          </>
        )}
        {activeSeg && (
          <>
            <text x={cx} y={cy - 3} textAnchor="middle" fontSize={SIZE * 0.10} fontWeight="bold" fill="var(--color-text)" fontFamily="inherit">{fmtK(activeSeg.value)}</text>
            <text x={cx} y={cy + 9} textAnchor="middle" fontSize={SIZE * 0.08} fill="var(--color-muted)" fontFamily="inherit">{activeSeg.count} gift{activeSeg.count !== 1 ? 's' : ''}</text>
          </>
        )}
      </svg>
      {tooltip && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none bg-terminal-panel border border-terminal-border text-xs px-2.5 py-2 shadow-xl"
          style={{
            left: Math.min(tooltip.x + 14, window.innerWidth - 236),
            top: Math.min(tooltip.y + 16, window.innerHeight - 110),
            maxWidth: 220,
          }}
        >
          <div className="text-terminal-text font-bold leading-snug mb-0.5">{tooltip.seg.label}</div>
          {tooltip.seg.viaConduit && (
            <div className="text-terminal-muted text-xs mb-0.5">via {tooltip.seg.viaConduit}</div>
          )}
          <div className="text-terminal-green font-bold">{fmt(tooltip.seg.value)}</div>
          <div className="text-terminal-muted">{tooltip.seg.count} contribution{tooltip.seg.count !== 1 ? 's' : ''}</div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default function DonorProfilePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const name = params.get('name') || ''
  const state = params.get('state') || ''
  const city = params.get('city') || ''

  const [data, setData] = useState<ProfileResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Active client-candidate context (set on the Prospects page) → lets a profile
  // call sheet carry the same prospect-score + IN-DISTRICT fit picture.
  const [candidate, setCandidate] = useState(getClientCandidate())
  // Saved contact edit state. contactOverride lets a save reflect instantly
  // without refetching the (slow) profile.
  const [contactOverride, setContactOverride] = useState<SavedContact | null | undefined>(undefined)
  const [editingContact, setEditingContact] = useState(false)
  const [cPhone, setCPhone] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cBest, setCBest] = useState('')
  const [cGender, setCGender] = useState('')
  const [cAge, setCAge] = useState('')
  const [cMarital, setCMarital] = useState('')
  const [selectedSlice, setSelectedSlice] = useState<string | null>(null)
  const [conduitFilter, setConduitFilter] = useState<string | null>(null)

  const [issueScores, setIssueScores] = useState<IssueScore[] | null>(null)
  const [issueLoading, setIssueLoading] = useState(false)
  const [issueError, setIssueError] = useState<string | null>(null)

  const runIssueScoring = (profileData: ProfileResponse, contributorName: string, contributorState: string) => {
    const key = `${contributorName.toUpperCase().trim()}|${contributorState.toUpperCase().trim()}`
    const sp = new URLSearchParams({ contributor_key: key })
    setIssueLoading(true)
    setIssueError(null)
    fetch(`/api/issues/score-contributions?${sp}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData.results || []),
    })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(d => {
        const sorted = [...(d.scores || [])].sort((a: IssueScore, b: IssueScore) => {
          const ai = ISSUE_ORDER.indexOf(a.issue_id), bi = ISSUE_ORDER.indexOf(b.issue_id)
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        })
        setIssueScores(sorted)
      })
      .catch((e) => setIssueError(String(e)))
      .finally(() => setIssueLoading(false))
  }

  useEffect(() => {
    if (!name) return
    setLoading(true)
    setIssueLoading(false)
    setSelectedSlice(null)
    setConduitFilter(null)
    setIssueScores(null)
    setIssueError(null)
    setContactOverride(undefined)
    setEditingContact(false)

    const sp = new URLSearchParams({ contributor_name: name })
    if (state) sp.set('contributor_state', state)

    fetch(`/api/donors/profile/?${sp}`)
      .then((r) => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json() })
      .then((d) => { setData(d); runIssueScoring(d, name, state) })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [name, state])

  const rows = data?.results ?? []
  const lean = data?.party_lean
  const totals = data?.party_totals ?? {}
  const savedContact = contactOverride !== undefined ? contactOverride : data?.saved_contact

  const openContactEditor = () => {
    setCPhone(savedContact?.phone || '')
    setCEmail(savedContact?.email || '')
    setCBest(savedContact?.best_time || '')
    setCGender(savedContact?.gender || '')
    setCAge(savedContact?.age_range || '')
    setCMarital(savedContact?.marital_status || '')
    setEditingContact(true)
  }
  const saveContact = async () => {
    const key = savedContact?.contributor_key || donorContactKey(name, state)
    try {
      await fecApi.saveContacts([{
        contributor_key: key, display_name: name,
        phone: cPhone.trim() || undefined, email: cEmail.trim() || undefined,
        best_time: cBest.trim() || undefined,
        gender: cGender.trim() || undefined, age_range: cAge.trim() || undefined,
        marital_status: cMarital.trim() || undefined,
        // preserve an imported birthdate (the editor only edits the age field).
        dob: savedContact?.dob || undefined,
      }])
      setContactOverride({
        contributor_key: key, phone: cPhone.trim() || null,
        email: cEmail.trim() || null, best_time: cBest.trim() || null,
        gender: cGender.trim() || null, age_range: cAge.trim() || null,
        marital_status: cMarital.trim() || null, dob: savedContact?.dob || null,
      })
      setEditingContact(false)
    } catch { /* ignore */ }
  }
  // Display age: prefer an imported birthdate, else the stored age/range.
  const contactAge = (() => {
    const dob = savedContact?.dob
    if (dob) {
      const m = dob.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/) || dob.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
      if (m) {
        const [y, mo, da] = dob.includes('-') ? [+m[1], +m[2], +m[3]] : [+m[3], +m[1], +m[2]]
        const t = new Date()
        let a = t.getFullYear() - y - ((t.getMonth() + 1 < mo || (t.getMonth() + 1 === mo && t.getDate() < da)) ? 1 : 0)
        if (a > 0 && a < 120) return String(a)
      }
    }
    return savedContact?.age_range || ''
  })()

  const total = rows.reduce((s, r) => s + (r.contribution_receipt_amount || 0), 0)
  const uniqueCommittees = new Set(rows.map((r) => r.committee?.committee_id).filter(Boolean)).size
  const employers = [...new Set(rows.map((r) => r.contributor_employer).filter(Boolean))]
  const occupations = [...new Set(rows.map((r) => r.contributor_occupation).filter(Boolean))]

  // Derive most-common city/state/zip from contribution records
  function mostCommon(vals: string[]): string {
    const counts: Record<string, number> = {}
    for (const v of vals) counts[v] = (counts[v] ?? 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  }
  const dataStreet = mostCommon(rows.map(r => (r.contributor_street_1 || '').trim()).filter(Boolean))
  const dataCity  = mostCommon(rows.map(r => r.contributor_city).filter(Boolean))
  const dataState = mostCommon(rows.map(r => r.contributor_state).filter(Boolean))
  const dataZip   = mostCommon(rows.map(r => (r.contributor_zip || '').slice(0, 5)).filter(Boolean))
  const displayCity  = dataCity  || city
  const displayState = dataState || state
  const displayZip   = dataZip
  const hasEarmarks = rows.some(r => isConduit(r.committee) && parseEarmark(r.memo_text))

  // Full address line: prefer the geocoded address from districts, else derive from records.
  const dist = data?.districts
  const addrStreet = (dist?.street_raw || dataStreet || '').trim()
  const addrCity   = dist?.city_raw   || displayCity
  const addrState  = dist?.addr_state || displayState
  const addrZip    = dist?.zip5       || displayZip
  const cityStateZip = [[addrCity, addrState].filter(Boolean).join(', '), addrZip].filter(Boolean).join(' ')
  const fullAddress = [addrStreet, cityStateZip].filter(Boolean).join(', ')

  // Secondary-source verifications (voter file, etc.). The government record is
  // authoritative for identity facts, so prefer its address/registration and keep
  // the donation-derived values as "legacy on file".
  const verifications = data?.verifications ?? []
  // Identity-corroborating sources (voter file, assessor) drive the green ✓.
  // Business-registry hits drive a separate glowing "business owner" badge.
  const idVerifs = verifications.filter(v => v.source_type !== 'business_registry')
  const bizVerifs = verifications.filter(v => v.source_type === 'business_registry')
  const isVerified = idVerifs.length > 0
  const businesses: BizEntity[] = (() => {
    const out: BizEntity[] = []
    const seen = new Set<string>()
    for (const v of bizVerifs) {
      try {
        const list = (JSON.parse(v.payload || '{}').businesses || []) as BizEntity[]
        for (const b of list) {
          const k = (b.name || '').toLowerCase()
          if (b.name && !seen.has(k)) { seen.add(k); out.push(b) }
        }
      } catch { /* ignore malformed payload */ }
    }
    return out
  })()
  const regVerif = verifications.find(v => v.reg_party)
  const regParty = regVerif?.reg_party || ''
  const authAddrVerif = verifications.find(v => v.res_street)
  const authAddress = authAddrVerif
    ? [authAddrVerif.res_street,
       [[authAddrVerif.res_city, authAddrVerif.res_state].filter(Boolean).join(', '),
        authAddrVerif.res_zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : ''
  // The donation address is "legacy" only when an authoritative one exists AND differs.
  const norm = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase()
  const addrIsLegacy = !!authAddress && !!fullAddress && norm(authAddress) !== norm(fullAddress)
  const authStreetViewUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(authAddress)}`

  // Street View link — only when the address is fully present (street+city+state+zip).
  // Prefer the geocoded coords (drops straight into the pano); else search the address.
  const hasFullAddress = !!(addrStreet && addrCity && addrState && addrZip)
  const streetViewUrl = (dist?.latitude != null && dist?.longitude != null)
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${dist.latitude},${dist.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`

  // District display: show the bar when matched with at least one district, else a reason badge.
  const hasDistrict = !!(dist && (dist.us_house_district || dist.mo_house_district || dist.mo_senate_district))
  const districtMatched = dist?.geocode_status === 'matched' && hasDistrict
  const DISTRICT_REASONS: Record<string, string> = {
    po_box: 'PO Box — no district',
    out_of_state: 'Out-of-state address',
    not_found: 'Address not found',
    no_address: 'No address on file',
    error: 'District lookup failed',
    matched: 'Outside MO districts',
  }
  const districtBadge = !districtMatched
    ? (DISTRICT_REASONS[dist?.geocode_status ?? ''] ?? 'No district data')
    : null

  // Build recipient segments using effective recipient (earmark-aware)
  const recipientMap: Record<string, Segment> = {}
  for (const r of rows) {
    const eff = effectiveRecipient(r)
    if (!recipientMap[eff.key]) {
      recipientMap[eff.key] = { key: eff.key, label: eff.label, value: 0, count: 0, color: '', viaConduit: eff.viaConduit }
    }
    recipientMap[eff.key].value += r.contribution_receipt_amount
    recipientMap[eff.key].count += 1
  }

  const sortedRecipients = Object.values(recipientMap).sort((a, b) => b.value - a.value)
  const top6 = sortedRecipients.slice(0, 6).map((c, i) => ({ ...c, color: SLICE_COLORS[i] }))
  const otherItems = sortedRecipients.slice(6)
  const otherValue = otherItems.reduce((s, c) => s + c.value, 0)
  const otherCount = otherItems.reduce((s, c) => s + c.count, 0)
  const top6Keys = new Set(top6.map(c => c.key))

  const segments: Segment[] = [
    ...top6,
    ...(otherValue > 0 ? [{ key: '__other__', label: `Other (${otherItems.length})`, value: otherValue, count: otherCount, color: SLICE_COLORS[6] }] : []),
  ]

  // Unique conduit names used in this donor's contributions
  const conduitNames = [...new Set(
    rows.filter(r => isConduit(r.committee) && r.committee?.name).map(r => r.committee!.name)
  )]

  // Filter rows: conduit filter takes precedence, then slice filter
  let displayRows = rows
  if (conduitFilter) {
    displayRows = displayRows.filter(r => r.committee?.name === conduitFilter)
  } else if (selectedSlice) {
    displayRows = selectedSlice === '__other__'
      ? displayRows.filter(r => !top6Keys.has(effectiveRecipient(r).key))
      : displayRows.filter(r => effectiveRecipient(r).key === selectedSlice)
  }

  const selectedSeg = segments.find(s => s.key === selectedSlice)

  const cols = [
    {
      key: 'source', header: 'Source', width: '5%',
      render: (r: Contribution) => r.source === 'MEC'
        ? <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-1 rounded">MEC</span>
        : <span className="text-xs font-bold text-terminal-muted">FEC</span>,
    },
    {
      key: 'party', header: 'Party', width: '5%',
      render: (r: Contribution) => r.resolved_party ? (
        <span className={`inline-flex items-center gap-1 text-xs font-bold ${r.resolved_party === 'DEM' ? 'text-blue-400' : 'text-red-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full inline-block ${PARTY_DOT[r.resolved_party]}`} />
          {r.resolved_party}
        </span>
      ) : <span className="text-terminal-muted">—</span>,
    },
    {
      key: 'amount', header: 'Amount', width: '9%',
      render: (r: Contribution) => (
        <span className={r.contribution_receipt_amount >= 0 ? 'text-terminal-green font-bold' : 'text-terminal-red'}>
          {fmt(r.contribution_receipt_amount)}
        </span>
      ),
    },
    { key: 'date', header: 'Date', width: '9%', render: (r: Contribution) => r.contribution_receipt_date?.slice(0, 10) || '—' },
    {
      key: 'committee', header: 'Recipient', width: '38%',
      render: (r: Contribution) => {
        const conduit = isConduit(r.committee)
        const earmark = conduit ? parseEarmark(r.memo_text || r.receipt_type_full) : null
        return (
          <div className="leading-tight">
            {earmark ? (
              <>
                <span className="text-terminal-muted">{r.committee?.name || '—'}</span>
                <span className="text-terminal-muted mx-1">→</span>
                <span className="text-terminal-accent font-bold">{earmark}</span>
              </>
            ) : (
              <span className="text-terminal-accent">{r.committee?.name || '—'}</span>
            )}
          </div>
        )
      },
    },
    { key: 'type', header: 'Type', width: '14%', render: (r: Contribution) => r.receipt_type_full || '—' },
    { key: 'employer', header: 'Employer', width: '16%', render: (r: Contribution) => r.contributor_employer || '—' },
    {
      key: 'memo', header: 'Memo', width: '9%',
      render: (r: Contribution) => r.memo_code === 'X'
        ? <span className="text-terminal-muted text-xs italic">memo item</span>
        : <span className="text-terminal-muted">—</span>,
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <TopBarPortal>
      {/* Header */}
      <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel">
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => navigate(-1)} className="text-terminal-muted text-xs hover:text-terminal-text">
              ← BACK TO SEARCH
            </button>
            {hasEarmarks && (
              <Tooltip
                placement="bottom"
                widthClass="w-[320px] max-w-[90vw] text-left"
                content={
                  <>
                    <strong>Earmark data available.</strong> Some of this donor's contributions were
                    routed through a conduit (e.g. <span className="text-terminal-accent">ActBlue</span> or
                    {' '}<span className="text-terminal-accent">WinRed</span>) and earmarked for a specific
                    recipient. Where that data exists, the charts and table credit the final intended
                    recipient instead of just the pass-through committee.
                  </>
                }
              >
                <span className="text-xs bg-terminal-border text-terminal-muted px-2 py-0.5 rounded shrink-0 cursor-help">
                  ↳ earmark data available
                </span>
              </Tooltip>
            )}
          </div>

        {/* Name + ✓ verified + contact cards sit parallel on one row; the
            address floats full-width beneath them. Editable inline. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-terminal-accent text-sm font-bold tracking-wider">{name}</div>
              {isVerified && (
                <Tooltip
                  placement="bottom"
                  widthClass="w-[340px] max-w-[92vw] text-left"
                  content={
                    <>
                      <strong className="text-terminal-green">✓ Identity verified.</strong> This donor was
                      matched to an authoritative public record, independently confirming they are a real
                      person at this identity. Where a government record and our donation-derived data
                      disagree on a fact (name, current address, party registration), the public record is
                      treated as the more reliable source.
                      <div className="mt-2 pt-2 border-t border-terminal-border">
                        <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Verified against</div>
                        {idVerifs.map((v, i) => (
                          <div key={i} className="mb-1.5">
                            <div className="text-gray-100">• {v.source_label}</div>
                            <div className="text-[11px] text-terminal-muted pl-3">
                              match: {VERIF_BASIS[v.match_basis || ''] || v.match_basis || 'name'}
                              {v.status === 'approved' ? ' · reviewer-confirmed' : ''}
                              {v.reg_party ? ` · registration: ${v.reg_party}` : ''}
                              {v.record_status ? ` · status: ${v.record_status}` : ''}
                            </div>
                            {v.res_street && (
                              <div className="text-[11px] text-gray-400 pl-3">
                                address on record: {[v.res_street, v.res_city, v.res_state, v.res_zip].filter(Boolean).join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  }
                >
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold rounded px-1.5 py-0.5 border border-terminal-green/60 bg-terminal-green/10 text-terminal-green cursor-help shrink-0">
                    ✓ Verified
                  </span>
                </Tooltip>
              )}
            </div>

          {data?.officer_positions && data.officer_positions.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {data.officer_positions.map((o, i) => (
                <span key={i} title={`${o.title} of ${o.committee_name}${o.committee_party ? ` (${o.committee_party})` : ''}`}
                  className="text-[10px] uppercase tracking-wider font-bold rounded px-1.5 py-0.5 border border-amber-500/60 bg-amber-500/10 text-amber-300">
                  ★ {o.title} · {o.committee_name}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            {editingContact ? (
              <div className="flex items-center gap-1.5 flex-wrap border border-terminal-accent/50 rounded px-2 py-1 bg-terminal-panel">
                <input value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="Phone"
                  className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-1.5 py-0.5 text-xs w-28" />
                <input value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="Email"
                  className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-1.5 py-0.5 text-xs w-44" />
                <input value={cBest} onChange={e => setCBest(e.target.value)} placeholder="Best time"
                  className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-1.5 py-0.5 text-xs w-24" />
                <select value={cGender} onChange={e => setCGender(e.target.value)} title="Gender"
                  className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-1 py-0.5 text-xs">
                  <option value="">Gender</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
                <input value={cAge} onChange={e => setCAge(e.target.value)} placeholder="Age"
                  title={savedContact?.dob ? `Birthdate on file: ${savedContact.dob}` : 'Age or range (e.g. 54 or 50-59)'}
                  className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-1.5 py-0.5 text-xs w-16" />
                <input value={cMarital} onChange={e => setCMarital(e.target.value)} placeholder="Marital"
                  className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-1.5 py-0.5 text-xs w-24" />
                <button onClick={saveContact} className="text-xs bg-terminal-green/80 text-black rounded px-2 py-0.5 hover:bg-terminal-green">Save</button>
                <button onClick={() => setEditingContact(false)} className="text-xs text-terminal-muted px-1 hover:text-terminal-text">Cancel</button>
              </div>
            ) : savedContact && (savedContact.phone || savedContact.email || savedContact.best_time
                || savedContact.gender || savedContact.age_range || savedContact.dob || savedContact.marital_status) ? (
              <>
                <span className="text-[10px] uppercase tracking-wider text-terminal-green font-bold border border-terminal-green/50 rounded px-1.5 py-0.5">✓ Contact</span>
                {savedContact.phone && (
                  <a href={`tel:${savedContact.phone.replace(/[^\d+]/g, '')}`}
                    className="inline-flex items-center gap-1.5 border border-terminal-accent/60 bg-terminal-accent/10 text-terminal-text rounded px-2.5 py-1 text-xs hover:bg-terminal-accent/20 transition-colors">
                    <span className="text-terminal-accent">📞</span> {savedContact.phone}
                  </a>
                )}
                {savedContact.email && (
                  <a href={`mailto:${savedContact.email}`}
                    className="inline-flex items-center gap-1.5 border border-terminal-accent/60 bg-terminal-accent/10 text-terminal-text rounded px-2.5 py-1 text-xs hover:bg-terminal-accent/20 transition-colors">
                    <span className="text-terminal-accent">✉</span> {savedContact.email}
                  </a>
                )}
                {savedContact.best_time && (
                  <span className="inline-flex items-center gap-1.5 border border-terminal-border bg-terminal-panel text-terminal-muted rounded px-2.5 py-1 text-xs">
                    <span>🕑</span> {savedContact.best_time}
                  </span>
                )}
                {(savedContact.gender || contactAge || savedContact.marital_status) && (
                  <span className="inline-flex items-center gap-2 border border-terminal-border bg-terminal-panel text-terminal-muted rounded px-2.5 py-1 text-xs">
                    {savedContact.gender && <span>{savedContact.gender === 'M' ? 'Male' : savedContact.gender === 'F' ? 'Female' : savedContact.gender}</span>}
                    {contactAge && <span>· Age {contactAge}</span>}
                    {savedContact.marital_status && <span>· {savedContact.marital_status}</span>}
                  </span>
                )}
                <button onClick={openContactEditor} title="Edit contact"
                  className="text-xs text-terminal-muted border border-terminal-border rounded px-1.5 py-0.5 hover:text-terminal-accent hover:border-terminal-accent transition-colors">✎ edit</button>
              </>
            ) : (
              <button onClick={openContactEditor}
                className="text-xs text-terminal-muted border border-dashed border-terminal-border rounded px-2 py-0.5 hover:text-terminal-accent hover:border-terminal-accent transition-colors">+ add contact</button>
            )}
          </div>
          </div>
          {/* Address — full width beneath the name + contact cards. */}
          {authAddress && (
            <a href={authStreetViewUrl} target="_blank" rel="noreferrer"
              title="Current address from the verifying public record"
              className="block text-terminal-green/90 hover:text-terminal-green hover:underline text-xs tracking-wide transition-colors">
              {authAddress} <span className="text-terminal-green text-[10px]">✓ current</span>
            </a>
          )}
          {/* Donation-derived address — only when there is NO verified address.
              When a verified address exists we show that one alone (no duplicate). */}
          {!authAddress && fullAddress && (
            hasFullAddress ? (
              <a href={streetViewUrl} target="_blank" rel="noreferrer"
                title={addrIsLegacy ? 'Address on file from donation records (may be outdated)' : 'Open Street View for this address'}
                className="block text-terminal-muted hover:text-terminal-accent hover:underline text-xs tracking-wide transition-colors">
                {fullAddress} {addrIsLegacy ? <span className="text-[10px] text-terminal-muted">· on file (donations)</span> : <span className="text-terminal-accent">🛣</span>}
              </a>
            ) : (
              <div className="text-terminal-muted text-xs tracking-wide">
                {fullAddress}{addrIsLegacy ? <span className="text-[10px]"> · on file (donations)</span> : ''}
              </div>
            )
          )}
        </div>
          </div>
          <div className="flex items-start gap-2 flex-shrink-0">
            {name && (
              <div className="border border-purple-500 rounded px-2 py-1.5">
                <div className="text-purple-400 text-[10px] font-bold uppercase tracking-wider mb-1">Fundraising Actions</div>
                <div className="flex items-center gap-1">
                <CallsheetLauncher
                  name={name}
                  state={state || undefined}
                  params={candidateParams(candidate)}
                  title={candidate
                    ? `Generate a tailored call sheet + script for your active client candidate (${candidateLabel(candidate)}).`
                    : 'Generate a tailored call sheet + script. Set a candidate on the Prospects page to add a fit score.'}
                  className="text-xs text-terminal-muted border border-terminal-border px-2 py-0.5 hover:border-terminal-accent hover:text-terminal-accent transition-colors"
                >
                  📄 call sheet
                </CallsheetLauncher>
                <FundraisingLauncher
                  name={name}
                  state={state || undefined}
                  title="Generate a written fundraising message (email + text) personalized to this donor's giving history and inferred issues — copy/paste ready."
                  className="text-xs text-terminal-muted border border-terminal-border px-2 py-0.5 hover:border-terminal-accent hover:text-terminal-accent transition-colors"
                >
                  ✍ Draft Message
                </FundraisingLauncher>
                <BrandedEmailLauncher
                  name={name}
                  state={state || undefined}
                  title="Generate a fully styled, branded fundraising email personalized to this donor — opens the email editor pre-filled, ready to brand and export."
                  className="text-xs text-terminal-muted border border-terminal-border px-2 py-0.5 hover:border-terminal-accent hover:text-terminal-accent transition-colors"
                >
                  🎨 branded email
                </BrandedEmailLauncher>
                </div>
                {candidate && (
                  <div className="mt-1">
                    <Tooltip content="This sheet is scored against your active client candidate (set on the Prospects page). Click to clear.">
                      <button
                        onClick={() => { setClientCandidate(null); setCandidate(null) }}
                        className="text-[10px] text-terminal-accent border border-terminal-accent/40 rounded px-1.5 py-0.5 hover:bg-terminal-accent/10 transition-colors"
                      >
                        vs {candidateLabel(candidate)} ✕
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
            )}
            {name && (
              <div className="border border-orange-500 rounded px-2 py-1.5">
                <div className="text-orange-400 text-[10px] font-bold uppercase tracking-wider mb-1">System Action</div>
                <ReportDuplicateButton keyA={`${name.toUpperCase().trim()}|${(state || '').toUpperCase().trim()}`} nameA={name} />
              </div>
            )}
          </div>
        </div>

        {/* Partisanship bar — its own row below the name + contact. */}
        <div className="flex items-center gap-3 flex-wrap mt-2">
          {lean && lean.dem_pct !== null && lean.rep_pct !== null && (
            <div className="flex-1 min-w-[140px] flex items-center gap-2">
              <div className="text-xs text-blue-400 shrink-0">{fmt(totals['DEM'] ?? 0)}</div>
              <div className="flex-1 h-1.5 bg-terminal-border rounded overflow-hidden flex">
                <div className="bg-blue-500 h-full transition-all" style={{ width: `${lean.dem_pct}%` }} />
                <div className="bg-red-500 h-full transition-all" style={{ width: `${lean.rep_pct}%` }} />
              </div>
              <div className="text-xs text-red-400 shrink-0">{fmt(totals['REP'] ?? 0)}</div>
            </div>
          )}
          {lean && lean.label !== 'UNKNOWN' && (
            <div className={`text-sm tracking-widest shrink-0 ${LEAN_STYLE[lean.label]}`}>
              {lean.label}
            </div>
          )}
          {regParty && (
            <Tooltip
              placement="bottom"
              widthClass="w-[300px] max-w-[90vw] text-left"
              content={
                <>
                  <strong>Party registration: {regParty}.</strong> This is the donor's declared
                  registration from {regVerif?.source_label || 'a public voter record'} — a different
                  fact from the giving lean on the left, which is measured from who they actually
                  fund. They usually agree; when they don't, both are shown because each answers a
                  different question.
                </>
              }
            >
              <span className={`text-[10px] uppercase tracking-wider font-bold rounded px-1.5 py-0.5 border cursor-help shrink-0 ${REG_STYLE[regParty] || 'border-terminal-border bg-terminal-panel text-terminal-muted'}`}>
                Reg: {regParty}
              </span>
            </Tooltip>
          )}
          {data?.party_timeline && data.party_timeline.length >= 2 && (
            <Tooltip
              placement="bottom"
              widthClass="w-[300px] max-w-[90vw] text-left"
              content={
                <>
                  <strong>Party support by cycle.</strong> Each column is one two-year election
                  cycle (oldest at left, most recent at right). Column height shows how much this
                  donor gave that cycle; the <span className="text-blue-400">blue</span>/
                  <span className="text-red-400">red</span> split is the share that went to
                  Democratic vs. Republican recipients. Recent cycles weigh more heavily in the
                  overall lean.
                </>
              }
            >
              <span className="shrink-0 cursor-help">
                <PartyTimeline cycles={data.party_timeline} />
              </span>
            </Tooltip>
          )}
        </div>

        {rows.length > 0 && (
          <div className="flex gap-x-4 gap-y-1 mt-2.5 pt-2.5 border-t border-terminal-border flex-nowrap items-start min-w-0">
            <div>
              <div className="text-terminal-muted text-xs uppercase tracking-wider">Total Contributed</div>
              <div className="text-terminal-green text-sm font-bold">{fmt(total)}</div>
            </div>
            <div>
              <div className="text-terminal-muted text-xs uppercase tracking-wider">Contributions</div>
              <div className="text-terminal-text text-sm font-bold">{rows.length}</div>
            </div>
            <div>
              <div className="text-terminal-muted text-xs uppercase tracking-wider">Unique Recipients</div>
              <div className="text-terminal-text text-sm font-bold">{uniqueCommittees}</div>
            </div>
            {employers.length > 0 && (
              <div className="self-center">
                <HoverBubbles label={`${possessiveFirst(name)} Employers`.trim()} items={employers} />
              </div>
            )}
            {occupations.length > 0 && (
              <div className="self-center">
                <HoverBubbles label={`${possessiveFirst(name)} Occupations`.trim()} items={occupations} />
              </div>
            )}
            {districtMatched ? (
              <>
                <div className="border-l border-terminal-border self-stretch" aria-hidden />
                <div>
                  <div className="text-terminal-muted text-xs uppercase tracking-wider">County</div>
                  {dist!.county_name ? (
                    <Tooltip placement="bottom" widthClass="w-[232px]"
                      content={<DistrictMiniMap level="county" id={dist!.county_name} title={dist!.county_name} subtitle="County" />}>
                      <div className="text-terminal-accent text-sm font-bold cursor-help underline decoration-dotted underline-offset-2">{dist!.county_name}</div>
                    </Tooltip>
                  ) : <div className="text-terminal-text text-sm font-bold">—</div>}
                </div>
                {dist!.us_house_district && (
                  <div>
                    <div className="text-terminal-muted text-xs uppercase tracking-wider">U.S. House</div>
                    <Tooltip placement="bottom" widthClass="w-[232px]"
                      content={<DistrictMiniMap level="us_house" id={dist!.us_house_district} title={`MO-${dist!.us_house_district}`} subtitle="U.S. House District" />}>
                      <div className="text-terminal-accent text-sm font-bold cursor-help underline decoration-dotted underline-offset-2">MO-{dist!.us_house_district}</div>
                    </Tooltip>
                  </div>
                )}
                {dist!.mo_house_district && (
                  <div>
                    <div className="text-terminal-muted text-xs uppercase tracking-wider">MO House</div>
                    <Tooltip placement="bottom" widthClass="w-[232px]"
                      content={<DistrictMiniMap level="mo_house" id={dist!.mo_house_district} title={`HD-${dist!.mo_house_district}`} subtitle="Missouri House District" />}>
                      <div className="text-terminal-accent text-sm font-bold cursor-help underline decoration-dotted underline-offset-2">HD-{dist!.mo_house_district}</div>
                    </Tooltip>
                  </div>
                )}
                {dist!.mo_senate_district && (
                  <div>
                    <div className="text-terminal-muted text-xs uppercase tracking-wider">MO Senate</div>
                    <Tooltip placement="bottom" widthClass="w-[232px]"
                      content={<DistrictMiniMap level="mo_senate" id={dist!.mo_senate_district} title={`SD-${dist!.mo_senate_district}`} subtitle="Missouri Senate District" />}>
                      <div className="text-terminal-accent text-sm font-bold cursor-help underline decoration-dotted underline-offset-2">SD-{dist!.mo_senate_district}</div>
                    </Tooltip>
                  </div>
                )}
                {dist!.school_district && (
                  <div className="max-w-[160px]">
                    <div className="text-terminal-muted text-xs uppercase tracking-wider">School Dist.</div>
                    <Tooltip placement="bottom" widthClass="w-[232px]"
                      content={<DistrictMiniMap level="school" id={dist!.school_district} title={dist!.school_district} subtitle="School District" />}>
                      <div className="text-terminal-accent text-sm font-bold truncate cursor-help underline decoration-dotted underline-offset-2" title={dist!.school_district}>{dist!.school_district}</div>
                    </Tooltip>
                  </div>
                )}
                {dist!.city_name && (
                  <div>
                    <div className="text-terminal-muted text-xs uppercase tracking-wider">City</div>
                    <Tooltip placement="bottom" widthClass="w-[232px]"
                      content={<DistrictMiniMap level="place" id={dist!.city_name} title={dist!.city_name} subtitle="City / Town" />}>
                      <div className="text-terminal-accent text-sm font-bold cursor-help underline decoration-dotted underline-offset-2">{dist!.city_name}</div>
                    </Tooltip>
                  </div>
                )}
                {dist!.most_recent_year && (
                  <div className="self-center border border-terminal-accent/50 bg-terminal-accent/10 rounded px-2.5 py-1 leading-tight" title="Election year of the most recent address on file used to locate these districts">
                    <div className="text-terminal-muted text-[10px] uppercase tracking-wider">Address as of</div>
                    <div className="text-terminal-accent text-sm font-bold tabular-nums">{dist!.most_recent_year}</div>
                  </div>
                )}
              </>
            ) : districtBadge && (
              <>
                <div className="border-l border-terminal-border self-stretch" aria-hidden />
                <div>
                  <div className="text-terminal-muted text-xs uppercase tracking-wider">Districts</div>
                  <Tooltip content={<>No electoral districts for this donor: {districtBadge.toLowerCase()}.</>}>
                    <span className="inline-block mt-0.5 border border-terminal-border rounded px-1.5 py-0.5 text-xs text-terminal-muted cursor-help">
                      {districtBadge}
                    </span>
                  </Tooltip>
                </div>
              </>
            )}
            {businesses.length > 0 && (
              <div className="self-center">
                <Tooltip
                  placement="bottom"
                  widthClass="w-[340px] max-w-[92vw] text-left"
                  content={
                    <>
                      <strong className="text-amber-300">💼 Business owner.</strong> This donor is the
                      registered agent of {businesses.length} Missouri business
                      {businesses.length === 1 ? '' : 'es'} on file with the Secretary of State, matched
                      to their giving address (so it's this person, not a same-named other). For small
                      entities the registered agent is typically the owner/operator.
                      {data?.business_profile && (data.business_profile.summary || data.business_profile.industries) && (
                        <div className="mt-2 text-gray-200">
                          {(() => { try { return (JSON.parse(data.business_profile.industries || '[]') as string[]) } catch { return [] } })()
                            .map((ind, i) => (
                              <span key={i} className="inline-block text-[10px] text-amber-200 border border-amber-500/40 rounded px-1.5 py-0.5 mr-1 mb-1">{ind}</span>
                            ))}
                          {data.business_profile.summary && <div className="mt-1 text-gray-300 italic">{data.business_profile.summary}</div>}
                        </div>
                      )}
                      <div className="mt-2 pt-2 border-t border-terminal-border max-h-[40vh] overflow-auto">
                        {businesses.map((b, i) => (
                          <div key={i} className="mb-1 flex items-baseline gap-1.5">
                            <span className="text-amber-300">▸</span>
                            <span className="text-gray-100">
                              {b.url ? <a href={b.url} target="_blank" rel="noreferrer" className="text-amber-200 hover:text-amber-100 hover:underline">{b.name}</a> : b.name}
                              {b.status && b.status.toLowerCase() !== 'active' ? <span className="text-gray-400 text-[11px]"> · {b.status}</span> : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1.5">Source: MO Secretary of State — Business Filings</div>
                    </>
                  }
                >
                  <span className="biz-glow inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold rounded px-2 py-1 cursor-help">
                    💼 {businesses.length === 1 ? 'Business Owner' : `${businesses.length} Businesses`}
                  </span>
                </Tooltip>
              </div>
            )}
          </div>
        )}
      </div>
      </TopBarPortal>

      {/* Empty state when FEC returns no contributions */}
      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-terminal-muted text-xs gap-2">
          <div className="text-2xl opacity-30">∅</div>
          <div className="uppercase tracking-wider">No FEC contribution records found</div>
          <div className="text-terminal-border max-w-xs text-center">
            This donor may have contributed under a different name spelling, or may not have any itemized federal contributions on file.
          </div>
        </div>
      )}

      {/* ── Split panel: Finance left | Issue tags right ── */}
      {name && (segments.length >= 1 || issueLoading || issueScores) && (
        <div className="border-b border-terminal-border bg-terminal-panel flex flex-col md:flex-row md:items-start">

          {/* Left: campaign finance / donut — takes full height */}
          {segments.length >= 1 && (
            <div className="md:w-1/2 md:border-r border-terminal-border border-b md:border-b-0 px-4 py-3 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-terminal-muted text-xs uppercase tracking-wider">
                  {hasEarmarks ? 'Effective Recipients (earmark-resolved)' : 'Donations by Recipient'}
                </span>
                {selectedSlice && (
                  <button onClick={() => setSelectedSlice(null)} className="text-xs text-terminal-accent border border-terminal-accent px-2 py-0.5 hover:bg-terminal-accent hover:text-white transition-colors">✕ Clear</button>
                )}
              </div>

              {/* Donut + legend side by side. Donut hidden when 1 recipient (a solid circle is meaningless). */}
              <div className="flex gap-4 flex-1 min-h-0">
                {segments.length > 1 && (
                  <RecipientDonut segments={segments} selected={selectedSlice} onSelect={setSelectedSlice} size={Math.min(120, 60 + segments.length * 12)} />
                )}
                <div className="flex-1 min-w-0 flex flex-col justify-start gap-1">
                  {segments.map(s => (
                    <button
                      key={s.key}
                      onClick={() => { setConduitFilter(null); setSelectedSlice(selectedSlice === s.key ? null : s.key) }}
                      className={`flex items-center gap-2 text-left py-1 px-1.5 rounded transition-colors w-full ${
                        selectedSlice === s.key ? 'bg-white/10' : selectedSlice || conduitFilter ? 'opacity-35 hover:opacity-70' : 'hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-terminal-text text-xs truncate flex-1 min-w-0 leading-snug">{s.label}</span>
                      <span className="text-terminal-green text-xs font-bold flex-shrink-0 ml-auto pl-2">{fmtK(s.value)}</span>
                    </button>
                  ))}
                  {conduitNames.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1.5 mt-0.5 border-t border-terminal-border">
                      <span className="text-terminal-muted text-xs">via:</span>
                      {conduitNames.map(cn => (
                        <button key={cn} onClick={() => { setSelectedSlice(null); setConduitFilter(conduitFilter === cn ? null : cn) }}
                          className={`text-xs px-1.5 py-0.5 border rounded transition-colors ${conduitFilter === cn ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10' : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'}`}>
                          {cn}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Right: issue score tags */}
          <div className={`${segments.length >= 1 ? 'md:w-1/2' : 'w-full'} px-4 py-3 flex flex-col gap-2`}>
            {data?.giving_scope && data.giving_scope.tags.length > 0 && (
              <div className="flex flex-col gap-1.5 pb-2 mb-1 border-b border-terminal-border">
                <div className="text-terminal-muted text-xs uppercase tracking-wider">Giving Scope</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.giving_scope.tags.map((t, i) => (
                    <Tooltip key={i} placement="bottom" widthClass="w-[280px] max-w-[90vw] text-left"
                      content={<span className="text-gray-100">{t.tip}</span>}>
                      <span className={`text-[11px] font-bold rounded px-2 py-0.5 border cursor-help ${SCOPE_STYLE[t.kind] || SCOPE_STYLE.scope}`}>
                        {t.label}
                      </span>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}
            <div className="text-terminal-muted text-xs uppercase tracking-wider flex items-center gap-2 flex-wrap">
              Issue Profile
              {issueLoading && <span className="animate-pulse text-terminal-border text-xs">computing…</span>}
              {issueError && !issueLoading && (
                <button onClick={() => data && runIssueScoring(data, name, state)} className="text-terminal-red text-xs border border-terminal-red px-1.5 py-0.5 hover:bg-terminal-red/10 transition-colors">retry</button>
              )}
              {issueScores && (() => {
                const inactive = issueScores.filter(s => s.classification === 'low_information')
                if (inactive.length === 0) return null
                const list = inactive.map(s => SHORT_LABELS[s.issue_id] ?? s.label).join(' · ')
                return (
                  <Tooltip
                    widthClass="w-[624px] max-w-[90vw] text-left"
                    placement="bottom"
                    content={<><strong>No signal on:</strong> {list}</>}
                  >
                    <span className="text-terminal-red normal-case tracking-normal cursor-help underline decoration-dotted">
                      no signal on these beliefs ({inactive.length})
                    </span>
                  </Tooltip>
                )
              })()}
            </div>
            {issueError && !issueLoading && !issueScores && (
              <div className="text-terminal-muted text-xs opacity-60">Issue scoring failed — click retry</div>
            )}
            {issueScores && (() => {
              const active = issueScores.filter(s => s.classification !== 'low_information')
              const TAG_BORDER: Record<string, string> = {
                supportive:        'border-terminal-green text-terminal-green',
                lean_supportive:   'border-green-700 text-green-500',
                oppositional:      'border-terminal-red text-terminal-red',
                lean_oppositional: 'border-red-800 text-red-400',
                mixed:             'border-yellow-600 text-yellow-400',
                neutral:           'border-terminal-muted text-terminal-muted',
              }
              return (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {active.map(s => {
                      const cls = TAG_BORDER[s.classification] ?? TAG_BORDER.neutral
                      const shortLabel = SHORT_LABELS[s.issue_id] ?? s.label
                      const verdict = CLASS_STYLE[s.classification]?.label ?? s.classification
                      const stanceMap: Record<string, string> = {
                        supportive: 'strong_support', lean_supportive: 'lean_support',
                        oppositional: 'strong_oppose', lean_oppositional: 'lean_oppose',
                        mixed: 'mixed', neutral: 'any',
                      }
                      const stance = stanceMap[s.classification] ?? 'any'
                      const tipFn = CLASS_TIP[s.classification]
                      const tip = tipFn ? tipFn(s.label, Math.round(s.confidence * 100), s.evidence_count) : undefined
                      const btn = (
                        <button
                          key={s.issue_id}
                          onClick={() => navigate(`/donors?issue_id=${s.issue_id}&stance=${stance}`)}
                          className={`inline-flex items-center gap-1 border rounded px-2 py-0.5 text-xs font-medium cursor-pointer transition-opacity hover:opacity-70 ${cls}`}
                        >
                          <span className="opacity-70">{shortLabel}</span>
                          <span className="font-bold">{verdict}</span>
                        </button>
                      )
                      return tip ? <Tooltip key={s.issue_id} content={tip}>{btn}</Tooltip> : btn
                    })}
                  </div>
                  <div className="text-terminal-border text-xs mt-auto pt-2">
                    Inferred from contribution patterns — probabilistic, not stated positions.
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Active filter banner */}
      {(selectedSeg || conduitFilter) && (
        <div className="px-4 py-1.5 border-b border-terminal-accent/40 bg-terminal-panel flex items-center gap-2 text-xs flex-wrap">
          {conduitFilter ? (
            <>
              <span className="text-terminal-muted">Showing all</span>
              <span className="text-terminal-accent font-bold">{displayRows.length}</span>
              <span className="text-terminal-muted">of {rows.length} contributions routed through</span>
              <span className="text-terminal-accent font-bold">{conduitFilter}</span>
              <button onClick={() => setConduitFilter(null)} className="ml-1 text-terminal-muted hover:text-terminal-text">✕</button>
            </>
          ) : selectedSeg ? (
            <>
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: selectedSeg.color }} />
              <span className="text-terminal-muted">Showing</span>
              <span className="text-terminal-accent font-bold">{displayRows.length}</span>
              <span className="text-terminal-muted">of {rows.length} contributions to</span>
              <span className="text-terminal-text font-bold truncate">{selectedSeg.label}</span>
              {selectedSeg.viaConduit && <span className="text-terminal-muted">(via {selectedSeg.viaConduit})</span>}
              <button onClick={() => setSelectedSlice(null)} className="ml-1 text-terminal-muted hover:text-terminal-text">✕</button>
            </>
          ) : null}
        </div>
      )}

      <DataTable
        columns={cols}
        rows={displayRows}
        rowKey={(r) => r.transaction_id ?? `mec-${r.contributor_name}-${r.contribution_receipt_date}-${r.contribution_receipt_amount}`}
        loading={loading}
        error={error}
        count={displayRows.length}
      />
    </div>
  )
}
