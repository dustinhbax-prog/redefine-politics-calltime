import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import PartyBadge from '../components/PartyBadge'
import { TopBarPortal } from '../lib/topbar'

interface WatchlistEntry {
  contributor_key: string
  contributor_name: string
  contributor_state: string | null
  contributor_city: string | null
  party: string | null
  confidence: number
  tag: string
  notes: string | null
  created_at: string
  updated_at: string
}

interface SavedSearch {
  id: number
  name: string
  search_type: string
  params: string
  created_at: string
  last_run: string | null
  last_count: number | null
}

const TAG_CYCLE = ['PROSPECT', 'CONTACTED', 'WARM_LEAD', 'COMMITTED']

const TAG_STYLE: Record<string, string> = {
  PROSPECT:  'text-orange-400  border-orange-700',
  CONTACTED: 'text-blue-400   border-blue-700',
  WARM_LEAD: 'text-purple-400 border-purple-700',
  COMMITTED: 'text-terminal-green border-green-700',
}
const TAG_LABEL: Record<string, string> = {
  PROSPECT: 'PROSPECT', CONTACTED: 'CONTACTED', WARM_LEAD: 'WARM LEAD', COMMITTED: 'COMMITTED',
}

const SEARCH_TYPE_STYLE: Record<string, string> = {
  employer:   'text-orange-400 border-orange-700',
  occupation: 'text-blue-400  border-blue-700',
  name:       'text-purple-400 border-purple-700',
  general:    'text-terminal-muted border-terminal-border',
}

function TagBadge({ tag, onClick }: { tag: string; onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      className={`inline-block px-1.5 py-0.5 text-xs border rounded tracking-wider ${TAG_STYLE[tag] ?? TAG_STYLE.PROSPECT} ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
      title={onClick ? 'Click to cycle tag' : undefined}
    >
      {TAG_LABEL[tag] ?? tag}
    </span>
  )
}

export default function WatchlistPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'donors' | 'searches' | 'dashboard'>('donors')
  const [entries, setEntries] = useState<WatchlistEntry[]>([])
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [loading, setLoading] = useState(true)
  const [tagFilter, setTagFilter] = useState('ALL')
  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [runningSearch, setRunningSearch] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/watchlist/').then(r => r.json()).then(d => setEntries(d.results)),
      fetch('/api/watchlist/searches').then(r => r.json()).then(d => setSavedSearches(d.results)),
    ]).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const cycleTag = async (entry: WatchlistEntry) => {
    const idx = TAG_CYCLE.indexOf(entry.tag)
    const nextTag = TAG_CYCLE[(idx + 1) % TAG_CYCLE.length]
    await fetch('/api/watchlist/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: entry.contributor_name, state: entry.contributor_state, city: entry.contributor_city, tag: nextTag, notes: entry.notes }),
    })
    setEntries(prev => prev.map(e => e.contributor_key === entry.contributor_key ? { ...e, tag: nextTag } : e))
  }

  const saveNotes = async (entry: WatchlistEntry, notes: string) => {
    await fetch('/api/watchlist/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: entry.contributor_name, state: entry.contributor_state, city: entry.contributor_city, tag: entry.tag, notes }),
    })
    setEntries(prev => prev.map(e => e.contributor_key === entry.contributor_key ? { ...e, notes } : e))
    setEditingNotes(null)
  }

  const remove = async (entry: WatchlistEntry) => {
    await fetch(`/api/watchlist/?name=${encodeURIComponent(entry.contributor_name)}&state=${entry.contributor_state || ''}`, { method: 'DELETE' })
    setEntries(prev => prev.filter(e => e.contributor_key !== entry.contributor_key))
  }

  const openProfile = (entry: WatchlistEntry) => {
    const params = new URLSearchParams({ name: entry.contributor_name })
    if (entry.contributor_state) params.set('state', entry.contributor_state)
    if (entry.contributor_city) params.set('city', entry.contributor_city)
    navigate(`/donors/profile?${params}`)
  }

  const deleteSavedSearch = async (id: number) => {
    await fetch(`/api/watchlist/searches/${id}`, { method: 'DELETE' })
    setSavedSearches(prev => prev.filter(s => s.id !== id))
  }

  const runSavedSearch = async (search: SavedSearch) => {
    const params = (() => { try { return JSON.parse(search.params) } catch { return {} } })()
    const sp = new URLSearchParams()
    if (params.contributor_employer) sp.set('contributor_employer', params.contributor_employer)
    if (params.contributor_occupation) sp.set('contributor_occupation', params.contributor_occupation)
    if (params.contributor_name) sp.set('contributor_name', params.contributor_name)
    if (params.contributor_zip) { sp.set('contributor_zip', params.contributor_zip); if (params.radius_miles) sp.set('radius', params.radius_miles) }
    if (params.min_amount) sp.set('min_amount', params.min_amount)
    navigate(`/donors?${sp}`)
  }

  const runSavedSearchNow = async (id: number) => {
    setRunningSearch(id)
    try {
      const r = await fetch(`/api/watchlist/searches/${id}/run`, { method: 'POST' })
      const d = await r.json()
      setSavedSearches(prev => prev.map(s => s.id === id ? { ...s, last_run: new Date().toISOString(), last_count: d.count } : s))
    } finally {
      setRunningSearch(null)
    }
  }

  const exportCsv = () => {
    const headers = ['Name', 'State', 'City', 'Party', 'Tag', 'Notes', 'Added']
    const escape = (v: unknown) => { const s = v == null ? '' : String(v); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s }
    const rows = [headers.join(','), ...filtered.map(e => [e.contributor_name, e.contributor_state, e.contributor_city, e.party, TAG_LABEL[e.tag] ?? e.tag, e.notes, e.created_at?.slice(0, 10)].map(escape).join(','))]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `watchlist_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = tagFilter === 'ALL' ? entries : entries.filter(e => e.tag === tagFilter)

  const tagCounts = TAG_CYCLE.reduce((acc, t) => { acc[t] = entries.filter(e => e.tag === t).length; return acc }, {} as Record<string, number>)

  const parsedParams = (s: SavedSearch) => { try { return JSON.parse(s.params) } catch { return {} } }
  const paramsSummary = (s: SavedSearch) => {
    const p = parsedParams(s)
    return Object.entries(p).filter(([, v]) => v).map(([k, v]) => `${k.replace('contributor_', '')}: ${v}`).join(' · ') || '—'
  }

  return (
    <div className="flex flex-col h-full">
      <TopBarPortal>
      <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel">
        <div className="flex items-baseline gap-3 mb-3">
          <div className="text-terminal-accent text-xs font-bold tracking-widest">WATCHLIST</div>
          <div className="text-terminal-muted text-xs">{entries.length} tracked donors · {savedSearches.length} saved searches</div>
        </div>
        {/* Tabs */}
        <div className="flex gap-0 border border-terminal-border w-fit">
          {([['donors', 'DONORS'], ['searches', 'SAVED SEARCHES'], ['dashboard', 'DASHBOARD']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTab(val)}
              className={`px-3 py-3 md:py-1 text-xs uppercase tracking-wider transition-colors ${tab === val ? 'bg-terminal-accent text-terminal-bg font-bold' : 'text-terminal-muted hover:text-terminal-text'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      </TopBarPortal>

      {/* TAB: DONORS */}
      {tab === 'donors' && (
        <div className="flex flex-col flex-1 overflow-hidden min-h-0">
          <div className="px-4 py-2 border-b border-terminal-border bg-terminal-panel flex gap-2 items-center flex-wrap flex-shrink-0">
            {['ALL', ...TAG_CYCLE].map(t => (
              <button
                key={t}
                onClick={() => setTagFilter(t)}
                className={`text-xs px-2 py-0.5 border tracking-wider transition-colors ${tagFilter === t ? 'border-terminal-accent text-terminal-accent' : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'}`}
              >
                {t === 'ALL' ? 'ALL' : TAG_LABEL[t]}
                {t !== 'ALL' && <span className="ml-1 text-terminal-muted">{tagCounts[t] ?? 0}</span>}
              </button>
            ))}
            {filtered.length > 0 && (
              <button onClick={exportCsv} className="ml-auto border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent px-2 py-0.5 text-xs uppercase tracking-wider transition-colors">
                ↓ Export CSV
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {loading && <div className="px-4 py-8 text-terminal-accent text-xs animate-pulse">LOADING…</div>}
            {!loading && filtered.length === 0 && (
              <div className="px-4 py-8 text-terminal-muted text-xs text-center">
                {entries.length === 0 ? 'No donors watchlisted yet — click ☆ on any donor row to add them' : 'No donors with this tag'}
              </div>
            )}
            {!loading && filtered.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                {filtered.map(entry => (
                  <div key={entry.contributor_key} className="border border-terminal-border bg-terminal-panel hover:border-terminal-accent transition-colors flex flex-col">
                    <div className="px-3 py-2 border-b border-terminal-border flex items-center justify-between gap-2">
                      <button onClick={() => openProfile(entry)} className="text-terminal-accent hover:underline text-left text-xs font-bold flex-1 truncate">
                        {entry.contributor_name}
                      </button>
                      <button onClick={() => remove(entry)} className="text-terminal-muted hover:text-red-400 text-xs transition-colors flex-shrink-0" title="Remove">✕</button>
                    </div>
                    <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
                      <PartyBadge party={entry.party as any} confidence={entry.confidence || undefined} />
                      <TagBadge tag={entry.tag} onClick={() => cycleTag(entry)} />
                    </div>
                    <div className="px-3 pb-2 text-terminal-muted text-xs">
                      {[entry.contributor_city, entry.contributor_state].filter(Boolean).join(', ') || '—'}
                    </div>
                    <div className="px-3 pb-2 flex-1">
                      {editingNotes === entry.contributor_key ? (
                        <div className="flex gap-1">
                          <input
                            autoFocus
                            className="input-field flex-1 text-xs py-0.5"
                            value={noteDraft}
                            onChange={e => setNoteDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveNotes(entry, noteDraft); if (e.key === 'Escape') setEditingNotes(null) }}
                          />
                          <button onClick={() => saveNotes(entry, noteDraft)} className="text-terminal-accent text-xs px-1">✓</button>
                          <button onClick={() => setEditingNotes(null)} className="text-terminal-muted text-xs px-1">✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingNotes(entry.contributor_key); setNoteDraft(entry.notes || '') }}
                          className="text-left text-terminal-muted hover:text-terminal-text w-full text-xs truncate"
                          title={entry.notes || 'Click to add notes'}
                        >
                          {entry.notes || <span className="opacity-40">add notes…</span>}
                        </button>
                      )}
                    </div>
                    <div className="px-3 py-1.5 border-t border-terminal-border text-terminal-muted text-xs">
                      Added {entry.created_at?.slice(0, 10)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: SAVED SEARCHES */}
      {tab === 'searches' && (
        <div className="flex-1 overflow-auto p-4">
          <div className="text-terminal-muted text-xs mb-4">
            Save searches from the Donors page using the ☆ SAVE button — you can re-run them here anytime.
          </div>
          {loading && <div className="text-terminal-accent text-xs animate-pulse">LOADING…</div>}
          {!loading && savedSearches.length === 0 && (
            <div className="text-terminal-muted text-xs text-center py-8">No saved searches yet. Go to Donors page and use the ☆ SAVE button after filling in search filters.</div>
          )}
          {!loading && savedSearches.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {savedSearches.map(s => {
                const p = parsedParams(s)
                return (
                  <div key={s.id} className="border border-terminal-border bg-terminal-panel hover:border-terminal-accent transition-colors flex flex-col">
                    <div className="px-3 py-2 border-b border-terminal-border flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-base">🔍</span>
                        <span className="text-terminal-accent text-xs font-bold truncate">{s.name}</span>
                      </div>
                      <button onClick={() => deleteSavedSearch(s.id)} className="text-terminal-muted hover:text-red-400 text-xs transition-colors flex-shrink-0" title="Delete">✕</button>
                    </div>
                    <div className="px-3 py-2">
                      <span className={`inline-block px-1.5 py-0.5 text-xs border rounded tracking-wider uppercase ${SEARCH_TYPE_STYLE[s.search_type] ?? SEARCH_TYPE_STYLE.general}`}>
                        {s.search_type}
                      </span>
                    </div>
                    <div className="px-3 pb-2 text-terminal-muted text-xs leading-relaxed flex-1">
                      {Object.entries(p).filter(([, v]) => v).map(([k, v]) => (
                        <span key={k} className="inline-block mr-1 mb-1 px-1 border border-terminal-border text-xs">
                          <span className="text-terminal-muted">{k.replace('contributor_', '')}:</span> {String(v)}
                        </span>
                      ))}
                    </div>
                    {s.last_run && (
                      <div className="px-3 pb-2 text-terminal-muted text-xs">
                        Last run: {s.last_run.slice(0, 10)} · {s.last_count ?? 0} results
                      </div>
                    )}
                    <div className="px-3 py-2 border-t border-terminal-border flex gap-2">
                      <button
                        onClick={() => runSavedSearch(s)}
                        className="flex-1 text-xs uppercase tracking-wider py-1 border border-terminal-accent text-terminal-accent hover:bg-terminal-accent hover:text-terminal-bg transition-colors"
                      >
                        RUN NOW
                      </button>
                      <button
                        onClick={() => runSavedSearchNow(s.id)}
                        disabled={runningSearch === s.id}
                        className="text-xs px-2 py-1 border border-terminal-border text-terminal-muted hover:border-terminal-muted transition-colors"
                        title="Quick-run and update count"
                      >
                        {runningSearch === s.id ? '…' : '↻'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: DASHBOARD */}
      {tab === 'dashboard' && (
        <div className="flex-1 overflow-auto p-4">
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="border border-terminal-border bg-terminal-panel px-4 py-3">
              <div className="text-terminal-muted text-xs uppercase tracking-wider mb-1">Total Watched</div>
              <div className="text-terminal-accent text-2xl font-bold">{entries.length}</div>
            </div>
            {TAG_CYCLE.map(t => (
              <div key={t} className="border border-terminal-border bg-terminal-panel px-4 py-3">
                <div className="text-terminal-muted text-xs uppercase tracking-wider mb-1">{TAG_LABEL[t]}</div>
                <div className="text-terminal-text text-2xl font-bold">{tagCounts[t] ?? 0}</div>
              </div>
            ))}
            <div className="border border-terminal-border bg-terminal-panel px-4 py-3">
              <div className="text-terminal-muted text-xs uppercase tracking-wider mb-1">Saved Searches</div>
              <div className="text-terminal-green text-2xl font-bold">{savedSearches.length}</div>
            </div>
          </div>

          {/* Recent additions */}
          <div className="mb-6">
            <div className="text-terminal-accent text-xs font-bold tracking-widest mb-3 uppercase">Recent Additions</div>
            {entries.length === 0 ? (
              <div className="text-terminal-muted text-xs">No donors tracked yet.</div>
            ) : (
              <div className="border border-terminal-border">
                {[...entries].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5).map((entry, i) => (
                  <div key={entry.contributor_key} className={`px-3 py-2 flex items-center gap-3 ${i > 0 ? 'border-t border-terminal-border' : ''}`}>
                    <button onClick={() => openProfile(entry)} className="text-terminal-accent hover:underline text-xs font-bold flex-1 text-left truncate">
                      {entry.contributor_name}
                    </button>
                    <PartyBadge party={entry.party as any} />
                    <TagBadge tag={entry.tag} />
                    <span className="text-terminal-muted text-xs flex-shrink-0">{entry.created_at?.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Saved search quick panel */}
          {savedSearches.length > 0 && (
            <div>
              <div className="text-terminal-accent text-xs font-bold tracking-widest mb-3 uppercase">Quick-Run Searches</div>
              <div className="space-y-1">
                {savedSearches.slice(0, 5).map(s => (
                  <div key={s.id} className="border border-terminal-border px-3 py-2 flex items-center gap-3 hover:border-terminal-accent transition-colors">
                    <span className="text-sm">🔍</span>
                    <span className="text-terminal-text text-xs flex-1 truncate">{s.name}</span>
                    <span className="text-terminal-muted text-xs">{paramsSummary(s)}</span>
                    {s.last_count != null && <span className="text-terminal-green text-xs">{s.last_count} results</span>}
                    <button
                      onClick={() => runSavedSearch(s)}
                      className="text-xs px-2 py-0.5 border border-terminal-accent text-terminal-accent hover:bg-terminal-accent hover:text-terminal-bg transition-colors uppercase tracking-wider"
                    >
                      RUN
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
