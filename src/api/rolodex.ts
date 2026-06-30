// API client for the Rolodex PWA (client-facing) + its back-office admin.
// Client endpoints authenticate with a per-client token (stored on the device);
// admin endpoints ride the normal app session.
const BASE = '/api/rolodex'

async function req<T>(path: string, method: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['X-Rolodex-Token'] = token
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try { const j = await res.json(); if (j?.detail) msg = j.detail } catch { /* noop */ }
    throw new Error(msg)
  }
  return res.json()
}

// ── shared types ──────────────────────────────────────────────────────────────
export interface RawContact {
  name?: string; first?: string; last?: string
  phone?: string; email?: string
  street?: string; city?: string; state?: string; zip?: string
}

export interface DonorIssue { id: string; label: string; classification: string }

export interface RolodexCard {
  contributor_key: string
  name: string
  state: string
  contact_name?: string
  phone?: string | null
  email?: string | null
  confidence: 'high' | 'medium'
  party?: string
  party_confidence?: number
  party_activist?: string | null
  lean_pct?: number | null
  ask?: number | null
  ask_array?: number[]
  segment?: string
  day_fit: number
  expected_value: number
  gift_count?: number
  total_amount?: number
  avg_gift?: number
  max_gift?: number
  last_gift_year?: number
  industry_id?: string | null
  employer?: string | null
  county_name?: string | null
  issues: DonorIssue[]
}

export interface ClientInfo {
  id: string; name: string; candidate?: string; party?: string
  fundraising_url?: string; consent_share: boolean; token: string
}

export interface AdminClient {
  id: string; name: string; candidate?: string; party?: string; email?: string
  fundraising_url?: string; consent_share: number; active: number
  created_at?: string; installed_at?: string | null; last_active?: string | null
  install_url: string
  calls: number; pledges: number; pledged_amount: number; match_sessions: number
  last_event?: string | null
}

export const rolodexApi = {
  // ── client (token-authed) ──
  me: (token: string) => req<ClientInfo>('/me', 'POST', { token }, token),
  match: (token: string, contacts: RawContact[], todayDow: number) =>
    req<{ matched: number; submitted: number; today_dow: number; results: RolodexCard[] }>(
      '/match', 'POST', { token, contacts, today_dow: todayDow }, token),
  script: (token: string, card: { name: string; state?: string; phone?: string | null; email?: string | null }) =>
    req<any>('/script', 'POST', { token, ...card }, token),
  logCall: (token: string, contributor_key: string, outcome: string, amount?: number | null, note?: string) =>
    req<{ ok: boolean }>('/log-call', 'POST', { token, contributor_key, outcome, amount, note }, token),
  saveContacts: (token: string, contacts: Array<{ contributor_key: string } & RawContact>) =>
    req<{ saved: number; consent: boolean }>('/contacts/save', 'POST', { token, contacts }, token),

  // ── admin (app-gated) ──
  listClients: () => req<{ clients: AdminClient[] }>('/clients', 'GET'),
  createClient: (c: Partial<AdminClient>) => req<AdminClient>('/clients', 'POST', c),
  updateClient: (cid: string, patch: Record<string, unknown>) =>
    req<AdminClient>(`/clients/${cid}`, 'PATCH', patch),
  clientCalls: (cid: string) => req<{ calls: any[] }>(`/clients/${cid}/calls`, 'GET'),
  clientQr: (cid: string) => req<{ install_url: string; qr: string | null }>(`/clients/${cid}/qr`, 'GET'),
  clientInvite: (cid: string) =>
    req<{ to: string; subject: string; body: string; install_url: string }>(`/clients/${cid}/invite`, 'GET'),
  sendInvite: (cid: string) =>
    req<{ sent: boolean; configured: boolean; to?: string }>(`/clients/${cid}/send-invite`, 'POST'),
}
