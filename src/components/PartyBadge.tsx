import Tooltip from './Tooltip'

interface Props {
  party: string | null | undefined
  confidence?: number
  size?: 'sm' | 'xs'
}

const STYLES: Record<string, string> = {
  DEM: 'bg-blue-900 text-blue-300 border border-blue-700',
  REP: 'bg-red-900 text-red-300 border border-red-700',
  SPLIT: 'bg-purple-900 text-purple-300 border border-purple-700',
  UNKNOWN: 'bg-terminal-panel text-terminal-muted border border-terminal-border',
}

const TIPS: Record<string, string> = {
  DEM: 'Democratic lean — the majority of this donor\'s contributions go to Democratic candidates, committees, or PACs. Confidence % reflects how consistently one-sided the giving is.',
  REP: 'Republican lean — the majority of contributions go to Republican candidates or committees. Confidence % reflects consistency.',
  SPLIT: 'Split — this donor funds both parties\' candidates, making a clear party lean indeterminate.',
  UNKNOWN: 'Party unknown — not enough contribution data to determine a party lean.',
}

export default function PartyBadge({ party, confidence }: Props) {
  if (!party) return <span className="text-terminal-muted">—</span>
  const style = STYLES[party] ?? STYLES.UNKNOWN
  const label = party === 'SPLIT' ? 'SPLIT' : party
  const tip = TIPS[party] ?? TIPS.UNKNOWN
  return (
    <Tooltip content={tip}>
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold tracking-wider cursor-default ${style}`}>
        {label}
        {confidence != null && confidence > 0 && (
          <span className="font-normal opacity-70">{confidence}%</span>
        )}
      </span>
    </Tooltip>
  )
}
