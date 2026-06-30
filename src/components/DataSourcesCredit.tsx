/**
 * DataSourcesCredit — a compact, on-brand "Data & sources" disclosure.
 *
 * Credits every dataset the surface draws on, with the Redistricting Data Hub
 * (RDH) featured per their Terms & Conditions (cite appropriately; noncommercial,
 * nonpartisan use). Drop it into a panel footer; it collapses by default.
 */

type Source = { name: string; detail: string; href?: string }

const SOURCES: Source[] = [
  { name: 'U.S. Census Bureau', detail: 'ACS demographics, CVAP, geographies', href: 'https://www.census.gov/' },
  { name: 'VEST / election results', detail: 'precinct-level returns', href: 'https://dataverse.harvard.edu/dataverse/electionscience' },
  { name: 'County canvasses', detail: 'official certified vote totals' },
  { name: 'MEC & FEC', detail: 'campaign-finance filings', href: 'https://www.fec.gov/' },
  { name: 'CARTO / OpenStreetMap', detail: 'basemap tiles', href: 'https://www.openstreetmap.org/copyright' },
]

export default function DataSourcesCredit() {
  return (
    <details className="dpi-sources mt-5 pt-3 border-t border-terminal-border group">
      <summary className="flex items-center gap-1.5 cursor-pointer list-none select-none text-[10px] uppercase tracking-[0.16em] text-terminal-muted font-body font-semibold hover:text-terminal-text">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round"
          className="transition-transform duration-200 group-open:rotate-90" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
        Data &amp; sources
      </summary>

      <div className="mt-3 space-y-3">
        {/* Featured partner — Redistricting Data Hub */}
        <a
          href="https://redistrictingdatahub.org/"
          target="_blank"
          rel="noreferrer"
          className="block rounded-lg border border-terminal-border bg-terminal-bg p-2.5 no-underline transition-colors hover:border-terminal-blue"
          style={{ borderLeft: '3px solid var(--color-blue)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-display font-bold text-terminal-text leading-tight">
              Redistricting Data Hub
            </span>
            <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-body font-semibold text-terminal-blue">
              data partner
              <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.4"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </span>
          </div>
          <div className="text-[10.5px] text-terminal-muted mt-1 leading-snug font-body">
            Standardized precinct election results, Census demographics, and official
            district boundaries for all 50 states.
          </div>
          <div className="text-[9.5px] text-terminal-muted mt-1.5 leading-snug font-body italic">
            Used here under RDH's nonpartisan, noncommercial terms. Please cite RDH.
          </div>
        </a>

        {/* Everything else */}
        <ul className="space-y-1">
          {SOURCES.map((s) => (
            <li key={s.name} className="flex items-baseline gap-1.5 text-[10.5px] leading-snug font-body">
              <span className="text-terminal-blue mt-[1px]">·</span>
              <span className="min-w-0">
                {s.href ? (
                  <a href={s.href} target="_blank" rel="noreferrer" className="font-semibold text-terminal-text hover:text-terminal-blue no-underline">
                    {s.name}
                  </a>
                ) : (
                  <span className="font-semibold text-terminal-text">{s.name}</span>
                )}
                <span className="text-terminal-muted"> — {s.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
