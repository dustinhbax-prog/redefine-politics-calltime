import { useState, useEffect, useMemo } from 'react'
import { fecApi, type NamelessContact } from '../api/fec'
import { TopBarPortal } from '../lib/topbar'

const STATUSES = ['new', 'reviewed', 'attributed', 'ignored']

const STATUS_STYLE: Record<string, string> = {
  new: 'text-terminal-accent border-terminal-accent',
  reviewed: 'text-yellow-400 border-yellow-600',
  attributed: 'text-terminal-green border-terminal-green',
  ignored: 'text-terminal-border border-terminal-border',
}

export default function NamelessContactsPage() {
  const [rows, setRows] = useState<NamelessContact[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [savingEmail, setSavingEmail] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fecApi.listNamelessContacts().then(r => setRows(r.contacts)).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const patchRow = async (email: string, patch: Partial<NamelessContact>) => {
    setRows(rs => rs.map(r => (r.email === email ? { ...r, ...patch } : r)))   // optimistic
    setSavingEmail(email)
    try { await fecApi.updateNamelessContact(email, patch) } catch { /* keep optimistic */ }
    finally { setSavingEmail(null) }
  }

  const removeRow = async (email: string) => {
    setRows(rs => rs.filter(r => r.email !== email))
    try { await fecApi.deleteNamelessContact(email) } catch { load() }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r =>
      (!statusFilter || (r.status || 'new') === statusFilter) &&
      (!needle || r.email.toLowerCase().includes(needle) || (r.guessed_name || '').toLowerCase().includes(needle)))
  }, [rows, q, statusFilter])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    rows.forEach(r => { const s = r.status || 'new'; c[s] = (c[s] || 0) + 1 })
    return c
  }, [rows])

  const exportCsv = () => {
    const head = ['email', 'guessed_name', 'phone', 'status', 'notes', 'source']
    const lines = [head.join(',')].concat(filtered.map(r =>
      head.map(k => `"${String((r as unknown as Record<string, unknown>)[k] ?? '').replace(/"/g, '""')}"`).join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'contacts-without-names.csv'; a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBarPortal>
        <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-terminal-accent font-bold uppercase tracking-wider text-sm">Contacts Without Names</h1>
            <span className="text-terminal-muted text-xs">
              Emails from mailing lists that have no name, so they couldn’t be matched to a donor. A best-effort name is guessed from the address — review, fix, and set a status.
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="search email or name…"
              className="bg-terminal-bg border border-terminal-border text-terminal-text text-xs rounded px-2 py-1 w-56 outline-none focus:border-terminal-accent" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="bg-terminal-bg border border-terminal-border text-terminal-text text-xs rounded px-1.5 py-1">
              <option value="">all statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s} ({counts[s] || 0})</option>)}
            </select>
            <span className="text-terminal-muted text-xs">{filtered.length.toLocaleString()} shown · {rows.length.toLocaleString()} total</span>
            <button onClick={exportCsv} disabled={!filtered.length}
              className="border border-terminal-border text-terminal-muted hover:text-terminal-text hover:border-terminal-accent px-2 py-1 text-[11px] uppercase tracking-wider rounded transition-colors disabled:opacity-40">
              Export CSV
            </button>
            {savingEmail && <span className="text-terminal-green text-[11px]">saving…</span>}
          </div>
        </div>
      </TopBarPortal>

      <div className="px-4 py-2">
        {loading ? (
          <div className="text-terminal-muted text-xs py-4">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-terminal-border text-xs py-4">No contacts{q || statusFilter ? ' match the filter' : ' without names yet'}.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-terminal-muted text-[10px] uppercase tracking-wider border-b border-terminal-border">
                <th className="text-left py-1">Email</th>
                <th className="text-left py-1">Guessed name</th>
                <th className="text-left py-1">Phone</th>
                <th className="text-left py-1">Status</th>
                <th className="text-left py-1">Notes</th>
                <th className="text-left py-1 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.email} className="border-b border-terminal-border/40 align-top">
                  <td className="py-1.5 pr-2">
                    <a href={`mailto:${r.email}`} className="text-terminal-text hover:text-terminal-accent break-all">{r.email}</a>
                    {r.source && <div className="text-terminal-border text-[9px]">{r.source}</div>}
                  </td>
                  <td className="py-1.5 pr-2">
                    <input defaultValue={r.guessed_name || ''} placeholder="—"
                      onBlur={e => { if (e.target.value !== (r.guessed_name || '')) patchRow(r.email, { guessed_name: e.target.value }) }}
                      className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-1 py-0.5 w-36 text-[11px]" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input defaultValue={r.phone || ''} placeholder="—"
                      onBlur={e => { if (e.target.value !== (r.phone || '')) patchRow(r.email, { phone: e.target.value }) }}
                      className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-1 py-0.5 w-28 text-[11px]" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select value={r.status || 'new'} onChange={e => patchRow(r.email, { status: e.target.value })}
                      className={`bg-terminal-bg border rounded px-1 py-0.5 text-[10px] uppercase ${STATUS_STYLE[r.status || 'new'] || ''}`}>
                      {STATUSES.map(s => <option key={s} value={s} className="text-terminal-text bg-terminal-bg">{s}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input defaultValue={r.notes || ''} placeholder="—"
                      onBlur={e => { if (e.target.value !== (r.notes || '')) patchRow(r.email, { notes: e.target.value }) }}
                      className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-1 py-0.5 w-48 text-[11px]" />
                  </td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => removeRow(r.email)}
                      className="text-terminal-border hover:text-terminal-red transition-colors text-[10px]">remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
