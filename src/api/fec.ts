const BASE = '/api'

// Client-side request ceiling. The backend time-boxes its slow paths (FEC ~3.5s,
// profile ~8s) and nginx caps a hung upstream at 60s, but without a client timeout
// a stalled request leaves the UI spinning indefinitely. Reject at 30s so the
// page's existing error state renders instead of an endless spinner.
const REQUEST_TIMEOUT_MS = 30_000

async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: ctrl.signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Request timed out — the server took too long to respond')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function get<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const res = await fetchWithTimeout(`${BASE}${path}?${sp}`)
  if (!res.ok) throw new Error(`FEC API error: ${res.status}`)
  return res.json()
}

export interface FecPage<T> {
  results: T[]
  pagination: { count: number; page: number; pages: number; per_page: number }
}

export interface Candidate {
  candidate_id: string
  name: string
  state: string
  office: string
  office_full: string
  district?: string
  party: string
  party_full: string
  incumbent_challenge_full: string
  candidate_status?: string
  cycles: number[]
  election_years: number[]
  has_raised_funds: boolean
  receipts?: number
  disbursements?: number
  cash_on_hand_end_period?: number
  coverage_end_date?: string
}

export interface CandidateTotal {
  cycle: number
  receipts: number
  disbursements: number
  cash_on_hand_end_period: number | string
  coverage_start_date: string | null
  coverage_end_date: string | null
  individual_itemized_contributions?: number
  individual_unitemized_contributions?: number
  other_political_committee_contributions?: number
  party_and_committee_contributions?: number
  candidate_contribution?: number
}

export interface CandidateProfile {
  totals: CandidateTotal[]
  committees: Committee[]
}

export interface Committee {
  committee_id: string
  name: string
  state: string
  committee_type: string
  committee_type_full: string
  party: string
  party_full: string
  organization_type_full: string
  treasurer_name: string
  cycles: number[]
  last_receipt_date?: string
}

export interface CommitteeTotal {
  cycle: number
  receipts: number
  disbursements: number
  cash_on_hand_end_period: number
  coverage_end_date: string | null
  individual_contributions: number
  other_political_committee_contributions: number
}

export interface CommitteeDonor {
  contributor_name: string
  contributor_city: string | null
  contributor_state: string
  contributor_employer: string | null
  contributor_occupation: string | null
  contribution_receipt_amount: number
  contribution_receipt_date: string | null
  donor_party: 'DEM' | 'REP' | 'SPLIT' | null
  donor_party_confidence: number
}

export interface Contribution {
  contributor_name: string
  contributor_city: string
  contributor_state: string
  contributor_zip: string
  contributor_employer: string
  contributor_occupation: string
  contribution_receipt_date: string
  contribution_receipt_amount: number
  receipt_type_full: string
  committee: { name: string; committee_id: string } | null
  candidate_id: string | null
  transaction_id: string
  committee_party: 'DEM' | 'REP' | null
  donor_party: 'DEM' | 'REP' | 'SPLIT' | null
  donor_party_confidence: number
}

export interface NetworkStats {
  running: boolean
  committees: { total: number; by_party: Record<string, number> }
  donors: { total: number; by_party: Record<string, number> }
}

export interface TaggingHealth {
  status: 'idle' | 'healthy' | 'stalled' | 'done'
  running: boolean
  coverage_pct: number
  tagged: number
  total: number
  remaining_taggable: number
  tagged_this_week: number
  last_run: { ran_at: string; attempted: number; classified: number } | null
}

export interface SystemJob {
  key: string
  label: string
  schedule: string
  desc: string
  kind: 'cron' | 'timer'
  last_run: string | null
  status: 'ok' | 'error' | 'ran' | 'unknown'
  summary: string
}

export interface FundraisingMessage {
  name: string
  party: 'DEM' | 'REP' | 'SPLIT' | 'UNKNOWN' | null
  segment: string | null
  ask: number | null
  issues: { label: string; classification: string }[]
  subject: string
  email: string
  sms: string
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export interface ProspectRequest {
  party?: string
  district_type?: string
  district_value?: string
  county?: string
  target_industries?: string[]
  target_issues?: string[]
  state?: string
  min_total?: number
  exclude_orgs?: boolean
  require_district?: boolean
  require_party_match?: boolean
  only_with_contact?: boolean
  prioritize_contacts?: boolean
  weights?: Record<string, number>
  limit?: number
  offset?: number
}

export interface Prospect {
  contributor_key: string
  contributor_name: string
  contributor_state: string | null
  source: 'mec' | 'fec' | 'both'
  gift_count: number
  total_amount: number
  last_gift_date: string | null
  last_gift_year: number | null
  max_gift: number
  avg_gift: number
  r_score: number; f_score: number; m_score: number; cap_score: number
  us_house_district: string | null
  mo_house_district: string | null
  mo_senate_district: string | null
  county_name: string | null
  industry_id: string | null
  employer: string | null
  party: 'DEM' | 'REP' | 'SPLIT' | 'UNKNOWN' | null
  party_confidence: number
  rfm_score: number
  capacity_score: number
  party_align: number
  district_align: number
  industry_align: number
  issue_align: number
  composite: number
  has_contact?: number   // 1 when we have saved contact info (set by prioritize_contacts)
}

export interface ProspectResponse {
  count: number
  limit: number
  offset: number
  weights: Record<string, number>
  active_components: string[]
  results: Prospect[]
}

export interface ProspectOptions {
  default_weights: Record<string, number>
  districts: { us_house: string[]; mo_house: string[]; mo_senate: string[] }
  counties: string[]
  rfm_stats: { total: number; built_at?: string; has_party?: number; has_industry?: number; has_district?: number }
  built: string | null
}

// ── Fundraising Lists (look-alike / lapsed / sustainers) ──────────────────────
// Every list endpoint returns this shared donor_rfm row shape (plus a
// mode-specific metric), so one DataTable renders them all.
export interface DonorListRow {
  contributor_key: string
  contributor_name: string
  contributor_state: string | null
  source: 'mec' | 'fec' | 'both'
  gift_count: number
  total_amount: number
  last_gift_date: string | null
  last_gift_year: number | null
  max_gift: number
  avg_gift: number
  r_score: number; f_score: number; m_score: number; cap_score: number
  us_house_district: string | null
  mo_house_district: string | null
  mo_senate_district: string | null
  county_name: string | null
  industry_id: string | null
  employer: string | null
  party: 'DEM' | 'REP' | 'SPLIT' | 'UNKNOWN' | null
  party_confidence: number
  has_contact?: number
  // mode-specific metrics (only the active mode's field is present)
  similarity?: number          // look-alike
  reactivation_score?: number  // lapsed
  years_quiet?: number         // lapsed
  sustainer_score?: number     // sustainers
  suggested_monthly?: number   // sustainers
}

export interface LookalikeRequest {
  seed_committee?: string
  seed_keys?: string[]
  state?: string
  exclude_orgs?: boolean
  min_total?: number
  limit?: number
  offset?: number
}

export interface LookalikeResponse {
  seed_size: number
  centroid: { lean: number; rfm_mean: number; cap_mean: number; industries: string[] }
  limit: number
  offset: number
  results: DonorListRow[]
}

export interface LapsedRequest {
  party?: string
  district_type?: string
  district_value?: string
  county?: string
  state?: string
  quiet_years?: number
  max_dormant_years?: number
  min_total?: number
  min_gifts?: number
  exclude_orgs?: boolean
  require_party_match?: boolean
  limit?: number
  offset?: number
}

export interface LapsedResponse {
  count: number
  limit: number
  offset: number
  as_of_year: number
  cutoff_year: number
  results: DonorListRow[]
}

export interface SustainerRequest {
  party?: string
  district_type?: string
  district_value?: string
  county?: string
  state?: string
  max_gift?: number
  min_gifts?: number
  active_since_year?: number
  exclude_orgs?: boolean
  require_party_match?: boolean
  limit?: number
  offset?: number
}

export interface SustainerResponse {
  count: number
  limit: number
  offset: number
  as_of_year: number
  active_since_year: number
  results: DonorListRow[]
}

async function del<T>(path: string): Promise<T> {
  const res = await fetchWithTimeout(`${BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export interface NamelessContact {
  email: string
  guessed_first?: string | null
  guessed_last?: string | null
  guessed_name?: string | null
  phone?: string | null
  source?: string | null
  status?: string | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface DonorMatch {
  contributor_key: string
  contributor_name: string
  contributor_state: string | null
  total_amount: number
  party: string | null
  last_gift_year: number | null
}

export interface ContactPreviewRow {
  parsed: {
    name: string; phone: string; email: string; street: string
    city: string; state: string; zip: string; best_time: string; notes: string; raw: string
    gender: string; dob: string; age_range: string; marital_status: string
  }
  match: DonorMatch | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  alternates: DonorMatch[]
}

export interface ContactMatchResponse {
  count: number; matched: number; unmatched: number; rows: ContactPreviewRow[]
}

export interface SavedContact {
  contributor_key: string; display_name?: string; phone?: string; email?: string
  street?: string; city?: string; state?: string; zip?: string; best_time?: string; notes?: string
  gender?: string; dob?: string; age_range?: string; marital_status?: string
  source?: string; updated_at?: string
}

// ── Email Harvester ───────────────────────────────────────────────────────
export interface HarvestRequest {
  name: string
  places: string[]
  categories: string[]
  extra_niches?: string[]
  candidate_names?: string[]
  platforms?: string[]
  party?: string
  state?: string
  max_per_query?: number
  max_urls?: number
  max_queries?: number
  do_smtp?: boolean
}

export interface HarvestedLead {
  email: string
  name: string | null
  party: string | null
  is_donor: number
  donor_confidence: string | null
  contributor_key: string | null
  lifetime_total: number
  verify_score: number
  verify_status: string
  is_role: number
  platform: string
  source_url: string
  campaign: string
  found_at: string
}

export interface HarvestSummary {
  campaign: string; queries: number; urls_discovered: number
  urls_harvested: number; new_emails: number; new_donors: number
}

export interface HarvesterNiches {
  library: Record<string, string[]>
  platforms: string[]
  parties: string[]
}

export interface EnrichRequest {
  industry_id: string
  limit?: number
  min_dollars?: number
  do_smtp?: boolean
}

export interface EnrichSummary {
  industry: string; employers: number; with_site: number
  emails: number; campaign: string
}

export const fecApi = {
  candidates: (params: {
    q?: string; state?: string; office?: string; party?: string
    cycle?: number; district?: string; per_page?: number; page?: number; randomize?: boolean
  }) => get<FecPage<Candidate>>('/candidates/', params),

  candidateProfile: (id: string) =>
    get<CandidateProfile>(`/candidates/${id}/profile`, {}),

  committees: (params: {
    q?: string; state?: string; committee_type?: string; party?: string; cycle?: number; per_page?: number; page?: number; randomize?: boolean
  }) => get<FecPage<Committee>>('/committees/', params),

  committeeTotals: (id: string) =>
    get<{ results: CommitteeTotal[] }>(`/committees/${id}/totals`, {}),

  committeeDonors: (id: string, params: { state?: string; per_page?: number; min_date?: string }) =>
    get<{ results: CommitteeDonor[]; count: number }>(`/committees/${id}/mo-donors`, params),

  committeeSpending: (id: string) =>
    get<{ total: number; categories: { name: string; amount: number }[]; top_recipients: { name: string; amount: number }[]; transaction_count: number }>(`/committees/${id}/spending`, {}),

  donors: (params: {
    contributor_name?: string; contributor_state?: string; contributor_employer?: string
    contributor_occupation?: string; contributor_zip?: string; min_date?: string; max_date?: string
    min_amount?: number; max_amount?: number; per_page?: number
  }) => get<FecPage<Contribution>>('/donors/', params),

  networkStats: () => get<NetworkStats>('/network/stats', {}),

  taggingHealth: () => get<TaggingHealth>('/issues/tagging-health', {}),

  startCrawl: (max_pacs = 50) =>
    fetch(`/api/network/crawl?max_pacs=${max_pacs}`, { method: 'POST' }).then(r => r.json()),

  prospectOptions: () => get<ProspectOptions>('/prospects/options', {}),

  scoreProspects: (req: ProspectRequest) => post<ProspectResponse>('/prospects/score', req),

  lookalike: (req: LookalikeRequest) => post<LookalikeResponse>('/prospects/lookalike', req),

  lapsedDonors: (req: LapsedRequest) => post<LapsedResponse>('/prospects/lapsed', req),

  sustainers: (req: SustainerRequest) => post<SustainerResponse>('/prospects/sustainers', req),

  matchContacts: (text: string) => post<ContactMatchResponse>('/prospects/contacts/match', { text }),

  saveContacts: (contacts: SavedContact[]) => post<{ saved: number }>('/prospects/contacts/save', { contacts }),

  listContacts: () => get<{ contacts: SavedContact[]; count: number }>('/prospects/contacts', {}),

  listNamelessContacts: (status?: string) =>
    get<{ contacts: NamelessContact[]; count: number }>('/prospects/nameless-contacts', status ? { status } : {}),
  updateNamelessContact: (email: string, patchBody: Partial<NamelessContact>) =>
    patch<{ updated: string }>(`/prospects/nameless-contacts/${encodeURIComponent(email)}`, patchBody),
  deleteNamelessContact: (email: string) =>
    del<{ deleted: string }>(`/prospects/nameless-contacts/${encodeURIComponent(email)}`),

  deleteContact: (key: string) => del<{ deleted: string }>(`/prospects/contacts/${encodeURIComponent(key)}`),

  fundraisingMessage: (req: {
    name: string; state?: string; candidate_name?: string; office_label?: string
    district_type?: string; district_value?: string; fundraising_url?: string
  }) => post<FundraisingMessage>('/prospects/fundraising-message', req),

  systemJobs: () => get<{ jobs: SystemJob[] }>('/system/jobs', {}),

  systemJobLog: (key: string, password: string, lines = 100) =>
    get<{ key: string; label: string; lines: string[] }>(`/system/jobs/${encodeURIComponent(key)}/log`, { lines, password }),

  // Email Harvester
  harvesterNiches: () => get<HarvesterNiches>('/harvester/niches', {}),

  runHarvest: (req: HarvestRequest) =>
    post<{ summary: HarvestSummary; leads: HarvestedLead[] }>('/harvester/run', req),

  harvesterLeads: (params: { campaign?: string; donors_only?: boolean; min_score?: number; limit?: number; offset?: number }) =>
    get<{ total: number; leads: HarvestedLead[] }>('/harvester/leads', params),

  harvesterStats: (campaign?: string) =>
    get<{ total: number; donors: number; valid: number; role: number; campaigns: { campaign: string; n: number }[] }>('/harvester/stats', { campaign }),

  harvesterIndustries: () => get<{ industries: string[] }>('/harvester/industries', {}),

  enrichIndustry: (req: EnrichRequest) =>
    post<{ summary: EnrichSummary; leads: HarvestedLead[] }>('/harvester/enrich-industry', req),

  // Secondary-source verifications
  verificationStats: () => get<VerificationStats>('/verifications/stats', {}),

  verificationQueue: (params: { limit?: number; offset?: number; source_id?: string }) =>
    get<{ rows: PendingVerification[]; count: number }>('/verifications/review', params),

  decideVerification: (id: number, decision: 'approve' | 'reject') =>
    post<{ ok: boolean; status: string }>(`/verifications/${id}/decide`, { decision }),
}

export interface VerificationStats {
  by_status: Record<string, number>
  by_source: { source_id: string; source_label: string; source_type: string; total: number; active: number; pending: number }[]
  verified_donors: number
}

export interface PendingVerification {
  id: number
  contributor_key: string
  source_id: string
  source_label: string
  match_basis: string | null
  matched_name: string | null
  reg_party: string | null
  res_street: string | null
  res_city: string | null
  res_state: string | null
  res_zip: string | null
  record_status: string | null
  // joined donor summary
  contributor_name: string | null
  contributor_state: string | null
  total_amount: number | null
  gift_count: number | null
  last_gift_year: number | null
  donor_party: string | null
}

export async function logExport(exportType: string, context: string, rowCount: number): Promise<void> {
  try {
    await fetch(`/api/admin/log-export?export_type=${encodeURIComponent(exportType)}&context=${encodeURIComponent(context)}&row_count=${rowCount}`, { method: 'POST' })
  } catch {}
}
