// ── Rolodex back-office ───────────────────────────────────────────────────────
// Create call-time clients, hand out their install link / QR, email the setup
// instructions, and watch usage: who installed it, calls made, pledges, $ raised.
// A normal gated tool page (uses the app's brand classes + theme tokens).
import { useState, useEffect } from 'react'
import { rolodexApi, type AdminClient } from '../api/rolodex'

const money = (n?: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)

const fmtDate = (s?: string | null) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString() : '—')

export default function RolodexAdminPage() {
  const [clients, setClients] = useState<AdminClient[] | null>(null)
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = () => rolodexApi.listClients().then(r => setClients(r.clients)).catch(e => setErr(String(e)))
  useEffect(() => { load() }, [])

  const totalCalls = clients?.reduce((s, c) => s + c.calls, 0) || 0
  const totalPledged = clients?.reduce((s, c) => s + c.pledged_amount, 0) || 0

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="page-title text-2xl mb-1">Call Time — Rolodex Clients</h1>
      <p className="text-terminal-muted text-sm mb-5">
        Each client installs the phone app from their own link, matches their contacts to donor profiles,
        and calls from a ranked list. Usage below is live.
      </p>

      {clients && clients.length > 0 && (
        <div className="flex gap-4 mb-5 text-sm">
          <Stat label="Clients" value={clients.length} />
          <Stat label="Installed" value={clients.filter(c => c.installed_at).length} />
          <Stat label="Calls logged" value={totalCalls} />
          <Stat label="Pledged" value={money(totalPledged)} />
        </div>
      )}

      <NewClientForm onCreated={load} setErr={setErr} />

      {err && <p role="alert" className="text-red-500 text-sm my-3">{err}</p>}

      {clients == null ? (
        <p className="text-terminal-muted">Loading…</p>
      ) : clients.length === 0 ? (
        <p className="text-terminal-muted mt-4">No clients yet. Add one above to generate an install link.</p>
      ) : (
        <ul className="flex flex-col gap-3 mt-5">
          {clients.map(c => (
            <ClientRow key={c.id} c={c} expanded={expanded === c.id}
              onToggle={() => setExpanded(e => e === c.id ? null : c.id)} onChange={load} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card-brand px-4 py-2">
      <div className="text-xl font-display font-extrabold">{value}</div>
      <div className="text-terminal-muted text-xs uppercase tracking-wide">{label}</div>
    </div>
  )
}

function NewClientForm({ onCreated, setErr }: { onCreated: () => void; setErr: (s: string) => void }) {
  const [show, setShow] = useState(false)
  const [f, setF] = useState({ name: '', candidate: '', party: 'DEM', email: '', fundraising_url: '', consent_share: true })
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return
    setBusy(true); setErr('')
    try {
      await rolodexApi.createClient({
        name: f.name.trim(), candidate: f.candidate.trim() || undefined, party: f.party,
        email: f.email.trim() || undefined, fundraising_url: f.fundraising_url.trim() || undefined,
        consent_share: f.consent_share ? 1 : 0,
      } as any)
      setF({ name: '', candidate: '', party: 'DEM', email: '', fundraising_url: '', consent_share: true })
      setShow(false); onCreated()
    } catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }

  if (!show) return <button className="btn-primary" onClick={() => setShow(true)}>+ Add client</button>

  return (
    <form onSubmit={submit} className="card-brand p-4 grid gap-3 md:grid-cols-2">
      <Field label="Name *"><input className="input-field" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoFocus required /></Field>
      <Field label="Raising for (campaign/committee)"><input className="input-field" value={f.candidate} onChange={e => setF({ ...f, candidate: e.target.value })} placeholder="Becky Kroll for HD-59" /></Field>
      <Field label="Default party">
        <select className="input-field" value={f.party} onChange={e => setF({ ...f, party: e.target.value })}>
          <option value="DEM">Democrat</option><option value="REP">Republican</option>
        </select>
      </Field>
      <Field label="Email (to send the link)"><input className="input-field" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Their donate link (ActBlue/WinRed)"><input className="input-field" value={f.fundraising_url} onChange={e => setF({ ...f, fundraising_url: e.target.value })} placeholder="https://secure.actblue.com/donate/…" /></Field>
      <label className="flex items-center gap-2 text-sm self-end">
        <input type="checkbox" checked={f.consent_share} onChange={e => setF({ ...f, consent_share: e.target.checked })} />
        Fold their matched contacts into the shared DB
      </label>
      <div className="md:col-span-2 flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create client'}</button>
        <button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-sm"><span className="text-terminal-muted">{label}</span>{children}</label>
}

function ClientRow({ c, expanded, onToggle, onChange }: {
  c: AdminClient; expanded: boolean; onToggle: () => void; onChange: () => void
}) {
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')

  useEffect(() => {
    if (expanded && qr === null) rolodexApi.clientQr(c.id).then(r => setQr(r.qr || '')).catch(() => setQr(''))
  }, [expanded, qr, c.id])

  const copy = () => { navigator.clipboard?.writeText(c.install_url); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  // Try the automated server send; if SMTP isn't configured yet, fall back to a
  // prefilled mailto the user sends from their own mail client.
  const email = async () => {
    setEmailMsg('')
    if (!c.email) { setEmailMsg('Add an email address to this client first (toggle open the editor).'); return }
    try {
      const r = await rolodexApi.sendInvite(c.id)
      if (r.sent) { setEmailMsg(`✓ Invite sent to ${r.to}`); return }
    } catch (e) { setEmailMsg(`Send failed: ${e instanceof Error ? e.message : e}`); return }
    // not configured → mailto fallback
    try {
      const inv = await rolodexApi.clientInvite(c.id)
      window.location.href = `mailto:${encodeURIComponent(inv.to)}?subject=${encodeURIComponent(inv.subject)}&body=${encodeURIComponent(inv.body)}`
      setEmailMsg('Opened a draft in your mail client (automated send isn’t configured yet).')
    } catch { /* noop */ }
  }

  const toggle = async (patch: Record<string, unknown>) => { await rolodexApi.updateClient(c.id, patch); onChange() }

  return (
    <li className="card-brand">
      <button onClick={onToggle} aria-expanded={expanded}
        className="w-full text-left p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display font-bold flex items-center gap-2">
            {c.name}
            {!c.active && <span className="text-xs text-terminal-muted border border-terminal-border rounded px-1.5">inactive</span>}
            <span className="text-xs rounded px-1.5 text-white" style={{ background: c.party === 'REP' ? '#b91c1c' : '#0f4fc9' }}>{c.party || 'DEM'}</span>
          </div>
          <div className="text-terminal-muted text-xs">
            {c.candidate || '—'} · {c.installed_at ? `installed ${fmtDate(c.installed_at)}` : 'not installed yet'} · last active {fmtDate(c.last_active)}
          </div>
        </div>
        <div className="flex gap-4 text-right text-sm flex-shrink-0">
          <span><b className="font-display">{c.calls}</b><br /><span className="text-terminal-muted text-[10px] uppercase">calls</span></span>
          <span><b className="font-display">{c.pledges}</b><br /><span className="text-terminal-muted text-[10px] uppercase">pledges</span></span>
          <span><b className="font-display">{money(c.pledged_amount)}</b><br /><span className="text-terminal-muted text-[10px] uppercase">pledged</span></span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-terminal-border p-4 grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-terminal-muted text-xs uppercase tracking-wide mb-1">Install link</div>
              <code className="block text-xs break-all bg-terminal-bg border border-terminal-border rounded p-2">{c.install_url}</code>
              <div className="flex gap-2 mt-2 flex-wrap">
                <button className="btn-ghost" onClick={copy}>{copied ? '✓ Copied' : 'Copy link'}</button>
                <button className="btn-primary" onClick={email}>✉ Send invite{c.email ? ` to ${c.email}` : ''}</button>
              </div>
              {emailMsg && <p className="text-xs mt-2" style={{ color: emailMsg.startsWith('✓') ? '#1d7a3d' : '#616873' }}>{emailMsg}</p>}
            </div>
            <div className="flex gap-4 flex-wrap text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!c.active} onChange={e => toggle({ active: e.target.checked })} />
                Active (link works)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!c.consent_share} onChange={e => toggle({ consent_share: e.target.checked })} />
                Contributes contacts to shared DB
              </label>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-terminal-muted text-xs uppercase tracking-wide mb-1">Scan to install</div>
            {qr === null ? <span className="text-terminal-muted text-sm">…</span>
              : qr ? <img src={qr} alt={`Install QR for ${c.name}`} className="w-36 h-36 bg-white rounded p-1" />
              : <span className="text-terminal-muted text-xs">QR unavailable</span>}
          </div>
        </div>
      )}
    </li>
  )
}
