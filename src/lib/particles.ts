/* ============================================================
   Particle sampling helpers — shared by the brand hero intro and
   the home <-> corner-logo morph transition.

   Everything works in CLIENT (viewport) coordinates so a single
   full-viewport overlay canvas at (0,0) can draw them directly.
   ============================================================ */

export interface Pt { x: number; y: number; color: string }

export function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export function isDarkTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') !== 'day'
}

/** Sample the visible pixels of an offscreen canvas into colored points. */
export function sampleCanvas(
  octx: CanvasRenderingContext2D,
  w: number,
  h: number,
  step: number,
  skipWhite: boolean,
): Pt[] {
  const data = octx.getImageData(0, 0, w, h).data
  const pts: Pt[] = []
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      if (data[i + 3] < 150) continue
      const r = data[i], g = data[i + 1], b = data[i + 2]
      if (skipWhite && r > 244 && g > 244 && b > 244) continue
      pts.push({ x, y, color: 'rgb(' + r + ',' + g + ',' + b + ')' })
    }
  }
  return pts
}

interface ImageSampleOpts {
  step?: number
  skipWhite?: boolean
  /** When set, near-black pixels are remapped to this color (keeps logo visible on dark theme). */
  darkRemap?: string | null
}

/** Draw a loaded image at a destination box and sample it into client-coord points. */
export function sampleImageToPts(
  img: HTMLImageElement,
  destW: number,
  destH: number,
  originX: number,
  originY: number,
  opts: ImageSampleOpts = {},
): Pt[] | null {
  const w = Math.max(1, Math.round(destW))
  const h = Math.max(1, Math.round(destH))
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const octx = off.getContext('2d')
  if (!octx) return null
  octx.drawImage(img, 0, 0, w, h)

  let pts: Pt[]
  try {
    const step = opts.step ?? Math.max(2, Math.round(w / 150))
    pts = sampleCanvas(octx, w, h, step, opts.skipWhite ?? true)
  } catch {
    return null
  }

  const remap = opts.darkRemap
  for (let i = 0; i < pts.length; i++) {
    pts[i].x += originX
    pts[i].y += originY
    if (remap) {
      const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(pts[i].color)
      if (m && Math.max(+m[1], +m[2], +m[3]) < 80) pts[i].color = remap
    }
  }
  return pts
}

/** Measure a live headline (with .line / <em> structure) per word and sample its
    rendered glyphs into client-coord points. em words take the blue color. */
export function sampleHeadlinePts(h1: HTMLElement, vw: number, vh: number, step = 3): Pt[] {
  const cs = window.getComputedStyle(h1)
  const fontSizePx = parseFloat(cs.fontSize) || 40

  const off = document.createElement('canvas')
  off.width = Math.max(1, Math.round(vw))
  off.height = Math.max(1, Math.round(vh))
  const octx = off.getContext('2d')
  if (!octx) return []
  octx.textBaseline = 'alphabetic'
  octx.textAlign = 'left'
  octx.font = `${cs.fontWeight || '900'} ${cs.fontSize} ${cs.fontFamily}`
  try { octx.letterSpacing = (fontSizePx * -0.02) + 'px' } catch { /* not all browsers */ }

  const ink = cssVar('--color-text', '#15171a')
  const blue = cssVar('--color-blue', '#0f4fc9')

  const fm = octx.measureText('Hg')
  const asc = fm.fontBoundingBoxAscent || fontSizePx * 0.8
  const desc = fm.fontBoundingBoxDescent || fontSizePx * 0.22

  interface Tok { node: Node; start: number; end: number; color: string }
  const tokens: Tok[] = []
  const pushWords = (textNode: Node, color: string) => {
    const text = textNode.nodeValue || ''
    const re = /\S+/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) tokens.push({ node: textNode, start: m.index, end: m.index + m[0].length, color })
  }
  h1.querySelectorAll('.line').forEach((line) => {
    line.childNodes.forEach((node) => {
      if (node.nodeType === 3) {
        pushWords(node, ink)
      } else if (node.nodeType === 1) {
        const color = (node as Element).tagName === 'EM' ? blue : ink
        node.childNodes.forEach((cn) => { if (cn.nodeType === 3) pushWords(cn, color) })
      }
    })
  })

  for (const tk of tokens) {
    let rect: DOMRect
    try {
      const range = document.createRange()
      range.setStart(tk.node, tk.start)
      range.setEnd(tk.node, tk.end)
      rect = range.getBoundingClientRect()
    } catch { continue }
    if (!rect || (rect.width === 0 && rect.height === 0)) continue
    const word = (tk.node.nodeValue || '').slice(tk.start, tk.end)
    const baseY = rect.top + (rect.height - (asc + desc)) / 2 + asc
    octx.fillStyle = tk.color
    octx.fillText(word, rect.left, baseY)
  }

  try { return sampleCanvas(octx, off.width, off.height, step, false) }
  catch { return [] }
}

/** Sample an already-rendered canvas (e.g. an html2canvas snapshot of the
    viewport) into a mosaic of colored points. The returned `step` doubles as the
    particle size so the assembled cloud reads as the page, not loose dust.
    Coordinates are in CLIENT px (snapshot is captured at scale 1, origin 0,0). */
export function rasterToPts(src: HTMLCanvasElement, targetCount: number): { pts: Pt[]; step: number } {
  const w = src.width, h = src.height
  const octx = src.getContext('2d')
  if (!octx || w < 2 || h < 2) return { pts: [], step: 8 }
  let data: Uint8ClampedArray
  try { data = octx.getImageData(0, 0, w, h).data } catch { return { pts: [], step: 8 } }
  const step = Math.max(4, Math.round(Math.sqrt((w * h) / Math.max(1, targetCount))))
  const pts: Pt[] = []
  for (let y = Math.floor(step / 2); y < h; y += step) {
    for (let x = Math.floor(step / 2); x < w; x += step) {
      const i = (y * w + x) * 4
      if (data[i + 3] < 24) continue // skip fully transparent
      pts.push({ x, y, color: 'rgb(' + data[i] + ',' + data[i + 1] + ',' + data[i + 2] + ')' })
    }
  }
  return { pts, step }
}

/** Randomly sample `count` opaque pixels from a rendered snapshot canvas into
    dust points (client px; pass the capture `scale` to convert back from device px).
    Random (not grid) sampling reads as organic dust, not a tiled mosaic. */
export function sampleSnapshotPoints(src: HTMLCanvasElement, count: number, scale = 1): Pt[] {
  const w = src.width, h = src.height
  const octx = src.getContext('2d')
  if (!octx || w < 2 || h < 2) return []
  let data: Uint8ClampedArray
  try { data = octx.getImageData(0, 0, w, h).data } catch { return [] }
  const pts: Pt[] = []
  let s = 2246
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  let tries = 0
  const maxTries = count * 8
  while (pts.length < count && tries < maxTries) {
    tries++
    const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h)
    const i = (y * w + x) * 4
    if (data[i + 3] < 24) continue
    pts.push({ x: x / scale, y: y / scale, color: 'rgb(' + data[i] + ',' + data[i + 1] + ',' + data[i + 2] + ')' })
  }
  return pts
}

/** A generated full-viewport "dust field" that READS as the page without
    rasterizing it — a jittered grid in the muted text color, sprinkled with
    brand red/blue. Used as the morph's page-side shape (cheap, never re-rastered). */
export function makePageFieldPts(vw: number, vh: number, gap = 22): Pt[] {
  const base = cssVar('--color-text', '#15171a')
  const muted = cssVar('--color-muted', '#6b7280')
  const red = cssVar('--color-accent', '#ce1b2c')
  const blue = cssVar('--color-blue', '#0f4fc9')
  const pts: Pt[] = []
  // Deterministic-ish jitter without Math.random per-cell dependence on order:
  let seed = 1
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  for (let y = gap; y < vh - gap; y += gap) {
    for (let x = gap; x < vw - gap; x += gap) {
      const r = rnd()
      // Skip a few cells so the field breathes.
      if (r > 0.86) continue
      const jx = (rnd() - 0.5) * gap * 0.8
      const jy = (rnd() - 0.5) * gap * 0.8
      let color = r < 0.62 ? muted : base
      const a = rnd()
      if (a > 0.97) color = red
      else if (a > 0.94) color = blue
      pts.push({ x: x + jx, y: y + jy, color })
    }
  }
  return pts
}
