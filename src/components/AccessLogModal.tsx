import { useState } from 'react'

interface LogEntry {
  ts: string
  ip: string
  method: string
  path: string
  status: number
  ua: string
  location: string
}

interface Props {
  onClose: () => void
}

export default function AccessLogModal({ onClose }: Props) {
  const [password, setPassword] = useState('')
  const [data, setData] = useState<{ count: number; entries: LogEntry[] } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchLog = async () => {
    if (!password) return
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`/api/admin/access-log?password=${encodeURIComponent(password)}&limit=500`)
      if (!r.ok) { setError('Access denied — incorrect code'); return }
      setData(await r.json())
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }

  const exportCsv = () => {
    if (!data) return
    const headers = ['Timestamp', 'IP', 'Location', 'Method', 'Path', 'Status', 'User Agent']
    const csvRows = data.entries.map(e =>
      [e.ts, e.ip, e.location, e.method, e.path, e.status, e.ua]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `access-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  // group by unique IP for summary
  const ipSummary = data
    ? Object.entries(
        data.entries.reduce((acc, e) => {
          if (!e.ip) return acc
          if (!acc[e.ip]) acc[e.ip] = { count: 0, location: e.location, last: e.ts }
          acc[e.ip].count++
          if (e.ts > acc[e.ip].last) { acc[e.ip].last = e.ts; acc[e.ip].location = e.location }
          return acc
        }, {} as Record<string, { count: number; location: string; last: string }>)
      ).sort(([, a], [, b]) => b.count - a.count)
    : []

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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-terminal-border flex-shrink-0">
          <div>
            <span className="text-terminal-accent text-sm font-bold tracking-widest uppercase">Access Log</span>
            {data && (
              <span className="ml-4 text-terminal-muted text-xs">
                {data.count} requests · {ipSummary.length} unique IPs
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <button onClick={exportCsv} className="btn-ghost text-xs py-1 px-3">
                Export CSV
              </button>
            )}
            <button
              onClick={onClose}
              className="text-terminal-muted hover:text-terminal-text transition-colors text-xl leading-none px-2"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Auth gate */}
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

        {/* Content */}
        {data && (
          <div className="flex-1 overflow-hidden flex gap-0 divide-x divide-terminal-border min-h-0">

            {/* IP summary sidebar */}
            <div className="w-72 flex-shrink-0 flex flex-col min-h-0">
              <div className="px-4 py-2 border-b border-terminal-border">
                <span className="text-terminal-muted text-xs uppercase tracking-wider">Unique Visitors</span>
              </div>
              <div className="flex-1 overflow-auto">
                {ipSummary.map(([ip, info]) => (
                  <div key={ip} className="px-4 py-2.5 border-b border-terminal-border hover:bg-white/[0.04] transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-terminal-accent font-mono text-xs">{ip}</span>
                      <span className="text-terminal-muted text-xs bg-terminal-bg px-1.5 py-0.5 rounded">
                        {info.count} req
                      </span>
                    </div>
                    {info.location && (
                      <div className="text-terminal-text text-xs mt-0.5 flex items-center gap-1">
                        <span className="opacity-60">📍</span>
                        {info.location}
                      </div>
                    )}
                    <div className="text-terminal-muted text-xs mt-0.5 opacity-60">
                      Last: {info.last.replace('T', ' ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Full log table */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-4 py-2 border-b border-terminal-border flex items-center gap-4">
                <span className="text-terminal-muted text-xs uppercase tracking-wider">Request Log</span>
                <span className="text-terminal-muted text-xs opacity-60">newest first</span>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-terminal-panel z-10">
                    <tr>
                      {['Time (UTC)', 'IP', 'Location', 'Path', 'Status', 'User Agent'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-terminal-muted font-normal uppercase tracking-wider border-b border-terminal-border whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((e, i) => (
                      <tr
                        key={i}
                        className={`border-t border-terminal-border transition-colors hover:bg-white/[0.08] ${i % 2 === 0 ? '' : 'bg-white/[0.04]'}`}
                      >
                        <td className="px-3 py-1.5 text-terminal-muted whitespace-nowrap font-mono">
                          {e.ts.replace('T', ' ')}
                        </td>
                        <td className="px-3 py-1.5 text-terminal-accent font-mono whitespace-nowrap">{e.ip || '—'}</td>
                        <td className="px-3 py-1.5 text-terminal-text whitespace-nowrap">{e.location || '—'}</td>
                        <td className="px-3 py-1.5 text-terminal-text max-w-[200px] truncate" title={e.path}>{e.path}</td>
                        <td className={`px-3 py-1.5 font-bold whitespace-nowrap ${e.status >= 500 ? 'text-red-400' : e.status >= 400 ? 'text-yellow-400' : 'text-terminal-green'}`}>
                          {e.status}
                        </td>
                        <td className="px-3 py-1.5 text-terminal-muted max-w-[180px] truncate" title={e.ua}>{e.ua || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
