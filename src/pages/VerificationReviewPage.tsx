import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { fecApi, type PendingVerification, type VerificationStats } from '../api/fec'
import { TopBarPortal } from '../lib/topbar'

const fmt = (n: number | null) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)

const BASIS_LABEL: Record<string, string> = {
  'name-only': 'name only',
  'name-only-ambiguous': 'name only — multiple possible people',
}

const profileHref = (name: string | null, state: string | null) =>
  `/donors/profile?name=${encodeURIComponent(name || '')}${state ? `&state=${encodeURIComponent(state)}` : ''}`

export default function VerificationReviewPage() {
  const [stats, setStats] = useState<VerificationStats | null>(null)
  const [rows, setRows] = useState<PendingVerification[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([fecApi.verificationStats(), fecApi.verificationQueue({ limit: 200 })])
      .then(([s, q]) => { setStats(s); setRows(q.rows) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const decide = (id: number, decision: 'approve' | 'reject') => {
    setBusy(id)
    fecApi.decideVerification(id, decision)
      .then(() => {
        setRows(rs => rs.filter(r => r.id !== id))
        setStats(s => s ? {
          ...s,
          verified_donors: s.verified_donors + (decision === 'approve' ? 1 : 0),
          by_status: {
            ...s.by_status,
            pending: Math.max(0, (s.by_status.pending || 0) - 1),
            [decision === 'approve' ? 'approved' : 'rejected']:
              (s.by_status[decision === 'approve' ? 'approved' : 'rejected'] || 0) + 1,
          },
        } : s)
      })
      .catch(e => setError(String(e)))
      .finally(() => setBusy(null))
  }

  return (
    <div className="flex flex-col h-full">
      <TopBarPortal>
        <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="page-title text-terminal-text text-base font-bold tracking-wide">
                <span className="text-terminal-green">✓</span> Donor Verifications
              </h1>
              <p className="text-terminal-muted text-xs mt-0.5 max-w-[640px]">
                Donors cross-checked against authoritative public records. Strict name+address matches are
                auto-verified (green ✓ on their profile). Name-only matches need a human call — approve to
                badge them, reject to discard.
              </p>
            </div>
            {stats && (
              <div className="flex items-center gap-4 text-xs shrink-0">
                <Stat label="Verified donors" value={stats.verified_donors.toLocaleString()} green />
                <Stat label="Pending review" value={(stats.by_status.pending || 0).toLocaleString()} />
                <Stat label="Rejected" value={(stats.by_status.rejected || 0).toLocaleString()} muted />
              </div>
            )}
          </div>
          {stats && stats.by_source.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {stats.by_source.map(s => (
                <span key={s.source_id} className="text-[11px] text-terminal-muted border border-terminal-border rounded px-2 py-0.5">
                  {s.source_label}: <span className="text-terminal-green">{s.active.toLocaleString()} verified</span>
                  {s.pending > 0 && <span className="text-yellow-400"> · {s.pending.toLocaleString()} pending</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      </TopBarPortal>

      <div className="flex-1 overflow-auto p-4">
        {error && <div className="text-terminal-red text-sm mb-3">{error}</div>}
        {loading ? (
          <div className="text-terminal-muted text-sm">Loading review queue…</div>
        ) : rows.length === 0 ? (
          <div className="text-terminal-muted text-sm border border-dashed border-terminal-border rounded p-6 text-center">
            <div className="text-terminal-green text-lg mb-1">✓ Queue clear</div>
            No name-only matches awaiting review. Strict matches are verified automatically; run the
            voter-file matcher to populate this queue.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.id} className="border border-terminal-border rounded p-3 bg-terminal-panel flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={profileHref(r.contributor_name, r.contributor_state)}
                      className="text-terminal-accent text-sm font-bold tracking-wide hover:underline">
                      {r.contributor_name || r.matched_name}
                    </Link>
                    {r.contributor_state && <span className="text-terminal-muted text-xs">{r.contributor_state}</span>}
                    <span className="text-[10px] uppercase tracking-wider text-yellow-400 border border-yellow-600/50 rounded px-1.5 py-0.5">
                      {BASIS_LABEL[r.match_basis || ''] || r.match_basis || 'name only'}
                    </span>
                  </div>
                  <div className="text-xs text-terminal-muted mt-1.5 grid gap-0.5">
                    <div>
                      <span className="text-terminal-muted/70">Donor record: </span>
                      {fmt(r.total_amount)} lifetime · {r.gift_count || 0} gifts
                      {r.last_gift_year ? ` · last ${r.last_gift_year}` : ''}
                      {r.donor_party ? ` · lean ${r.donor_party}` : ''}
                    </div>
                    <div>
                      <span className="text-terminal-muted/70">{r.source_label}: </span>
                      <span className="text-terminal-text">{r.matched_name}</span>
                      {r.reg_party ? <> · registration <span className="text-terminal-text">{r.reg_party}</span></> : ''}
                      {r.record_status ? ` · ${r.record_status}` : ''}
                    </div>
                    {r.res_street && (
                      <div>
                        <span className="text-terminal-muted/70">Address on record: </span>
                        {[r.res_street, r.res_city, r.res_state, r.res_zip].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-terminal-muted/70 mt-1">
                    Confirm this donor and this {r.source_label.split(' (')[0]} record are the same person.
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button disabled={busy === r.id} onClick={() => decide(r.id, 'approve')}
                    className="text-xs font-bold text-black bg-terminal-green/90 hover:bg-terminal-green rounded px-3 py-1.5 disabled:opacity-50 transition-colors">
                    ✓ Approve
                  </button>
                  <button disabled={busy === r.id} onClick={() => decide(r.id, 'reject')}
                    className="text-xs text-terminal-muted border border-terminal-border hover:border-terminal-red hover:text-terminal-red rounded px-3 py-1.5 disabled:opacity-50 transition-colors">
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, green, muted }: { label: string; value: string; green?: boolean; muted?: boolean }) {
  return (
    <div className="text-right">
      <div className={`text-base font-bold tabular-nums ${green ? 'text-terminal-green' : muted ? 'text-terminal-muted' : 'text-terminal-text'}`}>{value}</div>
      <div className="text-terminal-muted text-[10px] uppercase tracking-wider">{label}</div>
    </div>
  )
}
