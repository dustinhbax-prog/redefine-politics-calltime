import { useState } from 'react'

interface SearchLogEntry {
  id: number
  ts: string
  ip: string
  filters: string
  result_count: number
}

interface Props {
  onClose: () => void
}

export default function SearchLogModal({ onClose }: Props) {
  const [password, setPassword] = useState('')
  const [data, setData] = useState<{ count: number; entries: SearchLogEntry[] } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchLog = async () => {
    if (!password) return
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`/api/admin/search-log?password=${encodeURIComponent(password)}&limit=500`)
      if (!r.ok) { setError('Access denied — incorrect code'); return }
      setData(await r.json())
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }

  const parseFilters = (filtersStr: string): Record<string, string> => {
    try { return JSON.parse(filtersStr) } catch { return {} }
  }

  const exportCsv = () => {
    if (!data) return
    const headers = ['ID', 'Timestamp', 'IP', 'Filters', 'Results']
    const csvRows = data.entries.map(e =>
      [e.id, e.ts, e.ip, e.filters, e.result_count]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `search-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="bg-terminal-panel border border-terminal-border flex flex-col shadow-2xl"
        style={{ width: '90vw', maxWidth: 1100, height: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-terminal-border flex-shrink-0">
          <div>
            <span className="text-terminal-accent text-sm font-bold tracking-widest uppercase">Search Log</span>
            {data && (
              <span className="ml-4 text-terminal-muted text-xs">{data.count} searches logged</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <button onClick={exportCsv} className="btn-ghost text-xs py-1 px-3">Export CSV</button>
            )}
            <button onClick={onClose} className="text-terminal-muted hover:text-terminal-text transition-colors text-xl leading-none px-2">✕</button>
          </div>
        </div>

        {!data && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="text-terminal-muted text-xs uppercase tracking-widest mb-2">Enter Access Code</div>
            <div className="flex gap-2">
              <input
                type="password"
                className="input-field w-56 text-center tracking-widest"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchLog()}
                autoFocus
              />
              <button onClick={fetchLog} disabled={loading} className="btn-primary px-5">
                {loading ? 'LOADING…' : 'UNLOCK'}
              </button>
            </div>
            {error && <div className="text-red-400 text-xs">{error}</div>}
          </div>
        )}

        {data && (
          <div className="flex-1 overflow-auto min-h-0">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-terminal-panel z-10">
                <tr>
                  {['Time (UTC)', 'IP', 'Filters', 'Results'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-terminal-muted font-normal uppercase tracking-wider border-b border-terminal-border whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e, i) => {
                  const filters = parseFilters(e.filters)
                  return (
                    <tr key={e.id} className={`border-t border-terminal-border hover:bg-white/[0.08] ${i % 2 === 0 ? '' : 'bg-white/[0.04]'}`}>
                      <td className="px-3 py-1.5 text-terminal-muted whitespace-nowrap font-mono">{e.ts.replace('T', ' ')}</td>
                      <td className="px-3 py-1.5 text-terminal-accent font-mono whitespace-nowrap">{e.ip || '—'}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(filters).map(([k, v]) => (
                            <span key={k} className="px-1.5 py-0.5 border border-terminal-border text-terminal-text rounded text-xs">
                              <span className="text-terminal-muted">{k}:</span> {v}
                            </span>
                          ))}
                          {Object.keys(filters).length === 0 && <span className="text-terminal-muted">{e.filters || '—'}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-terminal-green font-bold">{e.result_count ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
