import { createContext, useContext, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Pt, cssVar, isDarkTheme, sampleImageToPts, makePageFieldPts } from '../lib/particles'

/* ============================================================
   MorphOverlay — brand particle transitions, done the reliable/crisp way.

   The whole transition plays on a SOLID brand backdrop (so the page underneath
   is never visible mid-animation), out of which fine, soft, ROUND dust either
   GATHERS into the crisp logo or BURSTS out of it. Only at the very end does the
   backdrop fade away to reveal the real (crisp DOM) page, while the real corner
   logo crossfades in. No html2canvas / no screenshots — nothing flaky.

   Flows:
   - Password -> Home:  logo (center) bursts into dust, backdrop clears to home.
   - Home -> any tool:  dust gathers from across the screen into the corner logo,
                        backdrop clears to the destination.
   - logo -> Home:      corner logo bursts into dust, backdrop clears to home.
   ============================================================ */

interface MorphApi {
  setLogoEl: (el: HTMLImageElement | null) => void
  onHomeMount: () => void
  returnHome: () => void
  beginUnlock: () => void
}

const Ctx = createContext<MorphApi | null>(null)
export function useMorph(): MorphApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useMorph must be used inside MorphProvider')
  return ctx
}

function prefersReduced(): boolean {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}
function nextFrame(): Promise<void> { return new Promise((r) => requestAnimationFrame(() => r())) }
function fontsReady(): Promise<void> {
  return (document.fonts && document.fonts.ready) ? document.fonts.ready.then(() => undefined, () => undefined) : Promise.resolve()
}

function parseColor(c: string): [number, number, number] {
  const rgb = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(c)
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]]
  let h = c.trim()
  if (h[0] === '#') {
    h = h.slice(1)
    if (h.length === 3) h = h.split('').map((x) => x + x).join('')
    if (h.length >= 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  return [120, 120, 120]
}
function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`
}
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
function clamp01(t: number) { return t < 0 ? 0 : t > 1 ? 1 : t }

interface RP { lx: number; ly: number; fc: [number, number, number]; scx: number; scy: number; sc: [number, number, number]; seed: number; r: number }

export function MorphProvider({ children }: { children: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const logoElRef = useRef<HTMLImageElement | null>(null)
  const rafRef = useRef<number>(0)
  const pendingReturnRef = useRef(false)
  const pendingUnlockRef = useRef(false)
  const prevPathRef = useRef<string | null>(null)

  const location = useLocation()
  const navigate = useNavigate()

  const setLogoEl = useCallback((el: HTMLImageElement | null) => { logoElRef.current = el }, [])

  function prep(): { ctx: CanvasRenderingContext2D; W: number; H: number } | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth, H = window.innerHeight
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return { ctx, W, H }
  }
  function clearCanvas() {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (c && ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height) }
  }
  function cancel() { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = 0 }

  function setLogoVisible(v: boolean, animated: boolean) {
    const el = logoElRef.current
    if (!el) return
    el.style.transition = animated ? 'opacity 0.4s ease' : 'none'
    el.style.opacity = v ? '1' : '0'
  }

  function fillVeil(ctx: CanvasRenderingContext2D, W: number, H: number, alpha: number) {
    if (alpha <= 0.003) return
    const bg = parseColor(cssVar('--color-bg', '#ffffff'))
    ctx.globalAlpha = alpha
    ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 1
  }

  // Sample the logo image at an arbitrary on-screen box (crisp, dense).
  function logoPointsAt(left: number, top: number, w: number, h: number): Pt[] | null {
    const el = logoElRef.current
    if (!el || !el.complete || !el.naturalWidth || w < 4 || h < 4) return null
    const remap = isDarkTheme() ? cssVar('--color-text', '#e6e8ec') : null
    return sampleImageToPts(el, w, h, left, top, { step: 2, skipWhite: true, darkRemap: remap })
  }
  function cornerLogoPoints(): Pt[] | null {
    const el = logoElRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    return logoPointsAt(r.left, r.top, r.width, r.height)
  }
  function centerLogoPoints(W: number, H: number): Pt[] | null {
    const el = logoElRef.current
    if (!el || !el.naturalWidth) return null
    const w = Math.min(W * 0.34, 280)
    const h = w * (el.naturalHeight / el.naturalWidth || 0.45)
    return logoPointsAt((W - w) / 2, (H - h) / 2 - 16, w, h)
  }

  /* Core: dust GATHERS into the logo (mode 'gather') or BURSTS out of it
     (mode 'burst'). Plays on an opaque veil; the veil fades at the end to reveal
     the real page, and the real corner logo crossfades in. */
  function runDust(logoPts: Pt[], mode: 'gather' | 'burst', onDone?: () => void) {
    const p = prep()
    if (!p || !logoPts.length) { setLogoVisible(true, false); clearCanvas(); onDone?.(); return }
    const { ctx, W, H } = p
    // Density scales with viewport area: gap stays 15 (current density) on
    // phones/laptops, then widens on very large monitors so the total particle
    // count plateaus near ~9000 instead of ballooning (a 4K screen would
    // otherwise spawn ~30k+). Small/low-area viewports keep producing fewer
    // points exactly as before. Reverse by restoring: makePageFieldPts(W, H, 15)
    const gap = Math.max(15, Math.sqrt((W * H) / 9000))
    const field = makePageFieldPts(W, H, gap)
    if (!field.length) { setLogoVisible(true, false); clearCanvas(); onDone?.(); return }
    const N = Math.max(logoPts.length, field.length)

    let seed = 9
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    const ps: RP[] = new Array(N)
    for (let i = 0; i < N; i++) {
      const lp = logoPts[i % logoPts.length]
      const sp = field[i % field.length]
      ps[i] = { lx: lp.x, ly: lp.y, fc: parseColor(lp.color), scx: sp.x, scy: sp.y, sc: parseColor(sp.color), seed: rnd(), r: 0.9 + rnd() * 1.0 }
    }

    const DUST = 950, REVEAL = 440
    const start = performance.now()
    const total = DUST + REVEAL
    let logoShown = false

    function frame(now: number) {
      const t = now - start
      ctx.clearRect(0, 0, W, H)
      const dustP = clamp01(t / DUST)
      const revealP = t > DUST ? clamp01((t - DUST) / REVEAL) : 0

      // opaque backdrop during the dust, fades only at the very end
      fillVeil(ctx, W, H, 1 - revealP)
      if (!logoShown && revealP > 0) { logoShown = true; setLogoVisible(true, true) }

      for (let i = 0; i < N; i++) {
        const q = ps[i]
        let x: number, y: number, color: string, a: number
        if (mode === 'gather') {
          const local = clamp01((easeInOut(dustP) - q.seed * 0.22) / 0.78)
          const bow = Math.sin(local * Math.PI) * (12 + q.seed * 60)
          x = q.scx + (q.lx - q.scx) * local + bow * (q.seed - 0.5)
          y = q.scy + (q.ly - q.scy) * local - bow * (0.5 - q.seed)
          color = lerpColor(q.sc, q.fc, local)
          a = (0.25 + 0.75 * local) * (1 - revealP) // bright as the logo forms, fades on reveal
        } else {
          const local = clamp01((easeOut(dustP) - q.seed * 0.18) / 0.82)
          const bow = Math.sin(local * Math.PI) * (12 + q.seed * 60)
          x = q.lx + (q.scx - q.lx) * local + bow * (q.seed - 0.5)
          y = q.ly + (q.scy - q.ly) * local - bow * (0.5 - q.seed)
          color = lerpColor(q.fc, q.sc, local)
          a = (1 - 0.7 * local) * (1 - revealP) // bright logo, fades as it scatters / reveals
        }
        if (a <= 0.02) continue
        ctx.globalAlpha = a
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, q.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      if (t < total) rafRef.current = requestAnimationFrame(frame)
      else { setLogoVisible(true, true); clearCanvas(); rafRef.current = 0; onDone?.() }
    }
    cancel()
    rafRef.current = requestAnimationFrame(frame)
  }

  // ---- entry morph on Home mount (unlock or return) ----
  const onHomeMount = useCallback(() => {
    if (prefersReduced()) { pendingReturnRef.current = false; pendingUnlockRef.current = false; setLogoVisible(true, false); return }
    const doingUnlock = pendingUnlockRef.current
    const doingReturn = !doingUnlock && pendingReturnRef.current
    if (!doingUnlock && !doingReturn) { setLogoVisible(true, false); return }

    // synchronous opaque cover (before paint) so the bare home never flashes
    const c = prep(); if (c) fillVeil(c.ctx, c.W, c.H, 1)
    setLogoVisible(false, false)

    const run = async () => {
      await fontsReady(); await nextFrame()
      const p = prep(); const W = p?.W ?? window.innerWidth, H = p?.H ?? window.innerHeight
      if (p) fillVeil(p.ctx, W, H, 1) // keep covered
      if (doingUnlock) {
        pendingUnlockRef.current = false
        const logo = centerLogoPoints(W, H)
        if (logo) runDust(logo, 'burst'); else { setLogoVisible(true, false); clearCanvas() }
      } else {
        pendingReturnRef.current = false
        const logo = cornerLogoPoints()
        if (logo) runDust(logo, 'burst'); else { setLogoVisible(true, false); clearCanvas() }
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const returnHome = useCallback(() => {
    if (location.pathname === '/') return
    pendingReturnRef.current = true
    navigate('/')
  }, [location.pathname, navigate])

  const beginUnlock = useCallback(() => {
    if (prefersReduced()) return
    pendingUnlockRef.current = true
  }, [])

  // ---- leaving Home -> dust gathers into the corner logo ----
  useLayoutEffect(() => {
    const prev = prevPathRef.current
    const cur = location.pathname
    prevPathRef.current = cur
    if (prev === null || prev !== '/' || cur === '/' || prefersReduced()) return

    const c = prep(); if (c) fillVeil(c.ctx, c.W, c.H, 1) // sync opaque cover over the destination

    ;(async () => {
      await nextFrame() // let the destination top bar lay out so the logo rect is right
      const p = prep(); if (p) fillVeil(p.ctx, p.W, p.H, 1)
      const logo = cornerLogoPoints()
      if (!logo || !logo.length) { clearCanvas(); return }
      setLogoVisible(false, false)
      runDust(logo, 'gather')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  useEffect(() => () => cancel(), [])

  const api: MorphApi = { setLogoEl, onHomeMount, returnHome, beginUnlock }

  return (
    <Ctx.Provider value={api}>
      {children}
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 70 }} aria-hidden="true" />
    </Ctx.Provider>
  )
}
