import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fecApi, type ContactPreviewRow, type DonorMatch, type SavedContact } from '../api/fec'
import { TopBarPortal } from '../lib/topbar'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)

const CONF_STYLE: Record<string, string> = {
  high: 'text-terminal-green border-terminal-green',
  medium: 'text-yellow-400 border-yellow-600',
  low: 'text-orange-400 border-orange-600',
  none: 'text-terminal-muted border-terminal-border',
}

// Big pastes are matched in parallel chunks so they never hit the 180s proxy
// timeout, and so progress (and failures) are visible as it goes.
const CHUNK_SIZE = 100
const CONCURRENCY = 4

// Header keywords mirror the backend _HEADER_MAP so we detect a header row the
// same way it does, then prepend it to every chunk for consistent column mapping.
const HEADER_WORDS = new Set([
  'name', 'full name', 'donor', 'contact', 'first', 'first name', 'fname',
  'last', 'last name', 'lname', 'surname', 'phone', 'phone number', 'cell',
  'mobile', 'tel', 'email', 'e-mail', 'email address', 'address', 'street',
  'street address', 'addr', 'city', 'town', 'state', 'st', 'zip', 'zipcode',
  'zip code', 'postal', 'postal code', 'best time', 'best time to call', 'time',
  'notes', 'note', 'gender', 'sex', 'dob', 'date of birth', 'birthdate', 'birth date',
  'born', 'age', 'age range', 'marital', 'marital status', 'married',
])

const detectDelim = (sample: string) => {
  if (sample.includes('\t')) return '\t'
  const commas = sample.split(',').length - 1
  const semis = sample.split(';').length - 1
  return commas >= semis ? ',' : (semis ? ';' : ',')
}

const isHeaderLine = (line: string, delim: string) =>
  line.split(delim).map(c => c.trim().toLowerCase()).filter(c => HEADER_WORDS.has(c)).length >= 2

// One editable preview row in local state.
interface Editable extends ContactPreviewRow {
  include: boolean
  chosen: DonorMatch | null     // selected match (best or an alternate)
  phone: string
  email: string
  bestTime: string
  gender: string
  age: string
  marital: string
}

export default function ContactsPage() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Editable[] | null>(null)
  const [matching, setMatching] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; matched: number; failed: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedContact[]>([])

  const loadSaved = () => fecApi.listContacts().then(r => setSaved(r.contacts)).catch(() => {})
  useEffect(() => { loadSaved() }, [])

  const mapRow = (r: ContactPreviewRow): Editable => ({
    ...r,
    include: !!r.match,
    chosen: r.match,
    phone: r.parsed.phone,
    email: r.parsed.email,
    bestTime: r.parsed.best_time,
    gender: r.parsed.gender,
    age: r.parsed.age_range,
    marital: r.parsed.marital_status,
  })

  const runMatch = async () => {
    const lines = text.split(/\r?\n/)
    const delim = detectDelim(lines.slice(0, 10).join('\n'))
    let header: string | null = null
    let dataLines = lines.filter(l => l.trim().length)
    if (dataLines.length && isHeaderLine(dataLines[0], delim)) {
      header = dataLines[0]
      dataLines = dataLines.slice(1)
    }
    const total = dataLines.length
    if (!total) { setError('Nothing to match — paste some rows first.'); return }

    // Slice into fixed-size chunks; each carries the header so column mapping is
    // identical across chunks. done[] = matched-and-dropped, failed[] = kept for retry.
    const chunks = Array.from({ length: Math.ceil(total / CHUNK_SIZE) }, (_, i) =>
      dataLines.slice(i * CHUNK_SIZE, i * CHUNK_SIZE + CHUNK_SIZE))
    const results: (Editable[] | undefined)[] = new Array(chunks.length)
    const done: boolean[] = new Array(chunks.length).fill(false)
    const failed: boolean[] = new Array(chunks.length).fill(false)

    setMatching(true); setError(null); setSavedMsg(null); setRows([])
    setProgress({ done: 0, total, matched: 0, failed: 0 })

    const refresh = () => {
      const collected = results.flatMap(r => r || [])
      setRows(collected)
      // Drop matched chunks off the box; keep unprocessed + failed lines so the
      // user can watch it shrink and retry only what didn't land.
      const remaining = chunks.flatMap((c, i) => (done[i] ? [] : c))
      setText((header ? header + '\n' : '') + remaining.join('\n'))
      const processed = chunks.reduce((n, c, i) => n + (done[i] || failed[i] ? c.length : 0), 0)
      const failedLines = chunks.reduce((n, c, i) => n + (failed[i] ? c.length : 0), 0)
      setProgress({ done: processed, total, matched: collected.filter(r => r.match).length, failed: failedLines })
    }

    let next = 0
    const worker = async () => {
      for (let i = next++; i < chunks.length; i = next++) {
        const payload = (header ? header + '\n' : '') + chunks[i].join('\n')
        let ok = false
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          try {
            const res = await fecApi.matchContacts(payload)
            results[i] = res.rows.map(mapRow)
            ok = true
          } catch {
            if (attempt === 1) failed[i] = true
          }
        }
        if (ok) done[i] = true
        refresh()
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker))

    const failedLines = chunks.reduce((n, c, i) => n + (failed[i] ? c.length : 0), 0)
    if (!failedLines) setText('')
    else setError(`${failedLines} row${failedLines === 1 ? '' : 's'} didn’t process (server was busy). They’re left in the box — click “Match to donors” to retry just those.`)
    setMatching(false)
  }

  const update = (i: number, patch: Partial<Editable>) =>
    setRows(rs => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const saveAll = async () => {
    if (!rows) return
    const payload: SavedContact[] = rows
      .filter(r => r.include && r.chosen)
      .map(r => ({
        contributor_key: r.chosen!.contributor_key,
        display_name: r.parsed.name || r.chosen!.contributor_name,
        phone: r.phone || undefined,
        email: r.email || undefined,
        street: r.parsed.street || undefined,
        city: r.parsed.city || undefined,
        state: r.parsed.state || r.chosen!.contributor_state || undefined,
        zip: r.parsed.zip || undefined,
        best_time: r.bestTime || undefined,
        gender: r.gender || undefined,
        dob: r.parsed.dob || undefined,
        age_range: r.age || undefined,
        marital_status: r.marital || undefined,
      }))
    if (!payload.length) { setError('Nothing selected to save.'); return }
    setSaving(true); setError(null)
    try {
      const res = await fecApi.saveContacts(payload)
      setSavedMsg(`Saved ${res.saved} contact${res.saved === 1 ? '' : 's'}. They’ll auto-fill on call sheets.`)
      setRows(null); setText('')
      loadSaved()
    } catch {
      setError('Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const openProfile = (key: string, name?: string) => {
    const [kName, state] = key.split('|')
    const p = new URLSearchParams({ name: name || kName })
    if (state) p.set('state', state)
    navigate(`/donors/profile?${p}`)
  }

  const matchedCount = rows?.filter(r => r.include && r.chosen).length || 0

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBarPortal>
      <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-terminal-accent font-bold uppercase tracking-wider text-sm">Contacts Import</h1>
          <span className="text-terminal-muted text-xs">Paste rows of people → match to donor profiles → save. Saved contacts auto-fill on call sheets.</span>
        </div>
        <div className="text-terminal-border text-[11px] mb-2">
          Paste from a spreadsheet (tab-separated) or comma-separated. Columns are auto-detected by content (phone, email, city, state, ZIP, plus <b>gender</b>, <b>DOB/age</b>, and <b>marital status</b>). Include a header row for best results. Matching is most reliable with a <b>state</b> in the data.
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          readOnly={matching}
          placeholder={'Jane Smith\t123 Main St\tColumbia\tMO\t65201\t(573) 555-0100\tjane@email.com\nBob Jones\tKansas City\tMO\tbob@email.com'}
          className="w-full h-32 bg-terminal-bg border border-terminal-border text-terminal-text text-xs font-mono px-2 py-1.5 rounded outline-none focus:border-terminal-accent resize-y read-only:opacity-70"
        />
        <div className="text-terminal-border text-[11px] mt-1">
          Paste up to a few thousand rows at once — they’re matched in parallel chunks and drop out of the box as they finish.
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button onClick={runMatch} disabled={matching || !text.trim()} className="btn-primary disabled:opacity-40">
            {matching ? 'Matching…' : 'Match to donors'}
          </button>
          {rows && (
            <button onClick={saveAll} disabled={saving || !matchedCount}
              className="border border-terminal-green text-terminal-green hover:bg-terminal-green/10 px-3 py-1 text-xs uppercase tracking-wider rounded transition-colors disabled:opacity-40">
              {saving ? 'Saving…' : `Save ${matchedCount} contact${matchedCount === 1 ? '' : 's'}`}
            </button>
          )}
          {error && <span className="text-terminal-red text-xs">{error}</span>}
          {savedMsg && <span className="text-terminal-green text-xs">{savedMsg}</span>}
        </div>
        {progress && (
          <div className="mt-2">
            <div className="flex justify-between text-[11px] text-terminal-muted mb-0.5">
              <span>{matching ? 'Matching…' : 'Done'} {progress.done.toLocaleString()} / {progress.total.toLocaleString()} rows</span>
              <span>
                {progress.matched.toLocaleString()} matched
                {progress.failed ? <span className="text-terminal-red"> · {progress.failed.toLocaleString()} failed</span> : null}
              </span>
            </div>
            <div className="h-1.5 bg-terminal-bg border border-terminal-border rounded overflow-hidden">
              <div className="h-full bg-terminal-accent transition-all duration-300"
                style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
            </div>
          </div>
        )}
      </div>
      </TopBarPortal>

      {/* Preview */}
      {rows && (
        <div className="px-4 py-2">
          <div className="text-terminal-muted text-xs mb-1.5">
            {rows.length} rows · {rows.filter(r => r.match).length} matched · {rows.filter(r => !r.match).length} unmatched
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-terminal-muted text-[10px] uppercase tracking-wider border-b border-terminal-border">
                <th className="text-left py-1 w-6"></th>
                <th className="text-left py-1">Pasted</th>
                <th className="text-left py-1">Matched donor</th>
                <th className="text-left py-1">Phone</th>
                <th className="text-left py-1">Email</th>
                <th className="text-left py-1">Demographics</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-terminal-border/40 align-top">
                  <td className="py-1.5">
                    <input type="checkbox" checked={r.include} disabled={!r.chosen}
                      onChange={e => update(i, { include: e.target.checked })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="text-terminal-text">{r.parsed.name || <span className="text-terminal-border">— no name —</span>}</div>
                    <div className="text-terminal-border text-[10px]">
                      {[r.parsed.city, r.parsed.state, r.parsed.zip].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="py-1.5 pr-2">
                    {r.chosen ? (
                      <div>
                        <button onClick={() => openProfile(r.chosen!.contributor_key, r.chosen!.contributor_name)}
                          className="text-terminal-accent hover:underline text-left">
                          {r.chosen.contributor_name}
                        </button>
                        <span className={`ml-1.5 border rounded px-1 text-[9px] uppercase ${CONF_STYLE[r.confidence]}`}>{r.confidence}</span>
                        <div className="text-terminal-border text-[10px]">
                          {r.chosen.contributor_state} · {fmt(r.chosen.total_amount)} lifetime · {r.chosen.party || '—'}
                        </div>
                        {r.alternates.length > 0 && (
                          <select className="mt-0.5 bg-terminal-bg border border-terminal-border text-terminal-muted text-[10px] rounded px-1"
                            value={r.chosen.contributor_key}
                            onChange={e => {
                              const all = [r.match!, ...r.alternates]
                              const sel = all.find(a => a.contributor_key === e.target.value) || null
                              update(i, { chosen: sel })
                            }}>
                            {[r.match!, ...r.alternates].map(a => (
                              <option key={a.contributor_key} value={a.contributor_key}>
                                {a.contributor_name} ({a.contributor_state}, {fmt(a.total_amount)})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ) : (
                      <span className="text-terminal-border">no match{r.parsed.state ? '' : ' (add a state?)'}</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    <input value={r.phone} onChange={e => update(i, { phone: e.target.value })}
                      className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-1 py-0.5 w-28 text-[11px]" />
                  </td>
                  <td className="py-1.5">
                    <input value={r.email} onChange={e => update(i, { email: e.target.value })}
                      className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-1 py-0.5 w-40 text-[11px]" />
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1">
                      <select value={r.gender} onChange={e => update(i, { gender: e.target.value })}
                        className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-0.5 py-0.5 text-[11px]" title="Gender">
                        <option value="">—</option>
                        <option value="M">M</option>
                        <option value="F">F</option>
                      </select>
                      <input value={r.age} onChange={e => update(i, { age: e.target.value })} placeholder="age"
                        title={r.parsed.dob ? `DOB ${r.parsed.dob}` : 'Age or range'}
                        className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-1 py-0.5 w-12 text-[11px]" />
                      <input value={r.marital} onChange={e => update(i, { marital: e.target.value })} placeholder="status"
                        className="bg-terminal-bg border border-terminal-border text-terminal-text rounded px-1 py-0.5 w-20 text-[11px]" />
                    </div>
                    {r.parsed.dob && <div className="text-terminal-border text-[9px] mt-0.5">DOB {r.parsed.dob}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Saved contacts */}
      <div className="px-4 py-2 mt-1">
        <div className="text-terminal-muted text-xs uppercase tracking-wider mb-1.5 border-b border-terminal-border pb-1">
          Saved contacts ({saved.length})
        </div>
        {saved.length === 0 ? (
          <div className="text-terminal-border text-xs py-2">No saved contacts yet.</div>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {saved.map(s => (
                <tr key={s.contributor_key} className="border-b border-terminal-border/40">
                  <td className="py-1.5 pr-2">
                    <button onClick={() => openProfile(s.contributor_key, s.display_name)}
                      className="text-terminal-accent hover:underline">{s.display_name || s.contributor_key.split('|')[0]}</button>
                    <span className="text-terminal-border text-[10px] ml-1.5">{s.contributor_key.split('|')[1]}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-terminal-muted">{s.phone || '—'}</td>
                  <td className="py-1.5 pr-2 text-terminal-muted">{s.email || '—'}</td>
                  <td className="py-1.5 pr-2 text-terminal-border text-[10px]">
                    {[s.gender === 'M' ? 'Male' : s.gender === 'F' ? 'Female' : '',
                      s.dob ? `DOB ${s.dob}` : (s.age_range ? `Age ${s.age_range}` : ''),
                      s.marital_status].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="py-1.5 text-right">
                    <button onClick={async () => { await fecApi.deleteContact(s.contributor_key); loadSaved() }}
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
