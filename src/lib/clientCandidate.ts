// Shared "active client candidate" context.
//
// A prospect score and IN-DISTRICT tag only mean something relative to a client
// candidate. The Prospects page saves the candidate you last scored here; any
// call sheet you open afterwards (including from a donor profile) reuses it so
// the sheet carries the same fit picture. Stored in localStorage.

export interface ClientCandidate {
  party?: string
  district_type?: string
  district_value?: string
  target_industries?: string[]
  target_issues?: string[]
  // Candidate identity used to personalize the call script (page 2).
  candidate_name?: string
  office_label?: string        // e.g. "Missouri House District 50"
  fundraising_url?: string     // ActBlue/WinRed/donate link
  caller_role?: 'candidate' | 'staff'   // who's making the calls (defaults the popup)
  saved_at?: number
}

const KEY = 'rp_client_candidate'

export function getClientCandidate(): ClientCandidate | null {
  try {
    const s = localStorage.getItem(KEY)
    return s ? (JSON.parse(s) as ClientCandidate) : null
  } catch {
    return null
  }
}

export function setClientCandidate(c: ClientCandidate | null): void {
  try {
    const meaningful = c && (c.party || c.district_value || c.target_industries?.length ||
      c.target_issues?.length || c.candidate_name || c.office_label || c.fundraising_url)
    if (meaningful) {
      localStorage.setItem(KEY, JSON.stringify({ ...c, saved_at: Date.now() }))
    } else {
      localStorage.removeItem(KEY)
    }
  } catch {
    /* ignore */
  }
}

// Merge a partial update into the stored candidate (used by the candidate panel).
export function updateClientCandidate(patch: Partial<ClientCandidate>): ClientCandidate {
  const next = { ...(getClientCandidate() || {}), ...patch }
  setClientCandidate(next)
  return next
}

const DTYPE_LABEL: Record<string, string> = { us_house: 'CD', mo_house: 'HD', mo_senate: 'SD' }

export function candidateLabel(c: ClientCandidate | null): string {
  if (!c) return ''
  const parts: string[] = []
  if (c.party) parts.push(c.party)
  if (c.district_type && c.district_value) parts.push(`${DTYPE_LABEL[c.district_type] || ''}-${c.district_value}`)
  const n = (c.target_industries?.length || 0) + (c.target_issues?.length || 0)
  if (n) parts.push(`+${n} targets`)
  return parts.join(' ') || 'Custom candidate'
}

// URL params for the callsheet endpoint so the backend can compute fit.
export function candidateParams(c: ClientCandidate | null): Record<string, string> {
  const p: Record<string, string> = {}
  if (!c) return p
  if (c.party) p.party = c.party
  if (c.district_type) p.district_type = c.district_type
  if (c.district_value) p.district_value = c.district_value
  if (c.target_industries?.length) p.target_industries = c.target_industries.join(',')
  if (c.target_issues?.length) p.target_issues = c.target_issues.join(',')
  if (c.candidate_name) p.candidate_name = c.candidate_name
  if (c.office_label) p.office_label = c.office_label
  if (c.fundraising_url) p.fundraising_url = c.fundraising_url
  return p
}
