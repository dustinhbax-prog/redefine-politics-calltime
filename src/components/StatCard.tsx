interface StatCardProps {
  label: string
  value: React.ReactNode
  /** Render the value in the accent color (for the headline metric). */
  accent?: boolean
  /** Optional secondary line under the value. */
  sub?: React.ReactNode
}

/**
 * Compact labeled metric box using the .stat-num hierarchy treatment.
 * Replaces the ad-hoc inline stat markup scattered across profile pages.
 */
export default function StatCard({ label, value, accent, sub }: StatCardProps) {
  return (
    <div className="border border-terminal-border bg-terminal-panel px-3 py-2">
      <div className="text-terminal-muted text-[10px] uppercase tracking-wider mb-1">{label}</div>
      <div className={`stat-num ${accent ? 'text-terminal-accent' : 'text-terminal-text'}`}>{value}</div>
      {sub && <div className="text-terminal-muted text-[10px] mt-0.5">{sub}</div>}
    </div>
  )
}
