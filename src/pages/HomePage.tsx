import { useLayoutEffect } from 'react'
import { Link } from 'react-router-dom'
import { NAV_SECTIONS, NavTool } from '../lib/navSections'
import HomeNetworkPanel from '../components/HomeNetworkPanel'
import { useMorph } from '../components/MorphOverlay'
import { TopBarPortal } from '../lib/topbar'

function ToolCard({ tool }: { tool: NavTool }) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-2xl leading-none">{tool.glyph}</span>
        {tool.dev
          ? <span className="text-[9px] uppercase tracking-wider text-terminal-accent border border-terminal-accent px-1.5 py-0.5">In Dev</span>
          : <span className="text-terminal-muted text-xs group-hover/card:text-terminal-accent transition-colors">Open →</span>}
      </div>
      <div className="font-display text-terminal-text uppercase tracking-wider text-sm font-bold mb-1">{tool.label}</div>
      <div className="font-body text-terminal-muted text-xs leading-relaxed normal-case">{tool.desc}</div>
    </>
  )
  const cls = `group/card card-brand block p-4 ${
    tool.dev ? 'opacity-70 cursor-default' : ''
  }`
  return tool.to ? <Link to={tool.to} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>
}

export default function HomePage() {
  const morph = useMorph()
  // Layout effect so the entry-morph cover paints before the bare home flashes.
  useLayoutEffect(() => { morph.onHomeMount() }, [morph])

  return (
    <div className="flex-1 overflow-auto">
      {/* Hero — rendered into the top bar (beside the logo) so it's one unified bar */}
      <TopBarPortal>
        <div className="px-4 md:px-6 py-3 w-full flex flex-col md:flex-row md:items-center gap-4 md:gap-5">
          <div className="md:max-w-2xl min-w-0">
            <p className="font-body text-terminal-text text-sm leading-relaxed mb-2">
              ReDEFINE POLITICS helps Democratic and progressive candidates across Missouri
              raise money smarter and run sharper campaigns. We pair hands-on fundraising,
              compliance, and strategy support with a proprietary data platform.
            </p>
            <p className="font-body text-terminal-muted text-xs leading-relaxed">
              This platform pulls federal (FEC) and Missouri (MEC) campaign-finance filings,
              donor geocoding, lobbying records, and legislative activity into one place. It
              turns that into ranked donor prospects, ready-made call lists, call sheets, and the
              relationships behind the money.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-col md:w-48 flex-shrink-0">
            <Link to="/prospects" className="btn-primary block w-full text-center whitespace-nowrap">Score Prospects</Link>
            <Link to="/fundraising-lists" className="btn-ghost block w-full text-center whitespace-nowrap">Fundraising Lists</Link>
            <Link to="/donors" className="btn-ghost block w-full text-center whitespace-nowrap">Search Donors</Link>
            <Link to="/legislature" className="btn-ghost block w-full text-center whitespace-nowrap">Explore Legislature</Link>
          </div>
          {/* Owner / contact card — far right of the bar on desktop, stacked on mobile */}
          <div className="md:ml-auto flex-shrink-0 border-t md:border-t-0 md:border-l border-terminal-border pt-3 md:pt-0 md:pl-5">
            <div className="font-display text-terminal-text text-sm font-bold tracking-wide">Dustin Bax</div>
            <div className="font-body text-terminal-muted text-[11px] uppercase tracking-wider mb-1.5">Owner · ReDEFINE POLITICS</div>
            <a href="tel:5737460956" className="block text-xs text-terminal-blue hover:text-terminal-accent transition-colors">(573) 746-0956</a>
            <a href="mailto:DustinHbax@gmail.com" className="block text-xs text-terminal-blue hover:text-terminal-accent transition-colors">DustinHbax@gmail.com</a>
          </div>
        </div>
      </TopBarPortal>

      {/* Tool sections (two columns) + Network Database panel (third column) */}
      <div className="w-full px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Two columns of tool sections */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-10">
            {NAV_SECTIONS.map(section => (
              <section key={section.heading}>
                <div className="mb-3 border-b border-terminal-border pb-1.5">
                  <h2 className="font-display text-terminal-accent text-sm font-bold uppercase tracking-wider flex items-center gap-2"><span className="text-base leading-none">{section.glyph}</span>{section.heading}</h2>
                  <div className="font-body text-terminal-muted text-xs mt-1">{section.caption}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {section.tools.map(t => <ToolCard key={t.label} tool={t} />)}
                </div>
              </section>
            ))}
          </div>

          {/* Third column: Network Database stats + nightly task logs */}
          <div className="lg:col-span-1">
            <HomeNetworkPanel />
          </div>
        </div>

        <div className="border-t border-terminal-border pt-4 mt-10 text-terminal-muted text-xs flex flex-wrap items-center justify-between gap-2">
          <span>Data sources: FEC · Missouri Ethics Commission · TIGER districts · 2018–2026</span>
          <span className="text-terminal-border">ReDEFINE POLITICS — internal research platform</span>
        </div>
      </div>
    </div>
  )
}
