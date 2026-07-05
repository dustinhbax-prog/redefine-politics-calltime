import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { TopBarPortal } from '../lib/topbar'
import DataSourcesCredit from '../components/DataSourcesCredit'

/* Missouri DPI interactive map — ported from the standalone MapLibre build,
   restyled to the ReDEFINE theme tokens (terminal-* / brand). Map engine is
   imperative on refs; the sidebar / legend / info panel are themed React. */

// Multi-state: the selected state comes from ?state=XX (default MO); switching
// state reloads the page with a new param, so the map cleanly initializes for one
// state per load. Per-state data lives under /dpi-data/<PO>/.
const CUR_STATE = ((typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('state') : '') || 'MO').toUpperCase()
const DATA = `/dpi-data/${CUR_STATE}`
const DEFAULT_BOUNDS: [[number, number], [number, number]] = [[-95.95, 35.85], [-88.95, 40.75]]

type Lvl = { id: string; label: string }
// Default (Missouri) level/sub lists; a state's meta.json may override via meta.levels / meta.subs.
const LEVELS: Lvl[] = [
  { id: 'county', label: 'County' }, { id: 'house', label: 'State House' },
  { id: 'senate', label: 'State Senate' }, { id: 'cd2025', label: 'Congress ’25' },
  { id: 'cd2022', label: 'Congress ’22' }, { id: 'cityward', label: 'City wards' },
]
const SUBS: Lvl[] = [
  { id: 'precinct', label: 'Precincts' }, { id: 'cousub', label: 'Townships' },
  { id: 'school', label: 'School districts' }, { id: 'county_elec', label: 'County council' },
]
const LEANCOLOR: Record<string, string> = { 'Safe R': '#b2182b', 'Likely R': '#d6604d', 'Lean R': '#f4a582', 'Tossup': '#9aa0a8', 'Lean D': '#6aaed6', 'Likely D': '#3a8bd0', 'Safe D': '#0f4fc9' }
const LINEW: Record<string, number> = { county: 1.0, house: 0.7, senate: 0.9, cd2025: 1.2, cd2022: 1.2, precinct: 0.35, cousub: 0.5, school: 0.7, county_elec: 1.0 }

// ---- Seat-outlook corner controls (highlight by partisan band) ----
// Bands on the ACTIVE dpi metric (dpi or dpi_forecast): D = v>=53, T = 47<=v<53, R = v<47.
type Band = 'D' | 'T' | 'R'
const SEAT_BANDS: { id: Band; label: string; dot: string; line: string }[] = [
  { id: 'D', label: 'Democratic', dot: '#1d4ed8', line: '#1d4ed8' },
  { id: 'T', label: 'Tossup', dot: '#b45309', line: '#b45309' },
  { id: 'R', label: 'Republican', dot: '#b91c1c', line: '#b91c1c' },
]
const bandOf = (v: any): Band | null => (v == null || v === '' ? null : (+v >= 53 ? 'D' : +v >= 47 ? 'T' : 'R'))
// the dpi prop currently driving bands, given the forecast toggle
const seatProp = (fc: boolean) => (fc ? 'dpi_forecast' : 'dpi')
// MapLibre filter expression: feature is in band `b` using prop `p` (mirrors bandOf, null-safe)
const bandExpr = (b: Band, p: string): any => {
  const has = ['!=', ['get', p], null]
  if (b === 'D') return ['all', has, ['>=', ['get', p], 53]]
  if (b === 'T') return ['all', has, ['>=', ['get', p], 47], ['<', ['get', p], 53]]
  return ['all', has, ['<', ['get', p], 47]]
}
// data-driven outline color per band (switches dpi <-> dpi_forecast with the toggle)
const seatColorExpr = (fc: boolean): any => {
  const p = seatProp(fc)
  return ['case',
    bandExpr('D', p), SEAT_BANDS[0].line,
    bandExpr('R', p), SEAT_BANDS[2].line,
    SEAT_BANDS[1].line]
}

const RAMPS: Record<string, [number, string][]> = {
  dpi: [[15, '#67001f'], [30, '#b2182b'], [38, '#d6604d'], [44, '#f4a582'], [47, '#fddbc7'], [50, '#f7f7f7'], [53, '#d1e5f0'], [56, '#92c5de'], [62, '#4393c3'], [70, '#1f6cc4'], [85, '#0f3b8c']],
  forecast: [[15, '#67001f'], [30, '#b2182b'], [38, '#d6604d'], [44, '#f4a582'], [47, '#fddbc7'], [50, '#f7f7f7'], [53, '#d1e5f0'], [56, '#92c5de'], [62, '#4393c3'], [70, '#1f6cc4'], [85, '#0f3b8c']],
  turnout_pres: [[40, '#edf8fb'], [52, '#b2e2e2'], [64, '#66c2a4'], [74, '#238b45'], [85, '#00441b']],
  turnout_mid: [[25, '#edf8fb'], [40, '#b2e2e2'], [52, '#66c2a4'], [62, '#238b45'], [72, '#00441b']],
  turnout_gap: [[8, '#fff7ec'], [16, '#fdd49e'], [22, '#fc8d59'], [27, '#d7301f'], [33, '#7f0000']],
  vap_chg_26_35: [[-12, '#b2182b'], [-4, '#ef8a62'], [0, '#f7f7f7'], [6, '#7fbf7b'], [15, '#1b7837']],
  nonwhite_chg: [[-3, '#8c510a'], [-0.5, '#dfc27d'], [0, '#f6f6f6'], [3, '#80cdc1'], [8, '#01665e']],
  mrp_resid: [[-15, '#b2182b'], [-7, '#ef8a62'], [0, '#f7f7f7'], [7, '#67a9cf'], [15, '#1f6cc4']],
}
type Metric = { label: string; short: string; prop: string; tick: string; note: string; fmt: (v: number) => string }
const METRICS: Record<string, Metric> = {
  dpi: { label: 'DPI', short: 'DPI', prop: 'dpi', tick: '', note: 'Red = Republican-leaning · Blue = Democratic-leaning · 50 = even. Gray = no data.', fmt: v => (+v).toFixed(1) },
  forecast: { label: '2026 Forecast', short: 'Forecast', prop: 'dpi_forecast', tick: '', note: 'Same 0–100 scale, but recency-fitted to predict the next election (heavy 2024 + down-ballot weight).', fmt: v => (+v).toFixed(1) },
  turnout_pres: { label: 'Turnout ’24', short: 'Turn ’24', prop: 'turnout_pres', tick: '%', note: 'Share of registered voters who turned out in the 2024 presidential election.', fmt: v => (+v).toFixed(0) + '%' },
  turnout_mid: { label: 'Turnout ’22', short: 'Turn ’22', prop: 'turnout_mid', tick: '%', note: 'Share of registered voters who turned out in the 2022 midterm.', fmt: v => (+v).toFixed(0) + '%' },
  turnout_gap: { label: 'Midterm drop', short: 'Mid drop', prop: 'turnout_gap', tick: ' pt', note: 'Presidential minus midterm turnout — darker = bigger dropoff, i.e. more GOTV upside in a midterm like 2026.', fmt: v => (+v).toFixed(0) + ' pts' },
  vap_chg_26_35: { label: 'Growth ’26–35', short: 'Growth', prop: 'vap_chg_26_35', tick: '%', note: 'Projected change in voting-age population 2026→2035 — green growing, red shrinking.', fmt: v => ((+v >= 0 ? '+' : '') + (+v).toFixed(0)) + '%' },
  nonwhite_chg: { label: 'Diversifying', short: 'Diversify', prop: 'nonwhite_chg', tick: ' pp', note: 'Projected change in non-white share of voting-age population 2026→2035.', fmt: v => ((+v >= 0 ? '+' : '') + (+v).toFixed(1)) + ' pp' },
  mrp_resid: { label: 'Realignment', short: 'Realign', prop: 'dpi_mrp_resid', tick: ' pt', note: 'Where each area votes relative to what its demographics predict — the DPI minus an independent, survey-based demographic estimate (no past results used). Blue = Democrats over-perform the demographics (ancestral-D, e.g. Little Dixie); red = under-perform (realigned away). Gray = district levels only (county / House / Senate / Congress).', fmt: v => ((+v >= 0 ? '+' : '') + (+v).toFixed(1)) + ' pts' },
}
const METRIC_IDS = Object.keys(METRICS)
// the NEUTRAL ↔ 2026 FORECAST toggle owns 'dpi' and 'forecast'; keep them out of the
// "Color by" Seg so they aren't duplicated. The Seg keeps only turnout/projection metrics.
const SEG_METRIC_IDS = METRIC_IDS.filter(id => id !== 'dpi' && id !== 'forecast')

function colorExprFor(mid: string): any {
  const m = METRICS[mid], e: any[] = ['interpolate', ['linear'], ['get', m.prop]]
  RAMPS[mid].forEach(([v, c]) => { e.push(v, c) })
  return ['case', ['==', ['get', m.prop], null], '#9aa0a8', e]
}
function legendGradient(mid: string): string {
  const s = RAMPS[mid], lo = s[0][0], hi = s[s.length - 1][0]
  return 'linear-gradient(to right,' + s.map(([v, c]) => `${c} ${(((v as number) - lo) / (hi - lo) * 100).toFixed(1)}%`).join(',') + ')'
}
const themeIsDay = () => document.documentElement.getAttribute('data-theme') === 'day'
const basemapTiles = () => {
  const d = themeIsDay() ? 'light_all' : 'dark_all'
  return ['a', 'b', 'c'].map(s => `https://${s}.basemaps.cartocdn.com/${d}/{z}/{x}/{y}.png`)
}
const lineColor = () => (themeIsDay() ? 'rgba(21,23,26,.45)' : 'rgba(230,234,240,.22)')
const hoverColor = () => (themeIsDay() ? '#0b0e12' : '#ffffff')

const F = (v: any, d = 1) => v == null || v === '' ? '—' : (+v).toFixed(d)
const SGN = (v: any, d = 1) => v == null || v === '' ? '—' : ((+v >= 0 ? '+' : '') + (+v).toFixed(d))
const INT = (v: any) => v == null || v === '' ? '—' : Math.round(+v).toLocaleString()
const MONEY = (v: any) => v == null || v === '' ? '—' : '$' + Math.round(+v).toLocaleString()
const leanOf = (dd: any): string | null => dd == null ? null : (dd >= 65 ? 'Safe D' : dd >= 57 ? 'Likely D' : dd >= 53 ? 'Lean D' : dd >= 47 ? 'Tossup' : dd >= 43 ? 'Lean R' : dd >= 35 ? 'Likely R' : 'Safe R')

export default function DpiMapPage() {
  const mapEl = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const added = useRef<Record<string, boolean>>({})
  const cache = useRef<Record<string, any>>({})
  const meta = useRef<any>(null)
  const st = useRef({ topLevel: 'county', mode: 'state', selFips: '', activeSub: 'precinct', metric: 'dpi', forecast: false })
  // Multi-state runtime: bounds + the effective level/sub id lists for the loaded
  // state (default MO's; overridden from meta.json). Refs so callbacks read current.
  const boundsRef = useRef<[[number, number], [number, number]]>(DEFAULT_BOUNDS)
  const LV = useRef<string[]>(LEVELS.map(l => l.id))
  const SB = useRef<string[]>(SUBS.map(s => s.id))
  const SBL = useRef<Lvl[]>(SUBS) // full {id,label} subs list for the loaded state (drill-down UI)
  const [levels, setLevels] = useState<Lvl[]>(LEVELS)
  const [statesList, setStatesList] = useState<{ po: string; name: string }[]>([])
  const [stateName, setStateName] = useState('Missouri')

  const [topLevel, setTopLevel] = useState('county')
  const [metric, setMetric] = useState('dpi')
  // NEUTRAL ↔ 2026 FORECAST toggle. Tracks which DPI variant the toggle is set to so the
  // data panel can emphasize the live figure and mute the other, independent of whether a
  // turnout metric is currently coloring the map. Default = Neutral.
  const [forecastMode, setForecastMode] = useState(false)
  const [mode, setMode] = useState<'state' | 'county'>('state')
  // Seat-outlook corner controls: live counts over the visible layer + the set of bands
  // whose features are currently outlined (union; multiple may be active at once).
  const [seatCounts, setSeatCounts] = useState<Record<Band, number>>({ D: 0, T: 0, R: 0 })
  const seatSel = useRef<Set<Band>>(new Set())
  const [seatActive, setSeatActive] = useState<Band[]>([])
  const [selName, setSelName] = useState('')
  const [subList, setSubList] = useState<Lvl[]>([])
  const [activeSub, setActiveSub] = useState('precinct')
  const [info, setInfo] = useState<any>(null)
  const [infoLevel, setInfoLevel] = useState<string>('')
  const [races, setRaces] = useState<any>(null)
  const [stateStats, setStateStats] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null)
  // hover/focus explanation bubble for the data-table rows (Job 1)
  const panelRef = useRef<HTMLElement>(null)
  // bubble sits just below the hovered row (tail up); if it would clip the panel
  // bottom it flips above the row (tail down). `tailX` aligns the tail under the row.
  const [bubble, setBubble] = useState<{ text: string; nextUp: number | null; top: number; tailX: number; below: boolean } | null>(null)
  const showBubble = useCallback((el: HTMLElement, text: string, nextUp: number | null = null) => {
    const panel = panelRef.current
    if (!panel || !text) return
    const pr = panel.getBoundingClientRect()
    const rr = el.getBoundingClientRect()
    const sc = panel.scrollTop
    const rowTop = rr.top - pr.top + sc
    const rowBot = rr.bottom - pr.top + sc
    const GAP = 8
    const BH = Math.min(190, 40 + Math.ceil(text.length / 30) * 16 + (nextUp ? 26 : 0)) // rough height for flip/clamp
    const viewTop = sc + 8
    const viewBot = sc + panel.clientHeight - 8
    // prefer below the row; flip above if there isn't room below but there is above
    let below = true
    if (rowBot + GAP + BH > viewBot && rowTop - GAP - BH >= viewTop) below = false
    let top = below ? rowBot + GAP : rowTop - GAP - BH
    if (top < viewTop) top = viewTop
    if (top + BH > viewBot) top = Math.max(viewTop, viewBot - BH)
    // tail x = horizontal centre of the row's value side, clamped inside the bubble
    const tailX = Math.max(20, Math.min(pr.width - 48, rr.width - 56))
    setBubble({ text, nextUp, top, tailX, below })
  }, [])
  const hideBubble = useCallback(() => setBubble(null), [])

  const setVisible = (level: string, vis: boolean) => {
    ['fill', 'line', 'seat', 'hover'].forEach(s => {
      const id = `${level}-${s}`
      if (map.current!.getLayer(id)) map.current!.setLayoutProperty(id, 'visibility', vis ? 'visible' : 'none')
    })
  }
  const hideAll = () => [...LV.current, ...SB.current].forEach(l => { if (added.current[l]) setVisible(l, false) })

  const bboxOfFeature = (ft: any): [[number, number], [number, number]] => {
    let xmin = 180, ymin = 90, xmax = -180, ymax = -90
    const walk = (c: any) => { if (typeof c[0] === 'number') { if (c[0] < xmin) xmin = c[0]; if (c[0] > xmax) xmax = c[0]; if (c[1] < ymin) ymin = c[1]; if (c[1] > ymax) ymax = c[1] } else c.forEach(walk) }
    walk(ft.geometry.coordinates)
    return [[xmin, ymin], [xmax, ymax]]
  }

  const ensure = useCallback(async (level: string) => {
    if (added.current[level]) return
    setLoading(true)
    const gj = cache.current[level] || await (await fetch(`${DATA}/${level}.geojson`, { cache: 'no-cache' })).json()
    cache.current[level] = gj
    const m = map.current!
    m.addSource(level, { type: 'geojson', data: gj, promoteId: 'key' })
    m.addLayer({ id: `${level}-fill`, type: 'fill', source: level, paint: { 'fill-color': colorExprFor(st.current.metric), 'fill-color-transition': { duration: 900 }, 'fill-opacity': 0.78 } as any, layout: { visibility: 'none' } })
    m.addLayer({ id: `${level}-line`, type: 'line', source: level, paint: { 'line-color': lineColor(), 'line-width': LINEW[level] || 0.6 }, layout: { visibility: 'none' } })
    m.addLayer({ id: `${level}-seat`, type: 'line', source: level, paint: { 'line-color': seatColorExpr(st.current.forecast), 'line-width': 2.5 } as any, filter: ['==', ['get', 'key'], '___none___'], layout: { visibility: 'none' } })
    m.addLayer({ id: `${level}-hover`, type: 'line', source: level, paint: { 'line-color': hoverColor(), 'line-width': 2.2 }, filter: ['==', ['get', 'key'], '___none___'], layout: { visibility: 'none' } })
    wireEvents(level)
    added.current[level] = true
    setLoading(false)
  }, [])

  // ---- Seat-outlook: which layer is on screen, and the features actually shown on it ----
  const visibleSeatLevel = () => (st.current.mode === 'county' ? st.current.activeSub : st.current.topLevel)
  // the features currently rendered on the visible layer (respects the sub-level filter when drilled in)
  const visibleSeatFeatures = (): any[] => {
    const lvl = visibleSeatLevel()
    const feats: any[] = cache.current[lvl]?.features || []
    if (st.current.mode !== 'county') return feats
    if (lvl === 'school') {
      const fips = st.current.selFips
      const keys = new Set(Object.entries(meta.current?.school2fips || {})
        .filter(([, v]: any) => (v as any).includes(fips)).map(([k]) => k))
      return feats.filter(f => keys.has(f.properties.key))
    }
    return feats.filter(f => f.properties.cofips === st.current.selFips)
  }
  // recompute the three band counts over the visible layer, and refresh the highlight layer's
  // color + filter for the currently-selected bands. Clears stale outlines from the old layer.
  const seatPrevLevel = useRef<string>('county')
  const refreshSeats = useCallback((opts: { clear?: boolean } = {}) => {
    if (!map.current) return
    const fc = st.current.forecast
    const prop = seatProp(fc)
    const feats = visibleSeatFeatures()
    const counts: Record<Band, number> = { D: 0, T: 0, R: 0 }
    feats.forEach(f => { const b = bandOf(f.properties[prop]); if (b) counts[b]++ })
    setSeatCounts(counts)
    const lvl = visibleSeatLevel()
    // clear stale outlines from the previously-visible layer (its highlight would otherwise linger)
    const prev = seatPrevLevel.current
    if (prev !== lvl && added.current[prev] && map.current.getLayer(`${prev}-seat`)) {
      map.current.setFilter(`${prev}-seat`, ['==', ['get', 'key'], '___none___'])
    }
    seatPrevLevel.current = lvl
    if (opts.clear && seatSel.current.size) { seatSel.current = new Set(); setSeatActive([]) }
    if (!added.current[lvl] || !map.current.getLayer(`${lvl}-seat`)) return
    // color expression must track the active prop so bands recolor with the forecast toggle
    map.current.setPaintProperty(`${lvl}-seat`, 'line-color', seatColorExpr(fc))
    const sel = seatSel.current
    const filt = sel.size
      ? ['any', ...[...sel].map(b => bandExpr(b, prop))]
      : ['==', ['get', 'key'], '___none___']
    map.current.setFilter(`${lvl}-seat`, filt as any)
  }, [])
  const toggleSeat = useCallback((b: Band) => {
    const sel = seatSel.current
    sel.has(b) ? sel.delete(b) : sel.add(b)
    setSeatActive([...sel])
    refreshSeats()
  }, [refreshSeats])

  const showLevel = useCallback(async (level: string) => {
    st.current.topLevel = level; st.current.mode = 'state'; st.current.selFips = ''
    setTopLevel(level); setMode('state'); setInfo(null); setInfoLevel('')
    await ensure(level)
    hideAll(); setVisible(level, true)
    refreshSeats({ clear: true })
    map.current!.fitBounds(boundsRef.current, { padding: 30, duration: 700 })
  }, [ensure, refreshSeats])

  const showSub = useCallback(async (sub: string) => {
    st.current.activeSub = sub; setActiveSub(sub)
    await ensure(sub)
    SB.current.forEach(id => { if (added.current[id]) setVisible(id, false) })
    setVisible(sub, true)
    let filt: any
    if (sub === 'school') {
      const keys = Object.entries(meta.current.school2fips).filter(([, v]: any) => v.includes(st.current.selFips)).map(([k]) => k)
      filt = ['in', ['get', 'key'], ['literal', keys]]
    } else filt = ['==', ['get', 'cofips'], st.current.selFips]
    ;['fill', 'line'].forEach(t => map.current!.setFilter(`${sub}-${t}`, filt))
    refreshSeats({ clear: true })
  }, [ensure, refreshSeats])

  const drillInto = useCallback(async (prop: any) => {
    const fips = prop.key
    st.current.selFips = fips; st.current.mode = 'county'
    setMode('county'); setSelName(meta.current.fips2name[fips] || fips)
    setInfo(prop); setInfoLevel('county')
    const avail = SBL.current.filter(s => s.id !== 'county_elec' || (meta.current.ce_counties || []).includes(fips))
    setSubList(avail)
    if (!avail.find(s => s.id === st.current.activeSub) && avail.length) st.current.activeSub = avail[0].id
    setVisible('county', false)
    await showSub(st.current.activeSub)
    const f = (cache.current.county.features || []).find((x: any) => x.properties.key === fips)
    map.current!.fitBounds(f ? bboxOfFeature(f) : boundsRef.current, { padding: 40, duration: 800 })
  }, [showSub])

  const applyMetric = useCallback((mid: string) => {
    st.current.metric = mid; setMetric(mid)
    const expr = colorExprFor(mid)
    ;[...LV.current, ...SB.current].forEach(L => { if (added.current[L]) map.current!.setPaintProperty(`${L}-fill`, 'fill-color', expr) })
  }, [])

  const wireEvents = (level: string) => {
    const m = map.current!, fill = `${level}-fill`
    m.on('mousemove', fill, (e: any) => {
      if (!e.features.length) return
      m.getCanvas().style.cursor = (level === 'county' && st.current.mode === 'state' && SB.current.length) ? 'zoom-in' : 'pointer'
      const p = e.features[0].properties
      m.setFilter(`${level}-hover`, ['==', ['get', 'key'], p.key])
      const dpi = p.dpi == null ? '—' : (+p.dpi).toFixed(1)
      let html = `<div class="font-display font-bold text-[12px] mb-0.5">${p.name || p.key}</div>`
      html += p.dpi == null ? `<div class="text-terminal-muted text-[11px]">no DPI data</div>`
        : `<div class="text-[11px]">DPI <b style="color:${LEANCOLOR[p.lean] || 'inherit'}">${dpi}</b> · ${p.lean || ''}</div>`
      const mid = st.current.metric
      if (mid !== 'dpi') { const mm = METRICS[mid], v = p[mm.prop]; html += `<div class="text-terminal-muted text-[11px]">${mm.label}: <b>${v == null ? '—' : mm.fmt(v)}</b></div>` }
      setTip({ x: e.point.x, y: e.point.y, html })
    })
    m.on('mouseleave', fill, () => { setTip(null); m.getCanvas().style.cursor = ''; if (m.getLayer(`${level}-hover`)) m.setFilter(`${level}-hover`, ['==', ['get', 'key'], '___none___']) })
    m.on('click', fill, (e: any) => {
      if (!e.features.length) return
      const p = e.features[0].properties
      // drill into a county only when this state actually has sub-county layers
      if (level === 'county' && st.current.mode === 'state' && SB.current.length) { drillInto(p); return }
      setInfo(p); setInfoLevel(level)
    })
  }

  // init
  useEffect(() => {
    if (map.current || !mapEl.current) return
    // load the statewide summary immediately (independent of map/WebGL init) so the panel fills instantly
    // no-cache: revalidate these data files every load so a redeploy's new numbers show
    // immediately (they're served with a long max-age, which otherwise pins a stale copy).
    const applyMeta = (j: any) => {
      meta.current = j; setStateStats(j.state)
      if (j.bounds) boundsRef.current = j.bounds
      if (j.name) setStateName(j.name)
      if (Array.isArray(j.levels) && j.levels.length) { setLevels(j.levels); LV.current = j.levels.map((l: Lvl) => l.id) }
      if (Array.isArray(j.subs)) { SBL.current = j.subs; SB.current = j.subs.map((s: Lvl) => s.id) }
      else if (j.levels) { SBL.current = []; SB.current = [] }  // state defines levels but no subs -> no drill-down
    }
    fetch(`${DATA}/meta.json`, { cache: 'no-cache' }).then(r => r.json()).then(applyMeta).catch(() => {})
    fetch(`${DATA}/races.json`, { cache: 'no-cache' }).then(r => r.json()).then(setRaces).catch(() => {})
    // state selector: list ONLY states computed + added to the database (the manifest)
    fetch(`/dpi-data/states.json`, { cache: 'no-cache' }).then(r => r.json())
      .then((list: any[]) => { setStatesList(list); const s = list.find(x => x.po === CUR_STATE); if (s) setStateName(s.name) })
      .catch(() => {})
    const m = new maplibregl.Map({
      container: mapEl.current,
      style: { version: 8, sources: { carto: { type: 'raster', tileSize: 256, tiles: basemapTiles(), attribution: '© OpenStreetMap contributors © CARTO' } }, layers: [{ id: 'carto', type: 'raster', source: 'carto' }] },
      bounds: boundsRef.current, fitBoundsOptions: { padding: 30 }, minZoom: 4, maxZoom: 14,
    })
    map.current = m
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('load', async () => {
      if (!meta.current) applyMeta(await (await fetch(`${DATA}/meta.json`, { cache: 'no-cache' })).json())
      m.fitBounds(boundsRef.current, { padding: 30, duration: 0 })
      await showLevel('county')
      applyMetric('dpi')
      // warm the OTHER layers in the background so switching/drill-down feels instant.
      // We fetch each into the HTTP cache, but only JSON.parse the small ones up front —
      // parsing the two heavy geometry layers (precinct ~5.8 MB / cousub ~3.3 MB) on the
      // main thread was a ~200 ms + ~100 ms jank on every page load. Those two are only
      // reached via an explicit county drill-down, where ensure() parses them on demand
      // (behind the existing "Loading…" indicator) off an already-warm HTTP cache.
      const PARSE_LIMIT = 2_000_000 // bytes of decoded text; above this, warm-cache only (parse lazily)
      const idle: any = (window as any).requestIdleCallback || ((cb: any) => setTimeout(cb, 250))
      const rest = [...LV.current, ...SB.current].filter(l => l !== 'county')
      let i = 0
      const next = () => {
        if (i >= rest.length) return
        const lv = rest[i++]
        if (cache.current[lv]) return next()
        fetch(`${DATA}/${lv}.geojson`, { cache: 'no-cache' })
          .then(r => r.text())
          .then(txt => { if (txt.length <= PARSE_LIMIT) cache.current[lv] = JSON.parse(txt) })
          .catch(() => {})
          .finally(() => idle(next))
      }
      idle(next)
    })
    // follow app theme toggle: swap basemap + line/hover colors
    const obs = new MutationObserver(() => {
      if (!map.current || !map.current.getSource('carto')) return
      ;(map.current.getSource('carto') as any).setTiles(basemapTiles())
      ;[...LV.current, ...SB.current].forEach(L => {
        if (added.current[L]) { map.current!.setPaintProperty(`${L}-line`, 'line-color', lineColor()); map.current!.setPaintProperty(`${L}-hover`, 'line-color', hoverColor()) }
      })
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    // keep the GL buffer matched to the flex container (fixes blank map when layout settles after init)
    const ro = new ResizeObserver(() => { map.current && map.current.resize() })
    ro.observe(mapEl.current)
    return () => { obs.disconnect(); ro.disconnect(); m.remove(); map.current = null; added.current = {} }
  }, [showLevel, applyMetric])

  // segmented control: lays buttons into exactly two rows, each button stretched to fill its cell
  const Seg = ({ items, active, onPick, tips }: { items: { id: string; label: string }[]; active: string; onPick: (id: string) => void; tips?: Record<string, string> }) => {
    const cols = Math.max(1, Math.ceil(items.length / 2))
    return (
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {items.map(it => {
          const tip = tips?.[it.id]
          return (
            <div key={it.id} className="relative group">
              <button onClick={() => onPick(it.id)}
                className={`w-full px-2 py-1.5 rounded-md text-xs border transition-colors truncate ${active === it.id ? 'bg-terminal-accent border-terminal-accent text-white font-semibold' : 'bg-terminal-bg border-terminal-border text-terminal-text hover:border-terminal-accent'}`}>
                {it.label}
              </button>
              {tip && (
                <span role="tooltip"
                  className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-50 hidden group-hover:block w-60 rounded-lg border border-terminal-border bg-terminal-panel px-2.5 py-2 text-[10.5px] leading-snug text-terminal-muted shadow-lg">
                  {tip}
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }
  const BlockLabel = ({ children }: { children: any }) => (
    <span className="block text-[10px] uppercase tracking-widest text-terminal-muted font-semibold mb-1.5">{children}</span>
  )

  // compact 2-cell Neutral | 2026 Forecast pill. A sliding highlight (absolutely-positioned
  // pill behind the active cell) animates via translateX. Visually minor: ~Seg height, text-[11px].
  const pickForecast = useCallback((fc: boolean) => {
    setForecastMode(fc)
    st.current.forecast = fc
    applyMetric(fc ? 'forecast' : 'dpi')
    refreshSeats()
  }, [applyMetric, refreshSeats])
  const ForecastToggle = ({ on }: { on: boolean }) => (
    <div className="relative inline-grid grid-cols-2 p-0.5 rounded-md border border-terminal-border bg-terminal-bg select-none" role="group" aria-label="Color scale">
      <span aria-hidden className="absolute top-0.5 bottom-0.5 left-0.5 rounded-[5px] bg-terminal-accent"
        style={{ width: 'calc(50% - 2px)', transform: on ? 'translateX(100%)' : 'translateX(0)', transition: 'transform 300ms ease' }} />
      <button type="button" onClick={() => pickForecast(false)} aria-pressed={!on}
        className={`relative z-10 px-2.5 py-1 rounded-[5px] text-[11px] leading-none transition-colors ${on ? 'text-terminal-text hover:text-terminal-accent' : 'text-white font-semibold'}`}>
        Neutral
      </button>
      <button type="button" onClick={() => pickForecast(true)} aria-pressed={on}
        className={`relative z-10 px-2.5 py-1 rounded-[5px] text-[11px] leading-none whitespace-nowrap transition-colors ${on ? 'text-white font-semibold' : 'text-terminal-text hover:text-terminal-accent'}`}>
        2026 Forecast
      </button>
    </div>
  )

  // ---- data-table panel (selected region, or statewide when nothing selected) ----
  const sw = stateStats ? { name: `${stateName} — statewide`, _state: true, ...stateStats, lean: leanOf(stateStats.dpi) } : null
  const d = info || sw
  const ln = d ? (d.lean || leanOf(d.dpi)) : null
  const lc = (ln && LEANCOLOR[ln]) || 'var(--color-muted)'
  // 2026 forecast line + its gap vs neutral DPI. gap = dpi_forecast − dpi (red if it moves
  // the area more Republican, blue if more Democratic). When the toggle is in Forecast mode the
  // forecast figure is emphasized and the neutral hero number is muted, and vice-versa.
  const fcVal = d && d.dpi_forecast != null ? +d.dpi_forecast : null
  const fcGap = (fcVal != null && d.dpi != null) ? fcVal - +d.dpi : null
  const fcGapColor = fcGap == null ? 'var(--color-muted)' : (fcGap < 0 ? 'var(--color-red)' : fcGap > 0 ? 'var(--color-blue)' : 'var(--color-muted)')
  // Each stat row is [label, value, explain] — explain is a plain-English line for the hover bubble.
  const sections = d ? [
    { t: 'Partisan lean', r: [
      ['Lean in a presidential year', F(d.dpi_pres), "How Democratic this area votes in a high-turnout presidential year, on a 0–100 scale where 50 is an even split. Above 50 leans Democratic, below 50 leans Republican."],
      ['Lean in a midterm year', F(d.dpi_mid), "The same 0–100 lean score, but for a midterm year like 2026 when turnout is lower. Midterms here usually look a little more Republican than presidential years."],
      d.vs_state != null && ['Lean vs. state average', SGN(d.vs_state), `How this area's lean compares to ${stateName} as a whole. A plus means it is more Democratic than the state average, a minus means more Republican, measured in points.`],
      d.pvi_vs_nation != null && ['Presidential lean vs. nation', SGN(d.pvi_vs_nation), "How this area's presidential vote compares to the country overall. A minus means it votes more Republican than the nation by that many points."],
      d.elasticity != null && ['Swinginess (1.0 = avg)', F(d.elasticity, 2), "How much this area swings when the national mood shifts. 1.0 is average. Above 1.0 means it moves more than the country in a wave, below 1.0 means it holds steadier."],
      d.lt_pres_trend != null && ['Trend per election cycle', SGN(d.lt_pres_trend) + ' pts', "The direction this area has been drifting each election. A plus means it has been getting more Democratic over time, a minus more Republican, in points per cycle."],
      d.confidence != null && ['Model confidence', d.confidence + '%', "How sure the model is about this area's score, based on how much past election data backs it up. Higher means the estimate rests on more elections."],
      d.ci95 != null && ['Margin of error (95%)', '± ' + F(d.ci95) + ' pts', "The wiggle room on the score. The true lean is very likely within this many points either side of the number shown."],
      d.dpi_mrp != null && ['Demographic estimate (MRP)', F(d.dpi_mrp) + (d.dpi_mrp_se != null ? ' ± ' + F(d.dpi_mrp_se) : ''), "An independent estimate of this area's lean built only from who lives here — its mix of age, education, race, and sex, learned from large national voter surveys (it never uses past election results). Compare it to the DPI: a gap means the area votes differently than its demographics alone would predict."],
      d.dpi_mrp_resid != null && ['Votes vs. demographics', SGN(d.dpi_mrp_resid) + ' pts', "How this area's actual election results compare to what its demographics predict. A plus means it votes more Democratic than its makeup suggests (an ancestral-Democratic area, like Little Dixie); a minus means more Republican (realigned away)."],
      d.mrp_turnout != null && ['Modeled turnout (MRP)', F(d.mrp_turnout, 0) + '%', "Turnout here estimated from the same demographic survey model — the share of adults likely to vote, based on the area's age, education, and race mix."],
    ] },
    { t: 'Campaign viability', r: [
      d.win_m != null && ['Win number — midterm (2026)', INT(d.win_m), "Votes needed to win here in a midterm like 2026: half the ballots cast in the last comparable midterm (2022) plus one. A campaign builds its vote goal around this number."],
      d.win_p != null && ['Win number — presidential', INT(d.win_p), "Votes needed to win here in a presidential year: half the ballots cast in the last presidential election (2020) plus one."],
      d.ballots_mid != null && ['Ballots cast, 2022 midterm', INT(d.ballots_mid), "Total ballots cast here in the 2022 general election — the basis for the midterm win number."],
      d.ballots_pres != null && ['Ballots cast, 2020 presidential', INT(d.ballots_pres), "Total ballots cast here in the 2020 presidential election."],
      d.turnout_pct_mid != null && ['Turnout, 2022 midterm', F(d.turnout_pct_mid, 0) + '%', "Share of registered voters who cast a ballot in the 2022 midterm."],
    ] },
    { t: 'Turnout', r: [
      d.turnout_pres != null && ['Turnout, 2024 presidential', F(d.turnout_pres, 0) + '%', "The share of registered voters who actually cast a ballot in the 2024 presidential election here."],
      d.turnout_mid != null && ['Turnout, 2022 midterm', F(d.turnout_mid, 0) + '%', "The share of registered voters who turned out in the 2022 midterm. Midterms draw fewer voters than presidential years."],
      d.turnout_gap != null && ['Midterm turnout drop-off', F(d.turnout_gap, 0) + ' pts', "How many points turnout fell from the presidential year to the midterm. A bigger drop means more voters to win back with get-out-the-vote work in a year like 2026."],
      d.reg_voters != null && ['Registered voters', INT(d.reg_voters), "The number of people currently registered to vote in this area."],
    ] },
    { t: 'Population projection 2026→2035', r: [
      d.vap_chg_26_35 != null && ['Voting-age pop. growth', SGN(d.vap_chg_26_35) + '%', "The projected change in the number of voting-age adults living here between 2026 and 2035. A plus means the area is growing, a minus means it is shrinking."],
      d.nonwhite_chg != null && ['Non-white share change', SGN(d.nonwhite_chg) + ' pts', "How much the non-white share of voting-age adults is projected to change here by 2035, in percentage points."],
    ] },
    { t: 'Demographics', r: [
      d.pop != null && ['Total population', INT(d.pop), "Everyone who lives here, from the Census, including children and people who are not registered to vote."],
      d.pct_college != null && ['Adults with a college degree', F(d.pct_college) + '%', "The share of adults here who hold at least a four-year college degree."],
      d.median_hh_income != null && ['Median household income', MONEY(d.median_hh_income), "The middle household income here: half of households earn more than this, half earn less."],
      d.pct_white_nh != null && ['White / Black (non-Hispanic)', F(d.pct_white_nh) + '% / ' + F(d.pct_black_nh) + '%', "The share of residents who are white and the share who are Black, counting only people who are not Hispanic."],
      d.density != null && ['People per square mile', INT(d.density), "How crowded the area is: the number of residents for every square mile of land. Higher numbers mean more urban, lower means more rural."],
    ] },
    { t: 'Voter registration', r: [
      d.reg_current != null && ['Registered (current)', INT(d.reg_current), "The number of people currently on the voter rolls here, from the latest statewide registration file."],
      d.party_dem2p != null && ['Declared lean (D, two-party)', F(d.party_dem2p) + '%', "Among voters who declared a party, the Democratic share of the two-party (D+R) total" + ((() => { const g = d.regparty_gap != null ? +d.regparty_gap : (d.dpi != null ? +d.party_dem2p - +d.dpi : null); return g == null ? '' : ", which runs " + SGN(g) + " points versus the DPI here" })()) + ". Missouri's party declaration is optional (since about 2022 only ~6% of voters opt in), so this is a corroboration signal, not the DPI itself. " + (d.party_src === 'voterfile' ? "Measured directly from the voter file for this area." : "Allocated from county registration totals.")],
      d.party_fill != null && ['Party opt-in rate', F(d.party_fill) + '%', "The share of registered voters here who chose to declare a party at all. Missouri's declaration is optional (since about 2022 only ~6% opt in statewide), so a low rate is normal and this lean is a corroboration signal, not the DPI. " + (d.party_src === 'voterfile' ? "Measured directly from the voter file." : "Allocated from county registration totals.")],
    ] },
    d._state && { t: 'Legislature', r: [
      ['Counties', String(d.n_counties), `The total number of counties in ${stateName}.`],
      ['Competitive House seats', `${d.house_tossups} of ${d.n_house}`, `How many of ${stateName}'s state House districts are close enough to be in play, out of the total number of House seats.`],
      ['Competitive Senate seats', `${d.senate_tossups} of ${d.n_senate}`, `How many of ${stateName}'s state Senate districts are close enough to be in play, out of the total number of Senate seats.`],
    ] },
  ].filter(Boolean).map((s: any) => ({ t: s.t, r: s.r.filter(Boolean) })).filter((s: any) => s.r.length) : []

  // ---- applicable-race win numbers (50%+1 of the votes cast in that race) ----
  // Each row is [office, detail, year, win, explain] where `explain` is a plain-language
  // walk-through of the math for the hover bubble.
  const baseOf = (lvl: string, k: string, b: 'm' | 'p') => (races?.win?.[lvl]?.[k]?.[b] ?? null) as number | null
  const stBase = (b: 'm' | 'p') => (races?.win?.state?.[b] ?? null) as number | null
  const winFrom = (base: number | null) => (base ? Math.floor(base / 2) + 1 : null)
  // kind: 'result' = real votes cast in this race; 'mid'/'pres' = turnout estimate from 2022/2024;
  //       'april' = November turnout used as a high-side stand-in for an April race.
  const explain = (base: number | null, win: number | null, kind: string, year: any) => {
    if (base == null || win == null) return "We don't have vote totals for this race yet, so there's no win number to show."
    const b = base.toLocaleString(), w = win.toLocaleString()
    if (kind === 'result') return `In the ${year} election, ${b} people actually voted in this race. To win you need more than half of them, so the win number is ${w}. That is half of ${b}, plus one.`
    if (kind === 'april') return `These seats are decided in April, when far fewer people vote. As a high-side stand-in we use this area's November turnout of ${b} voters, which gives ${w}. Real April turnout runs lower, so the true number to win is smaller.`
    const yr = kind === 'mid' ? '2022 midterm' : '2024 presidential'
    return `This race isn't on the ballot yet, so we estimate turnout from the ${yr} election: about ${b} voters. Winning takes more than half, so the target is ${w}. That is half of ${b}, plus one.`
  }
  // next time the seat is on the ballot. 'result' rows carry the LAST election year and these
  // seats are 4-year terms, so next = year + 4; projected rows already carry the upcoming year.
  const nextElection = (year: any, kind: string) => (typeof year === 'number' ? (kind === 'result' ? year + 4 : year) : null)
  const mkRow = (office: string, detail: string, year: any, base: number | null, kind: string) => {
    const win = winFrom(base); return [office, detail, year, win, explain(base, win, kind, year), nextElection(year, kind)]
  }
  const coName = (f: string) => meta.current?.fips2name?.[f] || f
  let raceGroups: any[] | null = null
  const raceFlags = { future: false, cd: false, council: false, county: 0, city: false, school: false }
  const ceLabel = (k: string): [string, string] => k.startsWith('Jackson')
    ? ['Jackson Co. Legislature', 'Dist ' + k.split('-')[1].replace('D', '')]
    : ['St. Louis Co. Council', 'Dist ' + k.split('-')[1].replace('D', '')]
  const cityRace = (k: string): [string, string] => {
    const pre = k.split('-')[0], num = k.split('-')[1]
    const M: Record<string, [string, string]> = { KC: ['Kansas City Council', 'District ' + num], COL: ['Columbia City Council', 'Ward ' + num], STL: ['St. Louis Aldermen', 'Ward ' + num], SPR: ['Springfield Council', 'Zone ' + num], JC: ['Jefferson City Council', 'Ward ' + num] }
    return M[pre] || ['City Council', num]
  }
  // This rich per-office win panel is Missouri-specific (needs the races.xw crosswalk +
  // MO's slate/seats). States without an xw crosswalk (auto-onboarded via election_plan)
  // surface win numbers through the "Campaign viability" panel section instead.
  if (races && races.xw && d) {
    const lvl = info ? infoLevel : 'state'
    const x: any = (races.xw[lvl] || {})[info?.key]
    // single-office / single-filter layers -> show ONLY that race, scoped to the active map filter
    const OFFICE: Record<string, () => any[]> = {
      house: () => [mkRow('State House', 'District ' + (+info.key), 2026, baseOf('house', info.key, 'm'), 'mid')],
      senate: () => { const ev = +info.key % 2 === 0; return [mkRow('State Senate', 'District ' + (+info.key), ev ? 2026 : 2028, baseOf('senate', info.key, ev ? 'm' : 'p'), ev ? 'mid' : 'pres')] },
      cd2025: () => [mkRow('U.S. House — ’25 map', info.key, 2026, baseOf('cd2025', info.key, 'm'), 'mid')],
      cd2022: () => [mkRow('U.S. House — ’22 map', info.key, 2026, baseOf('cd2022', info.key, 'm'), 'mid')],
      county_elec: () => { const [o, dd] = ceLabel(info.key); return [mkRow(o, dd, 2026, baseOf('county_elec', info.key, 'm'), 'mid')] },
      cityward: () => { const [o, dd] = cityRace(info.key); return [mkRow(o, dd, 'Apr', baseOf('cityward', info.key, 'm'), 'april')] },
      school: () => [mkRow('School board', info.name || ('District ' + info.key), 'Apr', baseOf('school', info.key, 'm'), 'april')],
    }
    if (lvl === 'county') {
      // county filter -> ONLY countywide & local races (no federal / state / statewide slate)
      const f = info.key, local: any[] = []
      const co: any = (races.win.county_office || {})[f]
      if (co && Array.isArray(co.offices) && co.offices.length) {
        // real per-office win numbers from county canvass results (votes cast in that race)
        co.offices.forEach((o: any) => local.push(mkRow(o.office, o.year ? '' + o.year : '', o.year || 2026, o.votes ?? null, 'result')))
        raceFlags.county = 2
      } else {
        // no per-office data yet for this county -> countywide turnout win number, by cycle
        local.push(mkRow('Countywide office', 'on the 2026 ballot', 2026, baseOf('county', f, 'm'), 'mid'))
        local.push(mkRow('Countywide office', 'on the 2028 ballot', 2028, baseOf('county', f, 'p'), 'pres'))
        raceFlags.county = 1
      }
      ;(x?.ce || []).forEach((k: string) => { const [o, dd] = ceLabel(k); local.push(mkRow(o, dd, 2026, baseOf('county_elec', k, 'm'), 'mid')) })
      raceGroups = [['Countywide & local', local]]
      raceFlags.council = (x?.ce || []).length > 0
    } else if (OFFICE[lvl]) {
      const rows = OFFICE[lvl]()
      raceGroups = [['Win number — this race', rows]]
      raceFlags.future = rows.some((r: any) => typeof r[2] === 'number' && r[2] !== 2026); raceFlags.cd = lvl.startsWith('cd'); raceFlags.council = lvl === 'county_elec'; raceFlags.city = lvl === 'cityward'; raceFlags.school = lvl === 'school'
    } else {
      // container layers (precinct / township / statewide) -> the full applicable ballot at this spot
      let hds: string[] = [], sds: string[] = [], c25: string[] = [], c22: string[] = [], cos: string[] = [], ces: string[] = []
      if (lvl === 'precinct' || lvl === 'cousub') { hds = x?.h ? [x.h] : []; sds = x?.s ? [x.s] : []; c25 = x?.c ? [x.c] : []; c22 = x?.c2 ? [x.c2] : []; cos = x?.co ? [x.co] : []; ces = x?.ce ? [x.ce] : [] }
      const fed: any[] = [], leg: any[] = [], exec: any[] = [], local: any[] = []
      c25.forEach(c => fed.push(mkRow('U.S. House ’25', c, 2026, baseOf('cd2025', c, 'm'), 'mid')))
      c22.forEach(c => fed.push(mkRow('U.S. House ’22', c, 2026, baseOf('cd2022', c, 'm'), 'mid')))
      fed.push(mkRow('U.S. Senate', 'Schmitt seat', 2028, stBase('p'), 'pres'), mkRow('U.S. Senate', 'Hawley seat', 2030, stBase('m'), 'mid'), mkRow('U.S. President', 'statewide', 2028, stBase('p'), 'pres'))
      hds.forEach(h => leg.push(mkRow('State House', 'District ' + (+h), 2026, baseOf('house', h, 'm'), 'mid')))
      sds.forEach(s => { const ev = +s % 2 === 0; leg.push(mkRow('State Senate', 'District ' + (+s), ev ? 2026 : 2028, baseOf('senate', s, ev ? 'm' : 'p'), ev ? 'mid' : 'pres')) })
      exec.push(mkRow('State Auditor', 'statewide', 2026, stBase('m'), 'mid'))
      ;['Governor', 'Lt. Governor', 'Secretary of State', 'State Treasurer', 'Attorney General'].forEach(o => exec.push(mkRow(o, 'statewide', 2028, stBase('p'), 'pres')))
      ces.forEach(k => { const [o, dd] = ceLabel(k); local.push(mkRow(o, dd, 2026, baseOf('county_elec', k, 'm'), 'mid')) })
      cos.forEach(f => local.push(mkRow('Countywide offices', coName(f), 2026, baseOf('county', f, 'm'), 'mid')))
      raceGroups = ([['Federal', fed], ['State legislative', leg], ['Statewide executive', exec], ['Local', local]] as any[]).filter(([, r]) => (r as any[]).length)
      raceFlags.future = true; raceFlags.cd = c25.length > 0 || c22.length > 0; raceFlags.council = ces.length > 0; raceFlags.county = cos.length > 0 ? 1 : 0
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TopBarPortal>
        <div className="flex items-stretch divide-x divide-terminal-border h-full w-full">
          {/* Block 0 — state selector (only states computed + in the database) */}
          <div className="px-3 py-2 shrink-0 flex flex-col justify-center">
            <BlockLabel>State</BlockLabel>
            <select
              value={CUR_STATE}
              onChange={e => { const u = new URL(window.location.href); u.searchParams.set('state', e.target.value); window.location.href = u.toString() }}
              aria-label="Select state"
              className="mt-1 bg-terminal-panel border border-terminal-border rounded px-2 py-1 text-[12px] font-display font-semibold text-terminal-text focus:outline-none focus:ring-1 focus:ring-terminal-accent cursor-pointer"
            >
              {(statesList.length ? statesList : [{ po: CUR_STATE, name: stateName }]).map(s => (
                <option key={s.po} value={s.po}>{s.name}</option>
              ))}
            </select>
          </div>
          {/* Block 1 — map layer (+ drill-down) */}
          <div className="px-3 py-2 flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <BlockLabel>{mode === 'county' ? `Inside ${selName}` : 'Map layer'}</BlockLabel>
              {mode === 'county' && <button onClick={() => showLevel('county')} className="text-[10px] text-terminal-accent hover:underline whitespace-nowrap">← back to state</button>}
            </div>
            <Seg items={levels} active={topLevel} onPick={showLevel} />
            {mode === 'county' && (
              <div className="mt-1.5">
                <div className="text-[9px] uppercase tracking-widest text-terminal-accent font-semibold mb-1">Within {selName} ▾</div>
                <Seg items={subList} active={activeSub} onPick={showSub} />
              </div>
            )}
          </div>
          {/* Block 2 — color by */}
          <div className="px-3 py-2 flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <BlockLabel>{forecastMode ? '2026 Forecast' : 'DPI'} scale</BlockLabel>
              <ForecastToggle on={forecastMode} />
            </div>
            <Seg items={SEG_METRIC_IDS.map(id => ({ id, label: METRICS[id].label }))} active={metric} onPick={applyMetric}
              tips={Object.fromEntries(SEG_METRIC_IDS.map(id => [id, METRICS[id].note]))} />
          </div>
          {/* Block 3 — color guide */}
          <div className="px-3 py-2 flex-1 min-w-0">
            <BlockLabel>{METRICS[metric].label} guide</BlockLabel>
            <div className="h-2.5 rounded" style={{ background: legendGradient(metric) }} />
            <div className="flex justify-between text-[9.5px] text-terminal-muted mt-0.5">
              {(() => { const s = RAMPS[metric]; const idxs = [...new Set([0, Math.floor((s.length - 1) / 2), s.length - 1])]; return idxs.map(i => <span key={i}>{s[i][0]}{METRICS[metric].tick}</span>) })()}
            </div>
            <div className="text-[10px] text-terminal-muted mt-1 leading-snug line-clamp-2">{METRICS[metric].note}</div>
          </div>
        </div>
      </TopBarPortal>

      <div className="flex flex-1 min-h-0">
        {/* data-table panel */}
        <aside ref={panelRef} className="dpi-panel w-[345px] flex-shrink-0 overflow-y-auto relative bg-terminal-panel border-r border-terminal-border">
          {!d ? (
            <div className="p-4 text-terminal-muted text-[12px]">Loading…</div>
          ) : (
            <div className="p-4 pb-6">
              {/* ── Header: region name + DPI hero ── */}
              <div className="flex items-center justify-between gap-2">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-terminal-muted font-body font-semibold">{info ? 'Selected region' : 'Statewide'}</div>
                {info && <button onClick={() => { setInfo(null); setInfoLevel(''); hideBubble() }} className="text-[10px] text-terminal-accent hover:underline whitespace-nowrap font-body">✕ statewide</button>}
              </div>
              <h2 className="font-display font-bold text-[17px] mt-0.5 leading-tight tracking-tight">{d.name || d.key}</h2>

              <div className="dpi-hero mt-3 rounded-xl border border-terminal-border p-3"
                onMouseEnter={(e) => showBubble(e.currentTarget, 'The Democratic Performance Index is our single 0–100 score for how this area votes in a neutral election. 50 is a dead-even split. Above 50 leans Democratic, below 50 leans Republican. It blends recent election results, adjusted so a balanced national year is the baseline.')}
                onMouseLeave={hideBubble} tabIndex={0}
                onFocus={(e) => showBubble(e.currentTarget, 'The Democratic Performance Index is our single 0–100 score for how this area votes in a neutral election. 50 is a dead-even split. Above 50 leans Democratic, below 50 leans Republican. It blends recent election results, adjusted so a balanced national year is the baseline.')}
                onBlur={hideBubble}
                style={{ borderLeft: `3px solid ${lc}` }}>
                <div className="flex items-center gap-3">
                  <span className="text-[40px] leading-[0.9] font-display font-extrabold tabular-nums transition-opacity duration-300"
                    style={{ color: lc, opacity: forecastMode ? 0.4 : 1 }}>{d.dpi == null ? '—' : (+d.dpi).toFixed(1)}</span>
                  <div className="min-w-0">
                    <span className="inline-block px-2.5 py-[3px] rounded-full text-[11px] font-display font-bold tracking-wide transition-opacity duration-300"
                      style={{ background: lc, color: '#fff', opacity: forecastMode ? 0.5 : 1 }}>{ln}</span>
                    <div className="text-[10px] text-terminal-muted mt-1 leading-snug font-body">Democratic Performance Index — expected Democratic share of the two-party vote in an even election.</div>
                  </div>
                </div>
                {fcVal != null && (
                  <div className="mt-2.5 pt-2.5 border-t border-terminal-border flex items-baseline gap-1.5 transition-opacity duration-300"
                    style={{ opacity: forecastMode ? 1 : 0.5 }}>
                    <span className="text-[10px] uppercase tracking-wider text-terminal-muted font-body font-semibold">2026 forecast</span>
                    <span className="font-display font-bold tabular-nums text-[15px]" style={{ color: forecastMode ? lc : 'var(--color-muted)' }}>{fcVal.toFixed(1)}</span>
                    {fcGap != null && (
                      <span className="font-mono font-semibold tabular-nums text-[12px]" style={{ color: fcGapColor }}>
                        ({fcGap >= 0 ? '+' : ''}{fcGap.toFixed(1)})
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* ── Stat sections ── */}
              {sections.map((s: any) => (
                <section key={s.t} className="mt-4">
                  <div className="dpi-sec-head">{s.t}</div>
                  <div className="dpi-table rounded-lg border border-terminal-border overflow-hidden">
                    {s.r.map(([k, v, ex]: any, i: number) => (
                      <div key={k} tabIndex={0}
                        className={`dpi-row group flex items-baseline gap-2 px-2.5 py-[7px] text-[12.5px] ${i ? 'border-t border-terminal-border' : ''}`}
                        onMouseEnter={ex ? (e) => showBubble(e.currentTarget, ex) : undefined}
                        onMouseLeave={ex ? hideBubble : undefined}
                        onFocus={ex ? (e) => showBubble(e.currentTarget, ex) : undefined}
                        onBlur={ex ? hideBubble : undefined}>
                        <span className="flex-1 min-w-0 text-terminal-muted font-body leading-snug">{k}</span>
                        <span className="font-mono font-semibold tabular-nums whitespace-nowrap text-right text-terminal-text">{v}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              {/* ── Win numbers ── */}
              {raceGroups && raceGroups.length > 0 && (
                <section className="mt-5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-block w-[3px] h-[14px] rounded-full bg-terminal-accent" />
                    <span className="text-[11px] uppercase tracking-[0.14em] text-terminal-accent font-display font-bold">Win numbers</span>
                    <span className="text-[10px] text-terminal-muted font-body">votes to win</span>
                  </div>
                  {raceGroups.map(([g, rows]: any) => (
                    <div key={g} className="mt-2.5">
                      <div className="dpi-grp-head">{g}</div>
                      <div className="dpi-table rounded-lg border border-terminal-border overflow-hidden">
                        {rows.map(([o, dd, y, w, ex, nx]: any, i: number) => {
                          const y26 = y === 2026
                          const yLabel = typeof y === 'number' ? '’' + String(y).slice(2) : y
                          return (
                            <div key={o + dd + i} tabIndex={0}
                              className={`dpi-row group flex items-center gap-2 px-2.5 py-[7px] text-[12px] ${i ? 'border-t border-terminal-border' : ''}`}
                              onMouseEnter={ex ? (e) => showBubble(e.currentTarget, ex, nx) : undefined}
                              onMouseLeave={ex ? hideBubble : undefined}
                              onFocus={ex ? (e) => showBubble(e.currentTarget, ex, nx) : undefined}
                              onBlur={ex ? hideBubble : undefined}>
                              <div className="flex-1 min-w-0 leading-tight">
                                <div className="font-body font-semibold text-terminal-text truncate">{o}</div>
                                {dd && <div className="font-body text-[10.5px] text-terminal-muted truncate">{dd}</div>}
                              </div>
                              <span className="dpi-yr flex-shrink-0" data-y26={y26 ? '1' : '0'}>{yLabel}</span>
                              <span className="font-mono font-bold tabular-nums text-[13.5px] whitespace-nowrap flex-shrink-0 text-terminal-text">{w == null ? '—' : w.toLocaleString()}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="text-[10px] text-terminal-muted mt-3 leading-relaxed font-body space-y-1.5">
                    <div><b className="text-terminal-text">Win number</b> = 50%+1 of projected turnout. Hover any row for the plain-English math. Midterm races (<b style={{ color: 'var(--color-green)' }}>’26</b>/’30) modeled on 2022 turnout; presidential-year (’28) on 2024.</div>
                    {raceFlags.future && <div>Only <b style={{ color: 'var(--color-green)' }}>’26</b> races are on the 2026 ballot. <b style={{ color: 'var(--color-accent)' }}>’28</b> = odd-numbered Senate districts, statewide executives, President & one U.S. Senate seat. <b style={{ color: 'var(--color-accent)' }}>’30</b> = the other U.S. Senate seat.</div>}
                    {raceFlags.cd && <div>Congressional figure uses the 2025-enacted map (in effect for 2026, pending the <i>People Not Politicians</i> referendum); where shown, the prior 2022 map is included too.</div>}
                    {raceFlags.council && <div>County council/legislature seats are partisan November races on staggered 4-year terms; figure uses 2022 turnout.</div>}
                    {raceFlags.city && <div><b>Apr</b> = municipal council races are <b>April nonpartisan</b> elections. The figure is a <b>high-side proxy</b> from November-general turnout — actual April municipal turnout is much lower.</div>}
                    {raceFlags.county === 2 && <div>Each countywide office shows its own win number from the most recent canvassed results for that race (50%+1 of the votes actually cast in that office's election). Down-ballot rolloff is captured because the count is that race's real total, not countywide turnout.</div>}
                    {raceFlags.county === 1 && <div>Countywide offices are partisan 4-year terms split between the 2026 and 2028 ballots; each figure is that year's countywide turnout win number. Per-office canvass results are not loaded for this county yet, so down-ballot rolloff is not modeled.</div>}
                    {raceFlags.school && <div><b>Apr</b> = school-board seats are <b>April nonpartisan</b> elections. The figure is a <b>high-side proxy</b> from November-general turnout in the district; actual April school-board turnout is much lower.</div>}
                  </div>
                </section>
              )}

              <div className="text-[10.5px] text-terminal-muted mt-5 pt-3 border-t border-terminal-border leading-relaxed font-body">
                {info
                  ? 'Hover any row above for a plain-English explanation. Click another region, or “statewide”.'
                  : 'Click any region on the map to see its full statistics here, then hover a row for the math. In County view, click a county to drill into precincts, townships, and school districts.'}
              </div>

              <DataSourcesCredit />
            </div>
          )}

          {/* ── connected explanation bubble (Job 1) ── */}
          {bubble && (
            <div className={`dpi-bubble ${bubble.below ? 'is-below' : 'is-above'}`} style={{ top: bubble.top }} aria-hidden>
              <span className="dpi-bubble-tail" style={{ left: bubble.tailX }} />
              {bubble.text}
              {bubble.nextUp && (
                <span className="dpi-bubble-next">
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>
                  Next on the ballot <b>{bubble.nextUp}</b>
                </span>
              )}
            </div>
          )}
        </aside>

        {/* map */}
        <div className="flex-1 relative min-w-0">
          <div ref={mapEl} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />

          {/* ── Seat outlook — corner highlight controls (bottom-left, clear of zoom top-right) ── */}
          <div className="absolute z-10 left-2.5 bottom-7 border border-terminal-border rounded-lg px-2 py-1.5 shadow-lg backdrop-blur-md select-none"
            style={{ background: 'var(--panel-glass)' }}>
            <div className="text-[9px] uppercase tracking-[0.14em] text-terminal-muted font-semibold mb-1 px-0.5">Seat outlook</div>
            <div className="flex flex-col gap-0.5 w-[150px]">
              {SEAT_BANDS.map(bnd => {
                const on = seatActive.includes(bnd.id)
                return (
                  <button key={bnd.id} type="button" onClick={() => toggleSeat(bnd.id)}
                    aria-pressed={on}
                    title={on ? `Clear ${bnd.label} outlines` : `Outline ${bnd.label} seats`}
                    className="flex items-center gap-1.5 w-full text-left rounded-md px-1.5 py-1 text-[11px] border transition-colors hover:bg-terminal-bg/60"
                    style={on
                      ? { borderColor: bnd.line, background: 'rgba(127,127,127,0.10)', boxShadow: `inset 0 0 0 1px ${bnd.line}` }
                      : { borderColor: 'transparent', background: 'transparent' }}>
                    <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: bnd.dot }} />
                    <span className="font-mono font-bold tabular-nums text-terminal-text w-7 text-right flex-shrink-0">{seatCounts[bnd.id]}</span>
                    <span className="text-terminal-muted flex-1 truncate">{bnd.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {loading && <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-terminal-panel border border-terminal-border rounded-full px-3.5 py-1.5 text-xs text-terminal-muted">Loading…</div>}
          {tip && (
            <div className="absolute z-10 pointer-events-none bg-terminal-panel border border-terminal-border rounded-lg px-2.5 py-1.5 shadow-lg max-w-[240px]"
              style={{ left: Math.min(tip.x + 14, (mapEl.current?.clientWidth || 9999) - 250), top: tip.y + 14 }}
              dangerouslySetInnerHTML={{ __html: tip.html }} />
          )}
        </div>
      </div>
    </div>
  )
}
