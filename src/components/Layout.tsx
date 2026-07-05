import { NavLink, Link, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState, Suspense } from 'react'
import { fecApi, NetworkStats, TaggingHealth } from '../api/fec'
import SettingsPanel from './SettingsPanel'
import AccessLogModal from './AccessLogModal'
import SearchLogModal from './SearchLogModal'
import ExportLogModal from './ExportLogModal'
import { useMorph } from './MorphOverlay'
import { NAV_SECTIONS, NAV_TOOLS_FLAT } from '../lib/navSections'
import { TopBarSlotContext } from '../lib/topbar'
import Tooltip from './Tooltip'

export default function Layout() {
  const [stats, setStats] = useState<NetworkStats | null>(null)
  const [tagHealth, setTagHealth] = useState<TaggingHealth | null>(null)
  const [crawling, setCrawling] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showLog, setShowLog] = useState<'ip' | 'search' | 'export' | false>(false)
  const morph = useMorph()

  // Accordion nav: which section contains the current route, and which are expanded.
  const location = useLocation()
  const activeSection = NAV_SECTIONS.find(s => s.tools.some(t => t.to === location.pathname))?.heading
  // Single-open accordion: at most ONE section open at a time. Navigating into a
  // tool auto-opens its section (closing any other); manual toggle overrides until
  // the next navigation.
  const [openSection, setOpenSection] = useState<string | null>(activeSection ?? null)
  useEffect(() => {
    if (activeSection) setOpenSection(activeSection)
  }, [activeSection])
  const toggleSection = (h: string) => setOpenSection(prev => (prev === h ? null : h))

  // Collapse the sidebar to an icon-only rail (persisted across sessions).
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('rp_nav_collapsed') === '1')
  const setCollapsedPersist = (v: boolean) => { localStorage.setItem('rp_nav_collapsed', v ? '1' : '0'); setCollapsed(v) }

  // DOM node for the top-bar portal slot (pages render their toolbar into it).
  const [topbarSlot, setTopbarSlot] = useState<HTMLDivElement | null>(null)

  const loadStats = () => {
    fecApi.networkStats().then(setStats).catch(() => {})
    fecApi.taggingHealth().then(setTagHealth).catch(() => {})
  }

  useEffect(() => {
    loadStats()
    const id = setInterval(loadStats, 15000)
    return () => clearInterval(id)
  }, [])

  const startCrawl = async () => {
    setCrawling(true)
    await fecApi.startCrawl(50)
    loadStats()
    setCrawling(false)
  }

  const dem = stats?.committees.by_party?.['DEM'] ?? 0
  const rep = stats?.committees.by_party?.['REP'] ?? 0
  const unk = stats?.committees.by_party?.['UNKNOWN'] ?? 0
  const totalC = stats?.committees.total ?? 0
  const totalD = stats?.donors.total ?? 0
  const donorDem = stats?.donors.by_party?.['DEM'] ?? 0
  const donorRep = stats?.donors.by_party?.['REP'] ?? 0

  return (
    <TopBarSlotContext.Provider value={topbarSlot}>
    <div className="flex flex-col h-full">
      {/* Unified top bar — fixed full-size logo (never shrinks) on the left, and a
          portal slot on the right where each page renders its own title/controls.
          The collapsible rail lives BELOW this, so collapsing never touches the logo. */}
      <header className="flex items-stretch flex-shrink-0 bg-terminal-panel border-b border-terminal-border">
        <div className="hidden md:flex w-56 flex-shrink-0 items-center px-3 py-2 border-r border-terminal-border">
          <Tooltip
            placement="bottom"
            widthClass="w-56 text-left"
            content={<><div className="font-bold text-terminal-accent mb-1 uppercase tracking-wider">Home</div>Return to the platform overview — what ReDEFINE POLITICS does, with quick links into every tool.</>}
          >
            <Link
              to="/"
              className="block w-full"
              onClick={(e) => {
                // From any other page, morph the logo back into the homepage
                // instead of a plain navigation.
                if (location.pathname !== '/') { e.preventDefault(); morph.returnHome() }
              }}
            >
              <img ref={morph.setLogoEl} src="/logo.png" alt="ReDEFINE POLITICS" className="w-full h-auto hover:opacity-80 transition-opacity" />
            </Link>
          </Tooltip>
        </div>
        {/* Page title/controls portal into here */}
        <div ref={setTopbarSlot} className="flex-1 min-w-0" />
      </header>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Sidebar rail — desktop only (logo now lives in the top bar above) */}
        <aside className={`hidden md:flex ${collapsed ? 'w-14' : 'w-56'} flex-shrink-0 bg-terminal-panel border-r border-terminal-border flex-col transition-[width] duration-200`}>
        <nav aria-label="Tools" className="flex-1 pt-2 overflow-y-auto">
          {/* Section accordions — mirror the homepage cards */}
          {NAV_SECTIONS.map(section => {
            const open = openSection === section.heading
            const isActiveSection = section.heading === activeSection
            return (
              <div key={section.heading} className="mt-1">
                <Tooltip
                  placement="right"
                  widthClass="w-60 text-left"
                  content={<><div className="font-bold text-terminal-accent mb-1 uppercase tracking-wider">{section.heading}</div>{section.caption}</>}
                >
                  <button
                    onClick={() => toggleSection(section.heading)}
                    className={`w-full flex items-center transition-colors border-l-2 ${collapsed ? 'justify-center py-2.5' : 'gap-2 px-3 py-2.5'} ${
                      open || isActiveSection
                        ? 'text-terminal-accent border-terminal-accent bg-terminal-bg/60'
                        : 'text-terminal-text hover:text-terminal-accent border-transparent hover:bg-terminal-bg/40'
                    }`}
                    aria-expanded={open}
                  >
                    <span className={`leading-none flex-shrink-0 ${collapsed ? 'text-2xl' : 'text-base'}`}>{section.glyph}</span>
                    {!collapsed && (
                      <>
                        <span className="font-display flex-1 text-left text-xs font-bold leading-tight whitespace-nowrap">{section.heading}</span>
                        <span className={`text-[10px] flex-shrink-0 transition-transform ${open ? 'rotate-90 text-terminal-accent' : 'text-terminal-muted'}`}>▸</span>
                      </>
                    )}
                  </button>
                </Tooltip>
                {open && (
                  <div className="pb-1">
                    {section.tools.map(tool => {
                      const body = tool.dev ? (
                        <div className={`flex items-center text-xs text-terminal-muted opacity-60 cursor-default ${collapsed ? 'justify-center py-1.5' : 'gap-2 pl-8 pr-3 py-1.5'}`}>
                          <span className={`flex-shrink-0 ${collapsed ? 'text-xl' : ''}`}>{tool.glyph}</span>
                          {!collapsed && (
                            <>
                              <span className="flex-1 truncate">{tool.label}</span>
                              <span className="text-[8px] uppercase tracking-wider border border-terminal-border px-1 flex-shrink-0">dev</span>
                            </>
                          )}
                        </div>
                      ) : (
                        <NavLink
                          to={tool.to!}
                          className={({ isActive }) =>
                            `flex items-center text-xs tracking-wider transition-colors border-l-2 ${collapsed ? 'justify-center py-2' : 'gap-2 pl-8 pr-3 py-1.5'} ${
                              isActive
                                ? 'text-terminal-accent border-terminal-accent bg-terminal-bg'
                                : 'text-terminal-muted hover:text-terminal-text border-transparent'
                            }`
                          }
                        >
                          <span className={`flex-shrink-0 ${collapsed ? 'text-xl' : ''}`}>{tool.glyph}</span>
                          {!collapsed && <span className="flex-1 truncate">{tool.label}</span>}
                        </NavLink>
                      )
                      return (
                        <Tooltip
                          key={tool.to ?? tool.label}
                          placement="right"
                          widthClass="w-60 text-left"
                          content={<><div className="font-bold text-terminal-accent mb-1 uppercase tracking-wider">{tool.label}{tool.dev ? ' · in development' : ''}</div>{tool.desc}</>}
                        >
                          {body}
                        </Tooltip>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Network Database — collapsible status panel (folded into the accordion) */}
          {(() => {
            const netOpen = openSection === 'Network Database'
            return (
              <div className="mt-1 border-t border-terminal-border pt-1">
                <Tooltip
                  placement="right"
                  widthClass="w-64 text-left"
                  content={<><div className="font-bold text-terminal-accent mb-1 uppercase tracking-wider">Network Database</div>Tracks PACs and donor party affiliations discovered during searches — the more you search, the smarter it gets, improving party-lean accuracy across all results. Open it for coverage stats, and hit Expand Network to proactively crawl more committees.</>}
                >
                  <button
                    onClick={() => {
                      if (collapsed) { setCollapsedPersist(false); setOpenSection('Network Database') }
                      else { toggleSection('Network Database') }
                    }}
                    className={`w-full flex items-center transition-colors border-l-2 ${collapsed ? 'justify-center py-2.5' : 'gap-2 px-3 py-2.5'} ${
                      netOpen
                        ? 'text-terminal-accent border-terminal-accent bg-terminal-bg/60'
                        : 'text-terminal-text hover:text-terminal-accent border-transparent hover:bg-terminal-bg/40'
                    }`}
                    aria-expanded={netOpen}
                  >
                    <span className={`leading-none flex-shrink-0 relative ${collapsed ? 'text-2xl' : 'text-base'}`}>
                      🗄
                      {collapsed && stats?.running && <span className="absolute -top-1 -right-1 text-terminal-accent animate-pulse text-[8px] leading-none">●</span>}
                    </span>
                    {!collapsed && (
                      <>
                        <span className="font-display flex-1 text-left text-xs font-bold leading-tight whitespace-nowrap flex items-center gap-1.5">
                          Network DB
                          {stats?.running && <span className="text-terminal-accent animate-pulse text-[8px] leading-none">●</span>}
                        </span>
                        <span className={`text-[10px] flex-shrink-0 transition-transform ${netOpen ? 'rotate-90 text-terminal-accent' : 'text-terminal-muted'}`}>▸</span>
                      </>
                    )}
                  </button>
                </Tooltip>
                {netOpen && !collapsed && (
                  <div className="px-3 pb-3 pt-2 space-y-3">
                    {/* Headline counts */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="border border-terminal-border bg-terminal-bg/40 px-2 py-1.5">
                        <div className="stat-num" style={{ fontSize: '1.05rem' }}>{totalC.toLocaleString()}</div>
                        <div className="text-terminal-muted text-[9px] uppercase tracking-wider">PACs known</div>
                      </div>
                      <div className="border border-terminal-border bg-terminal-bg/40 px-2 py-1.5">
                        <div className="stat-num" style={{ fontSize: '1.05rem' }}>{totalD.toLocaleString()}</div>
                        <div className="text-terminal-muted text-[9px] uppercase tracking-wider">Donors</div>
                      </div>
                    </div>

                    {/* PAC party split */}
                    {totalC > 0 && (
                      <div>
                        <div className="text-terminal-muted text-[9px] uppercase tracking-wider mb-1">PAC party split</div>
                        <div className="flex h-2 rounded overflow-hidden bg-terminal-border">
                          {dem > 0 && <div className="bg-blue-500" style={{ flex: dem }} title={`DEM ${dem}`} />}
                          {rep > 0 && <div className="bg-red-500" style={{ flex: rep }} title={`REP ${rep}`} />}
                          {unk > 0 && <div className="bg-terminal-muted" style={{ flex: unk }} title={`Unknown ${unk}`} />}
                        </div>
                        <div className="flex justify-between text-[9px] mt-1 font-bold">
                          <span className="text-blue-400">{dem.toLocaleString()} DEM</span>
                          <span className="text-red-400">{rep.toLocaleString()} REP</span>
                          <span className="text-terminal-muted">{unk.toLocaleString()} UNK</span>
                        </div>
                      </div>
                    )}

                    {/* Donor lean */}
                    {totalD > 0 && (
                      <div>
                        <div className="text-terminal-muted text-[9px] uppercase tracking-wider mb-1">Donor lean</div>
                        <div className="flex h-2 rounded overflow-hidden bg-terminal-border">
                          <div className="bg-blue-500" style={{ flex: donorDem }} />
                          <div className="bg-red-500" style={{ flex: donorRep }} />
                        </div>
                      </div>
                    )}

                    {/* Issue-tagging coverage */}
                    {tagHealth && (
                      <div>
                        <div className="flex justify-between items-center text-[9px] uppercase tracking-wider mb-1">
                          <span className="text-terminal-muted">Issue tags · {tagHealth.coverage_pct}%</span>
                          <span
                            className={
                              tagHealth.running ? 'text-terminal-accent animate-pulse'
                              : tagHealth.status === 'stalled' ? 'text-terminal-red font-bold'
                              : tagHealth.status === 'healthy' || tagHealth.status === 'done' ? 'text-terminal-green'
                              : 'text-terminal-muted'
                            }
                          >
                            {tagHealth.running ? 'tagging…'
                              : tagHealth.status === 'done' ? 'fully tagged'
                              : tagHealth.status === 'stalled' ? '⚠ stalled'
                              : tagHealth.status}
                          </span>
                        </div>
                        <div className="h-2 rounded overflow-hidden bg-terminal-border">
                          <div className="bg-terminal-accent h-full" style={{ width: `${Math.min(100, tagHealth.coverage_pct)}%` }} />
                        </div>
                        <div className="text-terminal-muted text-[9px] mt-1">
                          {tagHealth.tagged.toLocaleString()}/{tagHealth.total.toLocaleString()} tagged
                          {tagHealth.tagged_this_week > 0 && <span className="text-terminal-green"> · +{tagHealth.tagged_this_week.toLocaleString()} this wk</span>}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={startCrawl}
                      disabled={crawling || stats?.running}
                      className="w-full text-[10px] uppercase tracking-wider py-1.5 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent transition-colors disabled:opacity-40"
                    >
                      {stats?.running ? 'CRAWLING…' : '↻ Expand Network'}
                    </button>
                  </div>
                )}
              </div>
            )
          })()}
        </nav>

        {/* Footer — settings + sidebar collapse toggle */}
        <div className={`border-t border-terminal-border flex items-center ${collapsed ? 'flex-col gap-1 py-2' : 'gap-1 px-2 py-2'}`}>
          <Tooltip
            placement="right"
            widthClass="w-56 text-left"
            content={<><div className="font-bold text-terminal-accent mb-1 uppercase tracking-wider">Settings</div>Switch between Day / Night theme, adjust font size, and choose your preferred monospace font.</>}
          >
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Settings"
              className="text-terminal-muted hover:text-terminal-accent transition-colors text-2xl leading-none px-2 py-1 border border-transparent hover:border-terminal-border rounded"
            >
              <span aria-hidden="true">⚙</span>
            </button>
          </Tooltip>
          <Tooltip
            placement="right"
            widthClass="w-52 text-left"
            content={<><div className="font-bold text-terminal-accent mb-1 uppercase tracking-wider">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</div>{collapsed ? 'Show full section names and labels.' : 'Shrink to an icon-only rail for more screen space.'}</>}
          >
            <button
              onClick={() => setCollapsedPersist(!collapsed)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="text-terminal-muted hover:text-terminal-accent transition-colors text-xl leading-none px-2 py-1 border border-transparent hover:border-terminal-border rounded"
            >
              {collapsed ? '»' : '«'}
            </button>
          </Tooltip>
        </div>
      </aside>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} onOpenLog={(type) => { setShowSettings(false); setShowLog(type) }} />}
      {showLog === 'ip' && <AccessLogModal onClose={() => setShowLog(false)} />}
      {showLog === 'search' && <SearchLogModal onClose={() => setShowLog(false)} />}
      {showLog === 'export' && <ExportLogModal onClose={() => setShowLog(false)} />}

      {/* Mobile bottom nav bar — HOME + flat tool list (horizontally scrollable) */}
      <nav aria-label="Tools" className="fixed bottom-0 left-0 right-0 md:hidden z-40 bg-terminal-panel border-t border-terminal-border flex overflow-x-auto">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-2 px-3 text-[9px] tracking-wider transition-colors flex-shrink-0 ${
              isActive ? 'text-terminal-accent' : 'text-terminal-muted hover:text-terminal-text'
            }`
          }
        >
          HOME
        </NavLink>
        {NAV_TOOLS_FLAT.map(tool => (
          <NavLink
            key={tool.to}
            to={tool.to!}
            title={tool.desc}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 px-3 text-[9px] tracking-wider transition-colors flex-shrink-0 ${
                isActive ? 'text-terminal-accent' : 'text-terminal-muted hover:text-terminal-text'
              }`
            }
          >
            {tool.short}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 overflow-hidden flex flex-col bg-terminal-bg pb-14 md:pb-0">
        <Suspense fallback={<div className="p-6 text-terminal-muted text-xs uppercase tracking-wider animate-pulse">Loading…</div>}>
          <Outlet />
        </Suspense>
      </main>
      </div>
    </div>
    </TopBarSlotContext.Provider>
  )
}
