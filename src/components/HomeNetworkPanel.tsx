import { useEffect, useState } from 'react'
import { fecApi, NetworkStats, TaggingHealth, SystemJob } from '../api/fec'

const STATUS_DOT: Record<string, string> = {
  ok: 'bg-terminal-green',
  error: 'bg-terminal-red',
  ran: 'bg-terminal-blue',
  unknown: 'bg-terminal-muted',
}

function fmtWhen(s: string | null): string {
  if (!s) return 'never'
  // both ISO ("2026-05-31T04:20:24") and systemd ("Sun 2026-05-31 04:20:24 UTC")
  const m = s.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/)
  return m ? `${m[1]} ${m[2]}` : s
}

export default function HomeNetworkPanel() {
  const [stats, setStats] = useState<NetworkStats | null>(null)
  const [tag, setTag] = useState<TaggingHealth | null>(null)
  const [jobs, setJobs] = useState<SystemJob[]>([])
  const [openLog, setOpenLog] = useState<string | null>(null)
  const [logLines, setLogLines] = useState<Record<string, string[]>>({})
  const [logLoading, setLogLoading] = useState<string | null>(null)
  const [adminPw, setAdminPw] = useState<string>(() => sessionStorage.getItem('rp_admin_pw') || '')
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState(false)

  useEffect(() => {
    const load = () => {
      fecApi.networkStats().then(setStats).catch(() => {})
      fecApi.taggingHealth().then(setTag).catch(() => {})
      fecApi.systemJobs().then(d => setJobs(d.jobs)).catch(() => {})
    }
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [])

  const fetchLog = async (key: string, pw: string) => {
    setLogLoading(key)
    try {
      const d = await fecApi.systemJobLog(key, pw)
      setLogLines(p => ({ ...p, [key]: d.lines }))
      setPwError(false)
    } catch {
      // most likely a 403 — clear the stored password and re-prompt
      setLogLines(p => { const n = { ...p }; delete n[key]; return n })
      setAdminPw(''); sessionStorage.removeItem('rp_admin_pw'); setPwError(true)
    }
    setLogLoading(null)
  }

  const toggleLog = (key: string) => {
    if (openLog === key) { setOpenLog(null); return }
    setOpenLog(key)
    if (!logLines[key] && adminPw) fetchLog(key, adminPw)
  }

  const submitPw = (key: string) => {
    const pw = pwInput.trim()
    if (!pw) return
    setAdminPw(pw); sessionStorage.setItem('rp_admin_pw', pw); setPwInput('')
    fetchLog(key, pw)
  }

  const dem = stats?.committees.by_party?.['DEM'] ?? 0
  const rep = stats?.committees.by_party?.['REP'] ?? 0
  const unk = stats?.committees.by_party?.['UNKNOWN'] ?? 0
  const totalC = stats?.committees.total ?? 0
  const totalD = stats?.donors.total ?? 0
  const donorDem = stats?.donors.by_party?.['DEM'] ?? 0
  const donorRep = stats?.donors.by_party?.['REP'] ?? 0

  return (
    <div className="border border-terminal-border bg-terminal-panel">
      <div className="px-3 py-2 border-b border-terminal-border flex items-center gap-2">
        <span className="text-base leading-none">🗄</span>
        <span className="text-terminal-accent text-sm font-bold uppercase tracking-wider flex-1">Network Database</span>
        {stats?.running && <span className="text-terminal-accent animate-pulse text-[9px] uppercase">● crawling</span>}
      </div>

      {/* Stats */}
      <div className="p-3 space-y-3 border-b border-terminal-border">
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-terminal-border bg-terminal-bg/40 px-2 py-1.5">
            <div className="stat-num" style={{ fontSize: '1.15rem' }}>{totalC.toLocaleString()}</div>
            <div className="text-terminal-muted text-[9px] uppercase tracking-wider">PACs known</div>
          </div>
          <div className="border border-terminal-border bg-terminal-bg/40 px-2 py-1.5">
            <div className="stat-num" style={{ fontSize: '1.15rem' }}>{totalD.toLocaleString()}</div>
            <div className="text-terminal-muted text-[9px] uppercase tracking-wider">Donors profiled</div>
          </div>
        </div>

        {totalC > 0 && (
          <div>
            <div className="text-terminal-muted text-[9px] uppercase tracking-wider mb-1">PAC party split</div>
            <div className="flex h-2 rounded overflow-hidden bg-terminal-border">
              {dem > 0 && <div className="bg-blue-500" style={{ flex: dem }} />}
              {rep > 0 && <div className="bg-red-500" style={{ flex: rep }} />}
              {unk > 0 && <div className="bg-terminal-muted" style={{ flex: unk }} />}
            </div>
            <div className="flex justify-between text-[9px] mt-1 font-bold">
              <span className="text-blue-400">{dem.toLocaleString()} DEM</span>
              <span className="text-red-400">{rep.toLocaleString()} REP</span>
              <span className="text-terminal-muted">{unk.toLocaleString()} UNK</span>
            </div>
          </div>
        )}

        {totalD > 0 && (
          <div>
            <div className="text-terminal-muted text-[9px] uppercase tracking-wider mb-1">Donor lean</div>
            <div className="flex h-2 rounded overflow-hidden bg-terminal-border">
              <div className="bg-blue-500" style={{ flex: donorDem }} />
              <div className="bg-red-500" style={{ flex: donorRep }} />
            </div>
          </div>
        )}

        {tag && (
          <div>
            <div className="flex justify-between items-center text-[9px] uppercase tracking-wider mb-1">
              <span className="text-terminal-muted">Issue tags · {tag.coverage_pct}%</span>
              <span className={tag.status === 'stalled' ? 'text-terminal-red font-bold' : tag.status === 'done' || tag.status === 'healthy' ? 'text-terminal-green' : 'text-terminal-muted'}>
                {tag.running ? 'tagging…' : tag.status === 'done' ? 'fully tagged' : tag.status === 'stalled' ? '⚠ stalled' : tag.status}
              </span>
            </div>
            <div className="h-2 rounded overflow-hidden bg-terminal-border">
              <div className="bg-terminal-accent h-full" style={{ width: `${Math.min(100, tag.coverage_pct)}%` }} />
            </div>
            <div className="text-terminal-muted text-[9px] mt-1">{tag.tagged.toLocaleString()}/{tag.total.toLocaleString()} committees tagged</div>
          </div>
        )}
      </div>

      {/* Nightly jobs */}
      <div className="px-3 py-2">
        <div className="text-terminal-muted text-[10px] uppercase tracking-wider mb-2">Nightly &amp; scheduled tasks</div>
        <div className="space-y-1">
          {jobs.map(j => (
            <div key={j.key} className="border border-terminal-border">
              <button
                onClick={() => toggleLog(j.key)}
                title={j.desc}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-terminal-bg/40 transition-colors text-left"
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[j.status] ?? STATUS_DOT.unknown}`} />
                <span className="flex-1 min-w-0">
                  <span className="text-terminal-text text-xs block truncate">{j.label}</span>
                  <span className="text-terminal-muted text-[9px]">{j.schedule} · {fmtWhen(j.last_run)}</span>
                </span>
                {j.status === 'error' && <span className="text-terminal-red text-[9px] uppercase font-bold flex-shrink-0">fail</span>}
                <span className="text-terminal-muted text-[9px] uppercase flex-shrink-0">{openLog === j.key ? 'hide' : 'logs'}</span>
              </button>
              {openLog === j.key && (
                <div className="border-t border-terminal-border bg-terminal-bg p-2">
                  {!adminPw ? (
                    <div className="space-y-1">
                      <div className="text-terminal-muted text-[10px]">Admin password required to view logs.</div>
                      <div className="flex gap-1">
                        <input
                          type="password"
                          value={pwInput}
                          onChange={e => setPwInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') submitPw(j.key) }}
                          placeholder="password"
                          autoFocus
                          className="flex-1 bg-terminal-panel border border-terminal-border text-terminal-text px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-terminal-accent"
                        />
                        <button onClick={() => submitPw(j.key)} className="border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors">View</button>
                      </div>
                      {pwError && <div className="text-terminal-red text-[10px]">Wrong password.</div>}
                    </div>
                  ) : logLoading === j.key ? (
                    <div className="text-terminal-muted text-[10px]">loading…</div>
                  ) : (
                    <pre className="text-[9px] leading-snug text-terminal-text whitespace-pre-wrap break-words max-h-48 overflow-auto">{(logLines[j.key] || []).join('\n') || '(no log output)'}</pre>
                  )}
                </div>
              )}
            </div>
          ))}
          {jobs.length === 0 && <div className="text-terminal-muted text-[10px]">loading tasks…</div>}
        </div>
      </div>
    </div>
  )
}
