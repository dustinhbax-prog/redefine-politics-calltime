import { useEffect, useState } from 'react'

interface Shape {
  viewBox: string
  width: number
  height: number
  state_path: string
  district_path: string
}

// Module-level cache so each district is fetched at most once per session.
const _cache = new Map<string, Shape>()

const DISPLAY_W = 208 // px

export default function DistrictMiniMap({
  level, id, title, subtitle,
}: { level: string; id: string; title?: string; subtitle?: string }) {
  const key = `${level}:${id}`
  const [shape, setShape] = useState<Shape | null>(_cache.get(key) ?? null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (shape || err) return
    fetch(`/api/districts/shape?level=${level}&id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: Shape) => { _cache.set(key, s); setShape(s) })
      .catch(() => setErr(true))
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stable box size in every state so the tooltip positions correctly.
  const boxH = shape ? Math.round(DISPLAY_W * shape.height / shape.width) : 184

  return (
    <div className="flex flex-col items-center gap-2" style={{ width: DISPLAY_W }}>
      {(title || subtitle) && (
        <div className="text-center leading-tight">
          {title && <div className="text-[#f87171] text-sm font-bold tracking-wide">{title}</div>}
          {subtitle && <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-400 mt-0.5">{subtitle}</div>}
        </div>
      )}

      <div
        className="rounded-lg p-2 w-full flex items-center justify-center"
        style={{
          height: boxH + 16,
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.045), rgba(255,255,255,0.015))',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {err ? (
          <span className="text-neutral-500 text-xs">map unavailable</span>
        ) : !shape ? (
          <span className="text-neutral-500 text-xs animate-pulse">loading map…</span>
        ) : (
          <svg viewBox={shape.viewBox} width={DISPLAY_W - 16} height={boxH} className="block overflow-visible">
            <defs>
              <linearGradient id="distFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f87171" />
                <stop offset="100%" stopColor="#dc2626" />
              </linearGradient>
              <filter id="distGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#ef4444" floodOpacity="0.65" />
              </filter>
            </defs>

            {/* State body: faint fill for form + soft outline. */}
            <path
              d={shape.state_path}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ fill: 'rgba(255,255,255,0.06)', stroke: '#9ca3af', strokeWidth: 1 }}
            />

            {/* The district: glowing gradient fill, lifted off the state. */}
            <path
              d={shape.district_path}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
              filter="url(#distGlow)"
              style={{ fill: 'url(#distFill)', fillOpacity: 0.92, stroke: '#fecaca', strokeWidth: 1.5 }}
            />
          </svg>
        )}
      </div>

      <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-500">Missouri</div>
    </div>
  )
}
