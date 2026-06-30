interface PageHeaderProps {
  /** Page title — rendered in the terminal display style (uppercase, tracked). */
  title: string
  /** Optional one-line description under the title. */
  subtitle?: string
  /** Optional headline count (e.g. result total) shown on the right. */
  count?: number
  countLabel?: string
  /** Right-aligned action slot (buttons, exports, etc.). */
  children?: React.ReactNode
}

/**
 * Standard page title bar. Establishes consistent hierarchy across pages
 * that previously jumped straight into their search forms.
 */
export default function PageHeader({ title, subtitle, count, countLabel = 'results', children }: PageHeaderProps) {
  return (
    <div className="px-4 pt-3 pb-2 border-b border-terminal-border bg-terminal-panel flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="page-title truncate">{title}</h1>
        {subtitle && (
          <div className="text-terminal-muted text-xs mt-1 normal-case tracking-normal truncate">{subtitle}</div>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {count !== undefined && (
          <div className="text-right leading-none">
            <div className="stat-num text-terminal-accent" style={{ fontSize: '1.15rem' }}>{count.toLocaleString()}</div>
            <div className="text-terminal-muted text-[10px] uppercase tracking-wider mt-0.5">{countLabel}</div>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
