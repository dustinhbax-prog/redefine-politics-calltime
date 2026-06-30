interface FilterChipProps {
  label: string
  active: boolean
  onClick: () => void
  title?: string
}

/**
 * Toggleable filter chip. Consolidates the inline toggle-button markup that
 * pages (Donors issue toggles, Prospects industry/issue chips) each re-implemented.
 */
export default function FilterChip({ label, active, onClick, title }: FilterChipProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      className={`px-2 py-1 text-[11px] uppercase tracking-wider border transition-colors select-none ${
        active
          ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
          : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-text'
      }`}
    >
      {label}
    </button>
  )
}
