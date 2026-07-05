import { useState, useEffect, useMemo, useRef } from 'react'
import { TopBarPortal } from '../lib/topbar'

type ButtonAlign = 'left' | 'center' | 'right' | 'justify'

interface DonationTier {
  amount: string   // e.g. "$7"
  suffix: string   // e.g. "/ month" or "" for one-time
  impact: string   // e.g. "a digital ad seen by 200 voters in your district"
}

type CardWidth = 'full' | 'wide' | 'standard' | 'tight'
type CtaSize = 'compact' | 'standard' | 'generous'

interface DonationsData {
  heading: string             // optional intro line above tier stack
  cta_label: string           // big button label, e.g. "CHIP IN TODAY"
  tiers: DonationTier[]       // 1–4 rows
  card_width?: CardWidth      // tier-card width within the email column. Default: 'full' (100%)
  cta_size?: CtaSize          // CTA button padding/font scale. Default: 'standard'
}

// Tier card widths as percentages of the email column. The card table uses
// "margin: 0 auto" so anything less than 100% is centered.
const CARD_WIDTH_PCT: Record<CardWidth, number> = {
  full: 100,
  wide: 85,
  standard: 70,
  tight: 55,
}

// CTA button padding + font sizes by tier. Compact reduces both; generous
// gives a bigger, more presidential feel. Standard matches the Slisz spec.
const CTA_SIZE_SPEC: Record<CtaSize, { padding: string; fontSize: string }> = {
  compact:   { padding: '12px 28px', fontSize: '14px' },
  standard:  { padding: '18px 44px', fontSize: '17px' },
  generous:  { padding: '24px 60px', fontSize: '19px' },
}

const MAX_TIERS = 4

// Image frames the user can apply to inserted photos. Email-safe — `circle`
// and `rounded` use border-radius (degrades to square in Outlook), border
// frames use solid borders in the brand primary color, `polaroid` wraps in a
// white card with a soft shadow.
type ImageFrame = 'none' | 'thin' | 'thick' | 'polaroid' | 'rounded' | 'circle' | 'thick-circle'

const IMAGE_FRAMES: { id: ImageFrame; label: string; tip: string }[] = [
  { id: 'none',         label: 'None',         tip: 'No frame' },
  { id: 'thin',         label: 'Thin',         tip: '2px solid border in your brand primary color' },
  { id: 'thick',        label: 'Thick',        tip: '5px solid border in your brand primary color' },
  { id: 'polaroid',     label: 'Polaroid',     tip: 'White card with soft shadow — retro / casual feel' },
  { id: 'rounded',      label: 'Rounded',      tip: '8px rounded corners (degrades to square in Outlook)' },
  { id: 'circle',       label: 'Circle',       tip: 'Round mask — best for square headshots in the signature' },
  { id: 'thick-circle', label: 'Thick circle', tip: 'Round mask with a 4px brand-color border — bordered headshot' },
]
const VALID_FRAMES = new Set(IMAGE_FRAMES.map(f => f.id))

// Inline style block applied directly to the <img> for the simple frames.
// Polaroid is wrapper-based and handled separately. `box-sizing: border-box`
// is added in callers so a 100%-width image with a border doesn't overflow
// its cell into the adjacent text column on left/right split layouts.
function frameImageStyle(frame: ImageFrame, primaryColor: string): string {
  switch (frame) {
    case 'thin':         return `border:2px solid ${primaryColor};box-sizing:border-box;`
    case 'thick':        return `border:5px solid ${primaryColor};box-sizing:border-box;`
    case 'rounded':      return 'border-radius:8px;'
    case 'circle':       return 'border-radius:50%;'
    case 'thick-circle': return `border:4px solid ${primaryColor};border-radius:50%;box-sizing:border-box;`
    default:             return ''
  }
}

// Decorative section dividers the user can drop between paragraphs. Each
// style has an id (used in the markdown token / placeholder data-attr), a
// label for the picker, a tiny preview shown in the editor, and a render
// function that produces email-safe HTML. Color callers come from the
// active brand so dividers stay on-palette per email.
type DividerStyleId = 'stars-3' | 'stars-5' | 'hairline' | 'double-rule' | 'diamond' | 'dots' | 'bar'

interface DividerStyle {
  id: DividerStyleId
  label: string
  preview: string  // shown in the picker; plain text or short HTML
  render: (primary: string, secondary: string) => string
}

const DIVIDER_STYLES: DividerStyle[] = [
  {
    id: 'stars-3', label: 'Three stars', preview: '★ ★ ★',
    render: (_p, s) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;border-collapse:separate;"><tr><td align="center" style="font-family:Helvetica,Arial,sans-serif;letter-spacing:6px;color:${s};font-size:14px;line-height:1;">&#9733; &#9733; &#9733;</td></tr></table>`,
  },
  {
    id: 'stars-5', label: 'Five stars', preview: '★ ★ ★ ★ ★',
    render: (_p, s) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;border-collapse:separate;"><tr><td align="center" style="font-family:Helvetica,Arial,sans-serif;letter-spacing:5px;color:${s};font-size:14px;line-height:1;">&#9733; &#9733; &#9733; &#9733; &#9733;</td></tr></table>`,
  },
  {
    id: 'hairline', label: 'Hairline rule', preview: '────────',
    render: (p, _s) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto;border-collapse:separate;"><tr><td align="center"><table role="presentation" width="60%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td style="border-top:1px solid ${p};line-height:1px;font-size:1px;height:1px;">&nbsp;</td></tr></table></td></tr></table>`,
  },
  {
    id: 'double-rule', label: 'Double rule', preview: '══════',
    render: (p, _s) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto;border-collapse:separate;"><tr><td align="center"><table role="presentation" width="60%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td style="border-top:1px solid ${p};line-height:1px;font-size:1px;height:1px;">&nbsp;</td></tr><tr><td style="height:3px;line-height:3px;font-size:1px;">&nbsp;</td></tr><tr><td style="border-top:1px solid ${p};line-height:1px;font-size:1px;height:1px;">&nbsp;</td></tr></table></td></tr></table>`,
  },
  {
    id: 'diamond', label: 'Diamond flank', preview: '— ◆ —',
    render: (p, _s) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;border-collapse:separate;"><tr><td align="center" style="font-family:Helvetica,Arial,sans-serif;color:${p};font-size:14px;line-height:1;letter-spacing:8px;">&mdash; &#9670; &mdash;</td></tr></table>`,
  },
  {
    id: 'dots', label: 'Dot trio', preview: '• • •',
    render: (_p, _s) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;border-collapse:separate;"><tr><td align="center" style="font-family:Helvetica,Arial,sans-serif;color:#999999;font-size:18px;line-height:1;letter-spacing:8px;">&bull; &bull; &bull;</td></tr></table>`,
  },
  {
    id: 'bar', label: 'Solid accent bar', preview: '▬▬▬▬▬▬',
    render: (p, _s) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto;border-collapse:separate;"><tr><td align="center"><table role="presentation" width="40%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="${p}" style="background-color:${p};height:4px;line-height:4px;font-size:1px;">&nbsp;</td></tr></table></td></tr></table>`,
  },
]

const DIVIDER_BY_ID: Record<DividerStyleId, DividerStyle> = Object.fromEntries(
  DIVIDER_STYLES.map(d => [d.id, d])
) as Record<DividerStyleId, DividerStyle>

function renderDivider(id: string, primaryColor: string, linkColor: string): string {
  const style = DIVIDER_BY_ID[id as DividerStyleId]
  if (!style) return ''
  return style.render(primaryColor, linkColor)
}

// Editor-side placeholder for a divider. Visible in the contentEditable as a
// small subtle card so the user can see what they inserted; data-block +
// data-divider survives the htmlToMarkdown round-trip.
function dividerPlaceholderHtml(id: string): string {
  const style = DIVIDER_BY_ID[id as DividerStyleId]
  const label = style?.label || id
  const preview = style?.preview || id
  return [
    `<div data-block="divider" data-divider="${id}" contenteditable="false" `,
    `style="margin:10px auto;padding:8px 14px;border:1px dashed #999;background:rgba(0,0,0,0.04);border-radius:4px;`,
    `cursor:default;user-select:none;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#666;text-align:center;max-width:60%;">`,
    `<span style="letter-spacing:2px;">${preview}</span>`,
    `<span style="display:block;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#999;margin-top:2px;">${label} divider</span>`,
    `</div>`,
  ].join('')
}

const DEFAULT_TIERS: DonationTier[] = [
  { amount: '$7',  suffix: '/ month', impact: 'a digital ad seen by 200 voters in your district each month' },
  { amount: '$15', suffix: '/ month', impact: 'a yard sign on a county road 1,500 cars pass daily' },
  { amount: '$25', suffix: '/ month', impact: 'door hangers for a full neighborhood precinct' },
  { amount: '$50', suffix: '/ month', impact: 'a radio spot across the county' },
]

const DEFAULT_DONATIONS_HEADING = "A few bucks a month goes further in a race this size than you'd think:"
const DEFAULT_CTA_LABEL = 'CHIP IN TODAY'

interface Brand {
  id: string
  name: string
  website: string
  logo_url: string
  primary_color: string
  secondary_color?: string
  tertiary_color?: string
  header_color?: string
  secondary_enabled?: boolean
  tertiary_enabled?: boolean
  donate_url: string
  button_alignment?: ButtonAlign
  paid_for_by?: string
  social_facebook?: string
  social_instagram?: string
  social_twitter?: string
  social_youtube?: string
  social_reddit?: string
  social_website?: string
  default_donations_heading?: string
  default_cta_label?: string
  default_donation_tiers?: DonationTier[]
  default_card_width?: CardWidth
  default_cta_size?: CtaSize
}

interface SocialPlatform {
  key: keyof Brand
  label: string
  bg: string  // platform brand color (or sentinel 'BRAND' to use the candidate's primary color)
  iconUrl: string
  placeholder: string
}

const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { key: 'social_facebook',  label: 'Facebook',    bg: '#1877f2', iconUrl: 'https://cdn.simpleicons.org/facebook/ffffff',  placeholder: 'https://facebook.com/janedoeforstaterep' },
  { key: 'social_instagram', label: 'Instagram',   bg: '#e4405f', iconUrl: 'https://cdn.simpleicons.org/instagram/ffffff', placeholder: 'https://instagram.com/janedoeforstaterep' },
  { key: 'social_twitter',   label: 'Twitter / X', bg: '#000000', iconUrl: 'https://cdn.simpleicons.org/x/ffffff',         placeholder: 'https://x.com/janedoeforstaterep' },
  { key: 'social_youtube',   label: 'YouTube',     bg: '#ff0000', iconUrl: 'https://cdn.simpleicons.org/youtube/ffffff',   placeholder: 'https://youtube.com/@janedoeforstaterep' },
  { key: 'social_reddit',    label: 'Reddit',      bg: '#ff4500', iconUrl: 'https://cdn.simpleicons.org/reddit/ffffff',    placeholder: 'https://reddit.com/user/janedoeforstaterep' },
  { key: 'social_website',   label: 'Website',     bg: 'BRAND',   iconUrl: 'https://api.iconify.design/mdi:web.svg?color=white', placeholder: 'https://janedoeforstaterep.com' },
]

const BRANDS_KEY = 'redefine_email_brands'
const DRAFT_KEY = 'redefine_email_draft'

// Mailchimp's standard merge tags. Inserted as literal text into the body;
// Mailchimp replaces them with subscriber/list-specific values at send time.
const MERGE_TAGS: { group: string; tags: { tag: string; label: string }[] }[] = [
  {
    group: 'Subscriber',
    tags: [
      { tag: '*|FNAME|*', label: 'First name' },
      { tag: '*|LNAME|*', label: 'Last name' },
      { tag: '*|EMAIL|*', label: 'Email address' },
    ],
  },
  {
    group: 'Campaign actions',
    tags: [
      { tag: '*|UNSUB|*', label: 'Unsubscribe URL' },
      { tag: '*|UPDATE_PROFILE|*', label: 'Update profile URL' },
      { tag: '*|FORWARD|*', label: 'Forward-to-friend URL' },
      { tag: '*|ARCHIVE|*', label: 'View-in-browser URL' },
    ],
  },
  {
    group: 'List / account',
    tags: [
      { tag: '*|LIST:NAME|*', label: 'List / audience name' },
      { tag: '*|LIST:COMPANY|*', label: 'Company name' },
      { tag: '*|LIST:ADDRESS|*', label: 'Mailing address (plain text)' },
      { tag: '*|HTML:LIST_ADDRESS_HTML|*', label: 'Mailing address (formatted block)' },
      { tag: '*|LIST:URL|*', label: 'List website' },
      { tag: '*|LIST:PHONE|*', label: 'List phone' },
    ],
  },
  {
    group: 'Campaign info',
    tags: [
      { tag: '*|MC:SUBJECT|*', label: 'Campaign subject line' },
      { tag: '*|MC:DATE|*', label: 'Send date' },
      { tag: '*|MC_PREVIEW_TEXT|*', label: 'Preview text (preheader)' },
      { tag: '*|CURRENT_YEAR|*', label: 'Current year' },
    ],
  },
]

// Regex matching Mailchimp's standard merge-tag syntax. Used to stash tags
// before bold/italic processing so they aren't misread as markdown.
const MERGE_TAG_RE = /\*\|[A-Z][A-Z0-9_:]*?\|\*/g

const DEFAULT_BODY = `Friend,

I'll keep this short. I'm running to represent our community, and this campaign runs on small donations from people right here at home. Not corporate PACs.

Every dollar goes straight to reaching voters who haven't heard from us yet. Door hangers, yard signs, a digital ad in a neighbor's feed two streets over.

If you can chip in $10 today, it adds up fast.

[Donate $10 now](https://example.com/donate)

Thank you for having my back.`

const DEFAULT_SIGNOFF = `— Jane Doe\nCandidate for Missouri State Representative`

function loadBrands(): Brand[] {
  try { return JSON.parse(localStorage.getItem(BRANDS_KEY) || '[]') as Brand[] } catch { return [] }
}
function saveBrands(brands: Brand[]) {
  localStorage.setItem(BRANDS_KEY, JSON.stringify(brands))
}

// Result of parsing pasted email HTML. Visual aesthetics only — colors and
// logo. Body copy, donate URLs, social handles, paid-for-by, and candidate
// names are deliberately NOT extracted: this feature is for poaching design,
// not borrowing other campaigns' identities.
interface ExtractedEmail {
  logo_url: string
  primary_color: string
  secondary_color: string
  tertiary_color: string
  header_color: string
}

// Quoted-printable decoder. Forwarded emails are often QP-encoded:
// `class=3D"foo"` → `class="foo"`, soft line breaks `=\n` are stripped.
function decodeQuotedPrintable(s: string): string {
  // Don't decode if it doesn't look QP — saves us from mangling raw HTML
  // that happens to contain `=3D` literally.
  if (!/=[0-9A-F]{2}|=\r?\n/.test(s)) return s
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_m, hex) => {
      try { return String.fromCharCode(parseInt(hex, 16)) } catch { return _m }
    })
}

// If pasted content begins with mail headers (Delivered-To, Received, etc.)
// or MIME boundaries, strip everything before the first HTML-ish tag.
function stripMailPreamble(s: string): string {
  const m = s.search(/<(html|body|!DOCTYPE|table|div|center)\b/i)
  return m > 0 ? s.slice(m) : s
}

function preprocessEmailHtml(s: string): string {
  let out = decodeQuotedPrintable(s)
  out = stripMailPreamble(out)
  return out
}

function normalizeHexColor(input: string): string {
  if (!input) return ''
  const s = input.trim().toLowerCase()
  // #abc → #aabbcc
  let m = s.match(/^#([0-9a-f]{3})$/)
  if (m) return '#' + m[1].split('').map(c => c + c).join('')
  m = s.match(/^#([0-9a-f]{6})$/)
  if (m) return '#' + m[1]
  m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) {
    const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
    return '#' + hex(+m[1]) + hex(+m[2]) + hex(+m[3])
  }
  // Named color quick map for the few common ones
  const named: Record<string, string> = {
    white: '#ffffff', black: '#000000', red: '#ff0000', blue: '#0000ff',
    green: '#008000', yellow: '#ffff00', gray: '#808080', grey: '#808080',
  }
  if (named[s]) return named[s]
  return ''
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-f]{6})$/i)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

// Treat near-grayscale (low chroma) and near-white/black as "ignore" for
// dominant-color extraction. The threshold is intentionally lenient: very
// pale pastels still pass through, but #f5f5f5-style backgrounds don't.
function isGrayscale(hex: string): boolean {
  const rgb = hexToRgb(hex)
  if (!rgb) return true
  const [r, g, b] = rgb
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max - min < 18) return true   // near-gray
  if (max < 28) return true          // near-black
  if (min > 230) return true         // near-white
  return false
}

function colorHueDistance(a: string, b: string): number {
  const ra = hexToRgb(a), rb = hexToRgb(b)
  if (!ra || !rb) return 0
  // Simple Euclidean in RGB. Fine for "are these visually distinct"
  return Math.sqrt(
    (ra[0]-rb[0])**2 + (ra[1]-rb[1])**2 + (ra[2]-rb[2])**2
  )
}

// Walk a DOM and tally up colors used in inline styles + bgcolor attrs.
// Returns the top N hue-distinct colors by usage frequency.
function pickDominantColors(root: Element, n: number): string[] {
  const counts = new Map<string, number>()
  const tally = (raw: string) => {
    const norm = normalizeHexColor(raw)
    if (!norm || isGrayscale(norm)) return
    counts.set(norm, (counts.get(norm) || 0) + 1)
  }
  const styleProps = ['background-color', 'background', 'color', 'border-color']
  root.querySelectorAll('*').forEach(el => {
    const style = (el.getAttribute('style') || '').toLowerCase()
    if (style) {
      for (const prop of styleProps) {
        // very loose match: handles `background-color: #abc`, rgb(), named
        const re = new RegExp(`${prop}\\s*:\\s*([^;]+)`, 'i')
        const m = style.match(re)
        if (m) {
          const v = m[1].trim()
          // grab first color-token in the value (handles `background: #fff url(...)`)
          const tok = v.match(/#[0-9a-f]{3,6}|rgba?\([^)]+\)|[a-z]+/i)?.[0] || ''
          if (tok) tally(tok)
        }
      }
    }
    const bg = el.getAttribute('bgcolor')
    if (bg) tally(bg)
  })
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(c => c[0])
  // Greedily pick top-N hue-distinct colors (any pick at least 60 RGB units away)
  const picks: string[] = []
  for (const c of sorted) {
    if (picks.every(p => colorHueDistance(p, c) > 60)) picks.push(c)
    if (picks.length >= n) break
  }
  return picks
}

// Best-effort logo finder: prefer the first reasonably-sized image in the
// upper portion of the document. Falls back to any img with a src.
function findLogo(root: Element): string {
  const imgs = Array.from(root.querySelectorAll('img'))
  // Score: bigger width + earlier in doc + has alt mentioning campaign-y words = better
  const scored = imgs.map((img, idx) => {
    const w = parseInt(img.getAttribute('width') || '0', 10) || 0
    const alt = (img.getAttribute('alt') || '').toLowerCase()
    const altBoost = /campaign|logo|for (state|us|congress|senate|house|governor)|district|paid for by/i.test(alt) ? 80 : 0
    // Prefer images near the top
    const positionScore = Math.max(0, 100 - idx * 10)
    // Filter out tracking pixels (1×1)
    if (w > 0 && w < 30) return { img, score: -1 }
    if (w === 0 && (img.getAttribute('height') === '1' || img.getAttribute('width') === '1')) return { img, score: -1 }
    return { img, score: w + altBoost + positionScore }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)
  return scored[0]?.img.getAttribute('src') || ''
}

// Header background: bgcolor of the first non-trivial bg-colored cell/table
// near the top of the doc. The Slisz email used #1e3a6f on the logo band td.
function findHeaderColor(root: Element): string {
  const candidates = Array.from(root.querySelectorAll('td[bgcolor], td[style*="background"], table[bgcolor]')).slice(0, 8)
  for (const el of candidates) {
    const bg = el.getAttribute('bgcolor')
    const styleBg = (el.getAttribute('style') || '').match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1]
    const c = normalizeHexColor(bg || styleBg || '')
    if (c && !isGrayscale(c)) return c
  }
  return ''
}

function extractFromEmailHtml(rawHtml: string): ExtractedEmail {
  const cleaned = preprocessEmailHtml(rawHtml)
  const doc = new DOMParser().parseFromString(cleaned, 'text/html')
  const root = doc.body || doc.documentElement
  // Drop hidden preheader divs and tracking pixels so they don't pollute the
  // color tally or get counted as logo candidates.
  root.querySelectorAll('div[style*="display:none"], div[style*="display: none"], img[width="1"][height="1"]').forEach(n => n.remove())

  const logo_url = findLogo(root)
  const colors = pickDominantColors(root, 3)
  const [primary_color = '', secondary_color = '', tertiary_color = ''] = colors
  const header_color = findHeaderColor(root)
  return { logo_url, primary_color, secondary_color, tertiary_color, header_color }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Convert pasted HTML (from Word, Google Docs, browsers) into the markdown
// dialect the email pipeline understands: paragraphs separated by blank lines,
// **bold**, *italic*, [text](url) for links. A hyperlink that ends up alone on
// its line will be rendered as a button by the existing renderer.
function htmlToMarkdown(html: string): string {
  // Strip Word's XML preamble and conditional comments so DOMParser doesn't choke.
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<o:p\s*\/?>(.*?)<\/o:p>/gi, '$1')
  const doc = new DOMParser().parseFromString(cleaned, 'text/html')
  let out = convertNode(doc.body)
  // Strip invisible Unicode that Word/Docs sprinkle in (zero-width spaces, soft
  // hyphens, BOM, bidi markers) — these break the "button on its own line"
  // matcher because the line isn't really "alone" once invisible chars are
  // present.
  out = out.replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/g, '')
  // Collapse 3+ blank lines, trim leading/trailing whitespace per line, then trim outer.
  out = out
    .split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
  return out
}

function convertNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || '').replace(/[\s\u00A0]+/g, ' ')
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as Element
  const tag = el.tagName.toLowerCase()
  const childText = () => Array.from(el.childNodes).map(convertNode).join('')

  // Editor-only chrome (figure delete buttons, etc.) — never make it into
  // the markdown stream nor the rendered email.
  if (el.getAttribute && el.getAttribute('data-editor-only') === 'true') {
    return ''
  }
  // Donations placeholder (the contenteditable=false card inserted via the
  // toolbar). Emit a single-line token; mdToEmailHtml renders the actual
  // tier stack from per-email donations state.
  if (el.getAttribute && el.getAttribute('data-block') === 'donations') {
    return '\n\n{{donations}}\n\n'
  }
  // Divider placeholder. The data-divider attr carries the style id so the
  // pipeline can re-render the right glyph.
  if (el.getAttribute && el.getAttribute('data-block') === 'divider') {
    const id = el.getAttribute('data-divider') || 'stars-3'
    return `\n\n{{div:${id}}}\n\n`
  }

  switch (tag) {
    case 'script':
    case 'style':
    case 'head':
    case 'meta':
    case 'link':
      return ''
    case 'br':
      return '\n'
    case 'figure': {
      const layout = (el.getAttribute('data-layout') || 'center').trim()
      const frame = (el.getAttribute('data-frame') || 'none').trim()
      const img = el.querySelector('img')
      if (!img) return childText()
      const src = (img.getAttribute('src') || '').trim()
      if (!src) return ''
      const cap = el.querySelector('figcaption')
      const caption = (cap?.textContent || img.getAttribute('alt') || '').trim().replace(/\s+/g, ' ')
      // Image-with-parallel-text layouts (split). Read the .md-text-cell
      // content as markdown so the parallel paragraph keeps its formatting.
      if (layout === 'left' || layout === 'right') {
        const textCell = el.querySelector('.md-text-cell')
        const textMd = textCell ? convertNode(textCell as Node).trim() : ''
        return `\n\n{{imgsplit:${layout}|${encodeURIComponent(src)}|${encodeURIComponent(caption)}|${encodeURIComponent(textMd)}|${frame}}}\n\n`
      }
      // Plain (center/full) image figure.
      return `\n\n![${caption}|${layout}|${frame}](${src})\n\n`
    }
    case 'img': {
      const src = (el.getAttribute('src') || '').trim()
      if (!src) return ''
      const alt = (el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ')
      const layout = (el.getAttribute('data-layout') || 'center').trim()
      const frame = (el.getAttribute('data-frame') || 'none').trim()
      // Output as a standalone block so mdToEmailHtml can wrap it in a figure.
      return `\n\n![${alt}|${layout}|${frame}](${src})\n\n`
    }
    case 'p':
    case 'div':
    case 'section':
    case 'article':
    case 'header':
    case 'footer':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
    case 'blockquote': {
      const inner = childText().trim()
      if (!inner) return ''
      // Preserve text-align across the round-trip. execCommand('justifyCenter')
      // etc. sets either the `align` attribute (legacy) or `text-align` in
      // inline style. We encode anything non-default as a {{a:X}} marker line
      // that mdToEmailHtml + markdownToDisplayHtml can both decode.
      const style = (el.getAttribute('style') || '').toLowerCase()
      const alignAttr = (el.getAttribute('align') || '').toLowerCase()
      const styleAlign = style.match(/text-align\s*:\s*(left|center|right|justify)/)?.[1]
      const align = (styleAlign || alignAttr) as '' | 'left' | 'center' | 'right' | 'justify'
      if (align && align !== 'left') {
        return `\n\n{{a:${align}}}\n${inner}\n\n`
      }
      return `\n\n${inner}\n\n`
    }
    case 'li': {
      const inner = childText().trim()
      if (!inner) return ''
      // Tag ordered-list items so mdToEmailHtml can re-emit a real <ol>.
      const parent = el.parentElement
      const isOrdered = !!parent && parent.tagName.toLowerCase() === 'ol'
      return isOrdered ? `\n1. ${inner}` : `\n• ${inner}`
    }
    case 'ul':
    case 'ol':
      return `\n\n${childText()}\n\n`
    case 'a': {
      const href = (el.getAttribute('href') || '').trim()
      const text = childText().trim()
      if (!href) return text
      if (!text) return ''
      // Skip Word's internal bookmark links like "#_msocom_1".
      if (href.startsWith('#_') || href.startsWith('#m_')) return text
      return `[${text}](${href})`
    }
    case 'b':
    case 'strong': {
      // Google Docs wraps the entire pasted block in <b id="docs-internal-guid-...">
      // — that's a structural marker, not real bold. Pass through unchanged.
      const id = el.getAttribute('id') || ''
      if (id.startsWith('docs-internal-guid')) return childText()
      const inner = childText().trim()
      return inner ? `**${inner}**` : ''
    }
    case 'i':
    case 'em': {
      const inner = childText().trim()
      return inner ? `*${inner}*` : ''
    }
    case 'mark': {
      const inner = childText()
      if (!inner.trim()) return inner
      return `{{h:#ffff00}}${inner}{{/h}}`
    }
    case 'u': {
      const inner = childText()
      if (!inner.trim()) return inner
      return `{{u}}${inner}{{/u}}`
    }
    case 'span':
    case 'font': {
      // Defensive: if this span contains any block-level descendants
      // (paragraphs, divs, dividers, donations, lists, headings, figures),
      // skip the inline marker wrapping and just emit children. Wrapping
      // such a span in `{{fs:}}` markers would put the closing tag across
      // a block boundary, leaking the markers into rendered output.
      if (el.querySelector('p, div, h1, h2, h3, h4, h5, h6, blockquote, figure, ul, ol, li, [data-block]')) {
        return childText()
      }
      const style = (el.getAttribute('style') || '').toLowerCase()
      const colorAttr = el.getAttribute('color') || ''
      const fg = colorAttr.trim() || (style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/)?.[1] || '').trim()
      const bg = (style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/)?.[1] || '').trim()
      const fwMatch = style.match(/(?:^|;)\s*font-weight\s*:\s*([^;]+)/)
      const fsMatch = style.match(/(?:^|;)\s*font-style\s*:\s*([^;]+)/)
      const tdMatch = style.match(/(?:^|;)\s*text-decoration(?:-line)?\s*:\s*([^;]+)/)
      const fzMatch = style.match(/(?:^|;)\s*font-size\s*:\s*([^;]+)/)
      const isBold = !!fwMatch && /^(bold|bolder|[6-9]\d{2})$/.test(fwMatch[1].trim())
      const isItalic = !!fsMatch && /italic/.test(fsMatch[1].trim())
      const isUnderline = !!tdMatch && /underline/.test(tdMatch[1])
      const fontSize = fzMatch?.[1]?.trim() || ''
      const inner = childText()
      if (!inner.trim()) return inner
      // Don't double-color if the picked color is the default near-black/white
      const isDefaultFg = !fg || /^(black|#000000?|#0{3,6}|rgb\(0,\s*0,\s*0\))$/i.test(fg)
      const isDefaultBg = !bg || /^(transparent|white|#ffffff?|#f{3,6}|rgb\(255,\s*255,\s*255\))$/i.test(bg)
      // Move surrounding whitespace outside markers so paragraph splitting still works.
      const lead = inner.match(/^\s*/)?.[0] || ''
      const trail = inner.match(/\s*$/)?.[0] || ''
      let core = inner.slice(lead.length, inner.length - trail.length)
      if (isItalic) core = `*${core}*`
      if (isBold) core = `**${core}**`
      if (isUnderline) core = `{{u}}${core}{{/u}}`
      if (!isDefaultFg) core = `{{c:${fg}}}${core}{{/c}}`
      if (!isDefaultBg) core = `{{h:${bg}}}${core}{{/h}}`
      if (fontSize) core = `{{fs:${fontSize}}}${core}{{/fs}}`
      return lead + core + trail
    }
    default:
      // Table cells, divs we missed, etc — pass through children.
      return childText()
  }
}

function formatInline(text: string, linkColor: string): string {
  // Process links FIRST so we can escape the text portions safely.
  // Output is composed by concatenating already-safe escaped strings.
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(text)) !== null) {
    out += processInline(escapeHtml(text.slice(last, m.index)))
    out += `<a href="${escapeHtml(m[2])}" style="color:${linkColor};text-decoration:underline;">${processInline(escapeHtml(m[1]))}</a>`
    last = m.index + m[0].length
  }
  out += processInline(escapeHtml(text.slice(last)))
  return out
}

function processInline(s: string): string {
  // Stash Mailchimp merge tags before formatting so the italic/bold regex
  // doesn't munge them — *|FNAME|* would otherwise render as <em>|FNAME|</em>.
  const stash: string[] = []
  s = s.replace(MERGE_TAG_RE, m => {
    stash.push(m)
    return `\x00MT${stash.length - 1}\x00`
  })
  // Bold first (**), then italic (*) — order matters since ** would match * first otherwise.
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  // Color markers from the rich editor / Word-Docs paste. Markers survived
  // escapeHtml because { } aren't HTML-special; restore them as inline spans.
  s = s
    .replace(/\{\{u\}\}([\s\S]*?)\{\{\/u\}\}/g, '<u>$1</u>')
    .replace(/\{\{c:([^}]+)\}\}([\s\S]*?)\{\{\/c\}\}/g, (_m, c, t) =>
      `<span style="color:${escapeStyleValue(c)};">${t}</span>`)
    .replace(/\{\{h:([^}]+)\}\}([\s\S]*?)\{\{\/h\}\}/g, (_m, c, t) =>
      `<span style="background-color:${escapeStyleValue(c)};color:inherit;">${t}</span>`)
    .replace(/\{\{fs:([^}]+)\}\}([\s\S]*?)\{\{\/fs\}\}/g, (_m, sz, t) =>
      `<span style="font-size:${escapeStyleValue(sz)};">${t}</span>`)
  // Restore merge tags as-is.
  s = s.replace(/\x00MT(\d+)\x00/g, (_m, i) => stash[+i])
  return s
}

function escapeStyleValue(s: string): string {
  // Allow only printable ASCII style values to keep email HTML safe.
  return s.replace(/[^a-zA-Z0-9#(),. %-]/g, '').slice(0, 60)
}

// Parse the caption portion of an image token. Format evolved over time:
//   "Caption text"                          → caption only (legacy)
//   "Caption text|center"                   → caption + layout (legacy 2-part)
//   "Caption text|center|polaroid"          → caption + layout + frame (current)
// Last two pipes are layout and frame when both are valid known values;
// otherwise everything is treated as caption to preserve user-entered pipes.
function parseImageCaption(captionRaw: string): { caption: string; layout: string; frame: ImageFrame } {
  const VALID_LAYOUTS = new Set(['center', 'full', 'left', 'right'])
  const parts = captionRaw.split('|')
  let caption = captionRaw.trim()
  let layout = 'center'
  let frame: ImageFrame = 'none'
  if (parts.length >= 3) {
    const tailFrame = parts[parts.length - 1].trim()
    const tailLayout = parts[parts.length - 2].trim()
    if (VALID_FRAMES.has(tailFrame as ImageFrame) && VALID_LAYOUTS.has(tailLayout)) {
      frame = tailFrame as ImageFrame
      layout = tailLayout
      caption = parts.slice(0, -2).join('|').trim()
      return { caption, layout, frame }
    }
  }
  if (parts.length >= 2) {
    const tailLayout = parts[parts.length - 1].trim()
    if (VALID_LAYOUTS.has(tailLayout)) {
      layout = tailLayout
      caption = parts.slice(0, -1).join('|').trim()
      return { caption, layout, frame }
    }
  }
  return { caption, layout, frame }
}

// CSS rules for the contentEditable preview so the user sees the frame as
// they're authoring. Same visual recipe as the email side. The brand color
// is threaded in for the Thin frame so the editor preview matches what the
// email will actually render — without it the user sees a navy border in the
// editor but their actual brand primary in the email, which is confusing.
function frameDisplayStyle(frame: ImageFrame, brandColor: string = '#1e3a6f'): string {
  switch (frame) {
    case 'thin':         return `border:2px solid ${brandColor};box-sizing:border-box;`
    case 'thick':        return `border:5px solid ${brandColor};box-sizing:border-box;`
    case 'rounded':      return 'border-radius:8px;'
    case 'circle':       return 'border-radius:50%;'
    case 'thick-circle': return `border:4px solid ${brandColor};border-radius:50%;box-sizing:border-box;`
    case 'polaroid':     return 'background:#fff;padding:8px 8px 22px;border:1px solid #e0e0e0;box-shadow:0 2px 8px rgba(0,0,0,0.08);box-sizing:border-box;'
    default:             return ''
  }
}

// Visual marker shown in the contentEditable to represent the donations
// block. Non-editable. The actual content (heading, tiers, CTA) lives in
// the per-email donations state and is rendered into the email preview by
// renderDonationsBlock at build time. We tag it with data-block="donations"
// so convertNode can find it and emit a {{donations}} token in the markdown
// stream. A trailing zero-width text node helps cursor placement after the
// block in some browsers.
function donationsPlaceholderHtml(): string {
  return [
    `<div data-block="donations" contenteditable="false" class="md-donations-placeholder" `,
    `style="margin:14px 0;padding:14px 18px;border:1.5px dashed #d4a23a;background:rgba(212,162,58,0.08);`,
    `border-radius:6px;cursor:pointer;user-select:none;font-family:Helvetica,Arial,sans-serif;`,
    `font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#b8252f;font-weight:bold;text-align:center;">`,
    `&#x1F4B0; Donation tiers + CTA — edit in the Donations panel`,
    `</div>`,
  ].join('')
}

// Convert our markdown dialect into clean HTML to seed the rich editor.
// This is similar to mdToEmailHtml but emits simple semantic HTML (not the
// table-based bulletproof button HTML) so contentEditable handles it well.
function markdownToDisplayHtml(md: string): string {
  if (!md) return ''
  const blocks = md.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const out: string[] = []
  let listBuffer: { kind: 'ul' | 'ol'; items: string[] } | null = null
  const flushList = () => {
    if (!listBuffer) return
    const tag = listBuffer.kind
    out.push(`<${tag}>${listBuffer.items.map(li => `<li>${li}</li>`).join('')}</${tag}>`)
    listBuffer = null
  }
  for (const block of blocks) {
    // Bullet list: lines starting with •/-/*  (multi-line block)
    if (/^([•·●○▪▫■□◆◇\-*+])\s+/.test(block.split('\n')[0])) {
      const items = block.split('\n').map(l => l.replace(/^([•·●○▪▫■□◆◇\-*+])\s+/, '').trim()).filter(Boolean)
      if (!listBuffer || listBuffer.kind !== 'ul') { flushList(); listBuffer = { kind: 'ul', items: [] } }
      listBuffer.items.push(...items.map(displayInline))
      continue
    }
    // Numbered list
    if (/^\d+[.)]\s+/.test(block.split('\n')[0])) {
      const items = block.split('\n').map(l => l.replace(/^\d+[.)]\s+/, '').trim()).filter(Boolean)
      if (!listBuffer || listBuffer.kind !== 'ol') { flushList(); listBuffer = { kind: 'ol', items: [] } }
      listBuffer.items.push(...items.map(displayInline))
      continue
    }
    flushList()
    const singleLine = block.indexOf('\n') === -1 ? block : null
    if (singleLine === '{{donations}}') {
      out.push(donationsPlaceholderHtml())
      continue
    }
    if (singleLine) {
      const divMatch = singleLine.match(/^\{\{div:([a-z0-9-]+)\}\}$/)
      if (divMatch) {
        out.push(dividerPlaceholderHtml(divMatch[1]))
        continue
      }
    }
    if (singleLine) {
      // Side-by-side image + text → rebuild side-by-side <figure> for the editor.
      // Optional 5th group is frame id; absent in legacy markdown.
      const splitMatch = singleLine.match(/^\{\{imgsplit:(left|right)\|([^|]*)\|([^|]*)\|([^|]*)(?:\|([a-z]+))?\}\}$/)
      if (splitMatch) {
        try {
          const layout = splitMatch[1]
          const url = decodeURIComponent(splitMatch[2])
          const caption = decodeURIComponent(splitMatch[3])
          const textMd = decodeURIComponent(splitMatch[4])
          const frameRaw = (splitMatch[5] || 'none') as ImageFrame
          const frame: ImageFrame = VALID_FRAMES.has(frameRaw) ? frameRaw : 'none'
          const innerTextHtml = markdownToDisplayHtml(textMd) || '<p><br></p>'
          const captionHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''
          const imgStyle = frameDisplayStyle(frame)
          const imageCell = `<div class="md-image-cell" contenteditable="false"><img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" style="${imgStyle}">${captionHtml}</div>`
          const textCell = `<div class="md-text-cell">${innerTextHtml}</div>`
          const inner = layout === 'left' ? imageCell + textCell : textCell + imageCell
          out.push(`<figure data-layout="${escapeHtml(layout)}" data-frame="${escapeHtml(frame)}" class="md-image-${escapeHtml(layout)}">${inner}</figure><p><br></p>`)
          continue
        } catch { /* fall through */ }
      }
    }
    // Image block: standalone ![caption|layout|frame](url) — render as <figure>
    // for the editor preview so the image appears centered with caption below.
    if (singleLine) {
      const imgMatch = singleLine.match(/^!\[([^\]]*)\]\(([^\s)]+)\)\s*$/)
      if (imgMatch) {
        const { caption, layout, frame } = parseImageCaption(imgMatch[1])
        const url = imgMatch[2]
        const cls = layout === 'full' ? 'md-image-full' : 'md-image-center'
        const imgStyle = frameDisplayStyle(frame)
        out.push(`<figure data-layout="${escapeHtml(layout)}" data-frame="${escapeHtml(frame)}" class="${cls}"><img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" data-layout="${escapeHtml(layout)}" data-frame="${escapeHtml(frame)}" style="${imgStyle}">${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`)
        continue
      }
    }
    // Paragraph (or standalone link). May be prefixed with `{{a:X}}` on its
    // own first line — strip + apply text-align so the editor preview matches
    // what the email will render.
    let alignStyle = ''
    let blockLines = block.split('\n')
    const firstLineAlign = blockLines[0]?.match(/^\{\{a:(left|center|right|justify)\}\}$/)
    if (firstLineAlign) {
      alignStyle = ` style="text-align:${firstLineAlign[1]}"`
      blockLines = blockLines.slice(1)
    }
    out.push(`<p${alignStyle}>${blockLines.map(displayInline).join('<br>')}</p>`)
  }
  flushList()
  return out.join('')
}

function displayInline(text: string): string {
  // Same inline pass as the email pipeline, but using a neutral link color
  // since the editor doesn't know the brand color and we don't want to hardcode it.
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(text)) !== null) {
    out += processInlineForDisplay(escapeHtml(text.slice(last, m.index)))
    out += `<a href="${escapeHtml(m[2])}">${processInlineForDisplay(escapeHtml(m[1]))}</a>`
    last = m.index + m[0].length
  }
  out += processInlineForDisplay(escapeHtml(text.slice(last)))
  return out
}

function processInlineForDisplay(s: string): string {
  const stash: string[] = []
  s = s.replace(MERGE_TAG_RE, m => {
    stash.push(m)
    return `\x00MT${stash.length - 1}\x00`
  })
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\{\{u\}\}([\s\S]*?)\{\{\/u\}\}/g, '<u>$1</u>')
    .replace(/\{\{c:([^}]+)\}\}([\s\S]*?)\{\{\/c\}\}/g, (_m, c, t) =>
      `<span style="color:${escapeStyleValue(c)};">${t}</span>`)
    .replace(/\{\{h:([^}]+)\}\}([\s\S]*?)\{\{\/h\}\}/g, (_m, c, t) =>
      `<span style="background-color:${escapeStyleValue(c)};color:inherit;">${t}</span>`)
    .replace(/\{\{fs:([^}]+)\}\}([\s\S]*?)\{\{\/fs\}\}/g, (_m, sz, t) =>
      `<span style="font-size:${escapeStyleValue(sz)};">${t}</span>`)
  s = s.replace(/\x00MT(\d+)\x00/g, (_m, i) => stash[+i])
  return s
}

// Heuristic: does this look like raw markdown rather than HTML?
// Used on first load — if a localStorage draft was saved as markdown, we
// upgrade it to HTML once for the rich editor.
function looksLikeMarkdown(s: string): boolean {
  if (!s) return false
  // Has at least one HTML tag → already HTML.
  if (/<\/?(p|div|span|a|ul|ol|li|strong|em|b|i|u|br|mark|h\d)[^>]*>/i.test(s)) return false
  return true
}

// Hex utilities for deriving a darker shade for button shadows. Returns a
// new hex string approximately `pct` percent darker than the input. Falls
// back to the original on any parsing trouble (so weird inputs don't crash).
function darkenHex(hex: string, pct: number = 0.25): string {
  const m = (hex || '').trim().match(/^#?([0-9a-f]{6})$/i)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - pct)))
  const g = Math.max(0, Math.round(((n >>  8) & 0xff) * (1 - pct)))
  const b = Math.max(0, Math.round(( n        & 0xff) * (1 - pct)))
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)
}

function lightenHex(hex: string, pct: number = 0.3): string {
  const m = (hex || '').trim().match(/^#?([0-9a-f]{6})$/i)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) + (255 - ((n >> 16) & 0xff)) * pct))
  const g = Math.min(255, Math.round(((n >>  8) & 0xff) + (255 - ((n >>  8) & 0xff)) * pct))
  const b = Math.min(255, Math.round(( n        & 0xff) + (255 - ( n        & 0xff)) * pct))
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)
}

// Picks a horizontal-strip color that's visually distinct from the email's
// header background. Tries secondary → tertiary → primary in order; if all
// three brand colors are too close to the header bg (common on monochromatic
// sites), derives a contrast tint from the header itself so the strip is
// always visible.
function pickStripColor(headerBg: string, candidates: string[]): string {
  const THRESHOLD = 60  // RGB Euclidean distance — visually distinct
  for (const c of candidates) {
    if (c && colorHueDistance(c, headerBg) >= THRESHOLD) return c
  }
  // Last resort: derive contrast from header. Lighten dark headers (so a
  // navy band gets a light blue strip), darken light headers.
  const rgb = hexToRgb(headerBg)
  if (!rgb) return candidates[0] || '#888888'
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
  return lum > 0.5 ? darkenHex(headerBg, 0.45) : lightenHex(headerBg, 0.5)
}

// Slisz-style CTA: solid bg + hard drop shadow in a darker shade, uppercase
// label with letter-spacing and a trailing arrow. Used by both the standalone
// markdown-link renderer and the donations-block CTA.
function renderButton(text: string, url: string, primaryColor: string, alignment: ButtonAlign = 'center', size: CtaSize = 'standard'): string {
  const { padding, fontSize } = CTA_SIZE_SPEC[size]
  // Run label through processInline so **bold**/*italic* markers unwrap
  // properly instead of showing literal asterisks in the button.
  const rawLabel = processInline(escapeHtml(text))
  // If user already wrote an arrow or a custom suffix, leave it alone;
  // otherwise append a trailing arrow for visual direction.
  const hasArrow = /[→➔➡»>]\s*$/.test(text)
  const label = hasArrow ? rawLabel : `${rawLabel} &rarr;`
  const shadowColor = darkenHex(primaryColor, 0.3)
  // Outer table is centered (per alignment) but content-width — long labels
  // expand the button, short labels stay tight. The inline-block wrapper
  // inside keeps the shadow tightly hugging the button text.
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${alignment === 'left' || alignment === 'right' ? alignment : 'center'}" style="margin:24px auto;border-collapse:separate;">`,
    `  <tr><td align="${alignment === 'left' || alignment === 'right' ? alignment : 'center'}" bgcolor="${primaryColor}" style="background-color:${primaryColor};border-radius:4px;box-shadow:0 2px 0 ${shadowColor};">`,
    `    <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:${padding};color:#ffffff;text-decoration:none;font-weight:700;font-size:${fontSize};font-family:Helvetica,Arial,sans-serif;line-height:1.2;letter-spacing:1.5px;text-transform:uppercase;border-radius:4px;">${label}</a>`,
    `  </td></tr>`,
    `</table>`,
  ].join('\n')
}

// Slisz-style donation tier stack + CTA. Each tier is a 2-column row: a
// solid amount block on the left, a cream description cell on the right.
// All tiers + CTA point to the same `donateUrl`. The "/ MONTH" suffix uses
// the same white as the dollar amount (slightly faded via opacity) for
// readability — earlier versions used a brand accent color but it was hard
// to read against the primary background on some palettes.
function renderDonationsBlock(d: DonationsData, donateUrl: string, primaryColor: string): string {
  if (!d.tiers.length) return ''
  const url = (donateUrl || '').trim()
  const safeUrl = url ? escapeHtml(url) : '#'
  const heading = (d.heading || '').trim()
  const cta = (d.cta_label || '').trim()
  const cardWidthPct = CARD_WIDTH_PCT[d.card_width || 'full']
  const ctaSize: CtaSize = d.cta_size || 'standard'
  // Subtle warm border that matches the cream/parchment outer feel without
  // requiring it from the brand palette. Hardcoded — purely a card chrome.
  const cardBorder = '#e5dccb'
  const cardBg = '#ffffff'
  const impactColor = '#2a2a2a'

  const headingHtml = heading
    ? `<tr><td style="padding:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:${impactColor};font-style:italic;text-align:center;">${formatInline(heading, primaryColor)}</td></tr>`
    : ''

  // Inner card table is centered when narrower than 100%; cells beneath
  // align to the chosen width and the outer wrapper takes care of the
  // surrounding column.
  const cardTableAttrs = cardWidthPct >= 100
    ? `width="100%" style="width:100%;background-color:${cardBg};border:1px solid ${cardBorder};border-radius:6px;border-collapse:separate;"`
    : `width="${cardWidthPct}%" style="width:${cardWidthPct}%;background-color:${cardBg};border:1px solid ${cardBorder};border-radius:6px;border-collapse:separate;margin:0 auto;"`

  const tierRows = d.tiers.slice(0, MAX_TIERS).map((t, i) => {
    const isLast = i === Math.min(d.tiers.length, MAX_TIERS) - 1
    const amount = escapeHtml(t.amount || '')
    const suffix = escapeHtml(t.suffix || '')
    const impact = escapeHtml(t.impact || '')
    return [
      `<tr><td align="center" style="padding:0 0 ${isLast ? '0' : '10px'};">`,
      `  <a href="${safeUrl}" target="_blank" style="text-decoration:none;color:inherit;display:block;">`,
      `    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" ${cardTableAttrs}>`,
      `      <tr>`,
      `        <td width="92" valign="middle" align="center" bgcolor="${primaryColor}" style="background-color:${primaryColor};padding:18px 8px;border-radius:6px 0 0 6px;font-family:Helvetica,Arial,sans-serif;color:#ffffff;">`,
      `          <span style="font-size:22px;font-weight:bold;display:block;line-height:1;">${amount}</span>`,
      suffix
        ? `          <span style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff;display:block;margin-top:4px;font-family:Helvetica,Arial,sans-serif;opacity:0.85;">${suffix}</span>`
        : '',
      `        </td>`,
      `        <td valign="middle" style="padding:16px 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:${impactColor};">${impact}</td>`,
      `      </tr>`,
      `    </table>`,
      `  </a>`,
      `</td></tr>`,
    ].filter(Boolean).join('\n')
  }).join('\n')

  const ctaHtml = cta
    ? `<tr><td align="center" style="padding:24px 0 0;">${renderButton(cta, url, primaryColor, 'center', ctaSize).replace(/margin:24px auto;/, 'margin:0 auto;')}</td></tr>`
    : ''

  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;border-collapse:separate;">`,
    headingHtml,
    `<tr><td>`,
    `  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">`,
    tierRows,
    `  </table>`,
    `</td></tr>`,
    ctaHtml,
    `</table>`,
  ].filter(Boolean).join('\n')
}

// Wrap a bare <img> tag in the polaroid card layout. Returns the input
// unchanged for any non-polaroid frame.
function applyPolaroidWrapper(imgHtml: string, frame: ImageFrame): string {
  if (frame !== 'polaroid') return imgHtml
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="background-color:#ffffff;border:1px solid #e0e0e0;border-collapse:separate;">`,
    `  <tr><td style="padding:10px 10px 22px;">${imgHtml}</td></tr>`,
    `</table>`,
  ].join('\n')
}

function renderImageSplit(
  url: string,
  caption: string,
  textMd: string,
  layout: 'left' | 'right',
  primaryColor: string,
  buttonAlignment: ButtonAlign,
  linkColor: string,
  compact: boolean = false,
  frame: ImageFrame = 'none',
): string {
  // Email-safe two-column table. Image cell on left or right depending on
  // `layout`. Parallel text routes through the same mdToEmailHtml so it
  // supports paragraphs, lists, formatting, links, etc.
  // In compact mode (signoff) the image cell is a fixed narrow width so it
  // sits beside a name/title rather than dominating the row.
  const textHtml = textMd ? mdToEmailHtml(textMd, primaryColor, buttonAlignment, linkColor, compact) : ''
  const captionFontSize = compact ? '11px' : '12px'
  const captionHtml = caption
    ? `<div style="margin-top:6px;color:#666666;font-size:${captionFontSize};font-style:italic;font-family:Helvetica,Arial,sans-serif;line-height:1.4;">${escapeHtml(caption)}</div>`
    : ''
  const imgWidth = compact ? '90' : '40%'
  const imgPad = layout === 'left' ? 'padding:0 14px 0 0;' : 'padding:0 0 0 14px;'
  const fontSize = compact ? '14px' : '16px'
  const tableMargin = compact ? '8px 0' : '20px 0'
  const frameStyle = frameImageStyle(frame, primaryColor)
  // Polaroid handles its own padding/border; default border-radius:6px is
  // suppressed so the user's chosen frame controls the corners.
  const baseImgStyle = frame !== 'none'
    ? `display:block;width:100%;max-width:100%;height:auto;outline:none;text-decoration:none;${frameStyle}`
    : `display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;border-radius:6px;`
  const imgTag = `<img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" style="${baseImgStyle}">`
  const wrappedImg = applyPolaroidWrapper(imgTag, frame)
  const imgCell = `<td width="${imgWidth}" valign="top" align="center" style="${imgPad}">
        ${wrappedImg}
        ${captionHtml}
      </td>`
  const textCell = `<td valign="top" style="color:#1a1a1a;font-size:${fontSize};line-height:1.6;font-family:Helvetica,Arial,sans-serif;">
        ${textHtml}
      </td>`
  const cells = layout === 'left' ? imgCell + textCell : textCell + imgCell
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:${tableMargin};width:100%;border-collapse:separate;">`,
    `  <tr>${cells}</tr>`,
    `</table>`,
  ].join('\n')
}

function renderImageFigure(url: string, caption: string, layout: string, compact: boolean = false, frame: ImageFrame = 'none', primaryColor: string = '#1e3a6f'): string {
  // Centered or full-width image. Bulletproof table layout. In compact mode
  // (signoff) widths shrink to small-image sizes so the figure sits naturally
  // beside a sign-off line rather than dominating the row.
  const isFull = layout === 'full'
  const tableAttrs = compact
    ? (isFull ? 'width="280" style="margin:10px auto;width:100%;max-width:280px;"'
              : 'width="180" style="margin:10px auto;width:180px;max-width:180px;"')
    : (isFull ? 'width="100%" style="margin:20px auto;width:100%;max-width:100%;"'
              : 'width="70%" style="margin:20px auto;width:70%;max-width:70%;"')
  const captionFontSize = compact ? '11px' : '12px'
  const captionHtml = caption
    ? `<div style="margin:6px 0 0;color:#666666;font-size:${captionFontSize};font-style:italic;text-align:center;font-family:Helvetica,Arial,sans-serif;line-height:1.4;">${escapeHtml(caption)}</div>`
    : ''
  const frameStyle = frameImageStyle(frame, primaryColor)
  const baseImgStyle = frame !== 'none'
    ? `display:block;width:100%;max-width:100%;height:auto;outline:none;text-decoration:none;${frameStyle}`
    : `display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;border-radius:6px;`
  const imgTag = `<img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" style="${baseImgStyle}">`
  const wrappedImg = applyPolaroidWrapper(imgTag, frame)
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" ${tableAttrs}>`,
    `  <tr><td align="center">`,
    `    ${wrappedImg}`,
    captionHtml ? `    ${captionHtml}` : '',
    `  </td></tr>`,
    `</table>`,
  ].filter(Boolean).join('\n')
}

function renderSocialRow(brand: Brand, headingColor: string): string {
  const buttons = SOCIAL_PLATFORMS
    .map(p => ({ p, url: ((brand as any)[p.key] || '').toString().trim() }))
    .filter(x => !!x.url)
  if (!buttons.length) return ''
  const cells = buttons.map(({ p, url }) => {
    const bg = p.bg === 'BRAND' ? brand.primary_color : p.bg
    return [
      `<td style="padding:0 6px;" align="center" valign="middle">`,
      `  <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;width:36px;height:36px;background-color:${bg};border-radius:18px;text-align:center;line-height:36px;text-decoration:none;mso-line-height-rule:exactly;">`,
      `    <img src="${p.iconUrl}" alt="${escapeHtml(p.label)}" width="20" height="20" style="vertical-align:middle;display:inline-block;border:0;outline:none;text-decoration:none;">`,
      `  </a>`,
      `</td>`,
    ].join('')
  }).join('\n')
  return [
    `<div style="margin:0 0 10px;font-weight:700;color:${headingColor};font-size:13px;font-family:Helvetica,Arial,sans-serif;text-align:center;">Please Follow My Campaign on Social Media</div>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 14px;border-collapse:separate;">`,
    `  <tr>${cells}</tr>`,
    `</table>`,
  ].join('\n')
}

function mdToEmailHtml(md: string, primaryColor: string, buttonAlignment: ButtonAlign = 'center', linkColor?: string, compact: boolean = false, donationsHtml?: string): string {
  const inlineLinkColor = linkColor || primaryColor
  const blocks = md.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const out: string[] = []
  const BULLET_RE = /^([•·●○▪▫■□◆◇\-*+])\s+/
  const NUM_RE = /^\d+[.)]\s+/
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)

    // Donations block: caller pre-rendered the HTML; just splice it in here.
    if (lines.length === 1 && lines[0] === '{{donations}}') {
      if (donationsHtml) out.push(donationsHtml)
      continue
    }

    // Decorative divider block: inline-rendered using brand colors so each
    // email's dividers stay on-palette. Compact mode (signoff) doesn't get
    // dividers — they're a body-level affordance.
    if (lines.length === 1 && !compact) {
      const divMatch = lines[0].match(/^\{\{div:([a-z0-9-]+)\}\}$/)
      if (divMatch) {
        const html = renderDivider(divMatch[1], primaryColor, inlineLinkColor)
        if (html) out.push(html)
        continue
      }
    }

    // List block: every line starts with a bullet or numbered prefix → <ul>/<ol>
    const allBullets = lines.length >= 1 && lines.every(l => BULLET_RE.test(l))
    const allNumbered = lines.length >= 1 && lines.every(l => NUM_RE.test(l))
    if (allBullets || allNumbered) {
      const tag = allNumbered ? 'ol' : 'ul'
      const items = lines.map(l => {
        const content = l.replace(allNumbered ? NUM_RE : BULLET_RE, '')
        return `<li style="margin:0 0 6px;">${formatInline(content, inlineLinkColor)}</li>`
      }).join('\n')
      out.push(`<${tag} style="margin:0 0 16px;padding-left:1.5em;color:#1a1a1a;font-size:16px;line-height:1.6;font-family:Helvetica,Arial,sans-serif;">${items}</${tag}>`)
      continue
    }

    // Side-by-side image + text: {{imgsplit:layout|url|caption|encoded_text|frame?}}
    if (lines.length === 1) {
      const splitMatch = lines[0].match(/^\{\{imgsplit:(left|right)\|([^|]*)\|([^|]*)\|([^|]*)(?:\|([a-z]+))?\}\}$/)
      if (splitMatch) {
        try {
          const layout = splitMatch[1] as 'left' | 'right'
          const url = decodeURIComponent(splitMatch[2])
          const caption = decodeURIComponent(splitMatch[3])
          const textMd = decodeURIComponent(splitMatch[4])
          const frameRaw = (splitMatch[5] || 'none') as ImageFrame
          const frame: ImageFrame = VALID_FRAMES.has(frameRaw) ? frameRaw : 'none'
          out.push(renderImageSplit(url, caption, textMd, layout, primaryColor, buttonAlignment, inlineLinkColor, compact, frame))
          continue
        } catch { /* fall through to next match */ }
      }
    }

    // Image block: standalone ![caption|layout|frame](url) — render as <figure>.
    if (lines.length === 1) {
      const imgMatch = lines[0].match(/^!\[([^\]]*)\]\(([^\s)]+)\)\s*$/)
      if (imgMatch) {
        const { caption, layout, frame } = parseImageCaption(imgMatch[1])
        const url = imgMatch[2]
        out.push(renderImageFigure(url, caption, layout, compact, frame, primaryColor))
        continue
      }
    }

    // Standalone markdown link (single-line block, optional trailing punctuation) → button
    if (lines.length === 1) {
      const buttonMatch = lines[0].match(/^\[([^\]]+)\]\(([^\s)]+)\)[\s.,;:!?]*$/)
      if (buttonMatch) {
        out.push(renderButton(buttonMatch[1], buttonMatch[2], primaryColor, buttonAlignment))
        continue
      }
    }

    // Paragraph: preserve line breaks within the block as <br>. If the first
    // line is a `{{a:X}}` marker, strip it and apply text-align to the <p>.
    let alignAttr = ''
    let pLines = lines
    const firstAlign = lines[0]?.match(/^\{\{a:(left|center|right|justify)\}\}$/)
    if (firstAlign) {
      alignAttr = `text-align:${firstAlign[1]};`
      pLines = lines.slice(1)
    }
    const innerHtml = pLines.map(line => formatInline(line, inlineLinkColor)).join('<br>')
    out.push(`<p style="margin:0 0 16px;color:#1a1a1a;font-size:16px;line-height:1.6;font-family:Helvetica,Arial,sans-serif;${alignAttr}">${innerHtml}</p>`)
  }
  return out.join('\n')
}

// Dark-mode CSS rules, shared between the exported email <head> (gated behind
// @media prefers-color-scheme:dark) and the in-app preview (forced on). Uses
// attribute selectors that match the inline-styled markup buildEmailHtml emits.
// Brand-colored bands are deliberately left untouched; only the near-white
// wrapper, body cell, footer, and dark body text get re-tinted so a recipient's
// dark-mode client (Apple Mail, Outlook 365) doesn't produce an unreadable
// half-inverted result.
const DARK_MODE_RULES = `
  body { background-color: #0d0d0d !important; }
  table[style*="background-color:#f4f4f4"] td[align="center"] {
    background-color: #0d0d0d !important;
  }
  td[bgcolor="#ffffff"], td[bgcolor="#fff"],
  td[style*="background-color:#ffffff"], td[style*="background-color: #ffffff"],
  td[style*="background-color:#fff;"], td[style*="background-color: #fff;"],
  table[style*="background-color:#ffffff"] {
    background-color: #1c1c1c !important;
  }
  p[style*="color:#1a1a1a"], li, h1, h2, h3, h4, h5, h6 { color: #e5e5e5 !important; }
  div[style*="color:#888888"], td[style*="color:#888888"] { color: #b0b0b0 !important; }
  td[style*="background-color:#f9f9f9"] { background-color: #161616 !important; }
  td[style*="border:1px solid #cccccc"] { border-color: #444 !important; }
  table[style*="background-color:#ffffff"][style*="border:1px solid #e5dccb"] {
    background-color: #1f1f1f !important;
    border-color: #3a3a3a !important;
  }
  table[style*="background-color:#ffffff"][style*="border:1px solid #e5dccb"] td[valign="middle"]:not([bgcolor]) {
    color: #e5e5e5 !important;
  }`

function buildEmailHtml(opts: {
  subject: string
  preheader: string
  body: string
  signoff: string
  brand: Brand
  donations?: DonationsData
}): string {
  const { subject, preheader, body, signoff, brand, donations } = opts
  // Derive effective palette colors. Disabled secondary/tertiary fall back so
  // every email still renders coherently.
  const linkColor = brand.secondary_enabled !== false
    ? (brand.secondary_color || brand.primary_color)
    : brand.primary_color
  const tertiaryActive = brand.tertiary_enabled !== false && !!brand.tertiary_color
  const accentColor = tertiaryActive ? (brand.tertiary_color as string) : '#444444'
  const donationsHtml = donations && donations.tiers.length
    ? renderDonationsBlock(donations, brand.donate_url || '', brand.primary_color)
    : ''
  const bodyMd = htmlToMarkdown(body)
  const bodyHtml = mdToEmailHtml(bodyMd, brand.primary_color, brand.button_alignment || 'center', linkColor, /* compact */ false, donationsHtml)
  const signoffMd = htmlToMarkdown(signoff)
  const signoffHtml = signoffMd
    ? mdToEmailHtml(signoffMd, brand.primary_color, brand.button_alignment || 'center', linkColor, /* compact */ true)
    : ''
  const logoSrc = brand.logo_url || 'REPLACE_WITH_LOGO_URL'
  const candidateName = brand.name || 'Campaign'
  const headerBg = brand.header_color || '#ffffff'
  // Strip color: contrast-aware against the header bg so the line never
  // disappears against a same-color background after a website import.
  const stripCandidates = [
    brand.secondary_enabled !== false ? (brand.secondary_color || '') : '',
    brand.tertiary_enabled !== false ? (brand.tertiary_color || '') : '',
    brand.primary_color,
  ]
  const stripColor = pickStripColor(headerBg, stripCandidates)
  // MEC "Paid for by" disclaimer. This is legally required and must never be
  // silently omitted or replaced with a vague stand-in. If the brand has no
  // disclaimer set we deliberately DO NOT fabricate one ("Paid for by
  // {candidate}" is not compliant — it lacks the treasurer and the registered
  // committee name). Instead we render an unmistakable placeholder that will
  // show, in red, in the actual footer, forcing the sender to fix it before
  // the blast goes out.
  const paidForBy = (brand.paid_for_by || '').trim()
  const disclaimerMissing = !paidForBy
  const disclaimerHtml = disclaimerMissing
    ? '&#9888; PAID-FOR-BY DISCLAIMER REQUIRED &mdash; add committee name + treasurer in Brand settings before sending'
    : escapeHtml(paidForBy).replace(/\n/g, '<br>')
  const disclaimerStyle = disclaimerMissing
    ? 'margin:0 0 14px;color:#b8252f;font-weight:bold;'
    : 'margin:0 0 14px;color:#888888;'
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {${DARK_MODE_RULES}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Helvetica,Arial,sans-serif;">
<!-- PREHEADER (hidden text shown in inbox preview) -->
<div style="display:none;font-size:1px;color:#f4f4f4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
${escapeHtml(preheader)}
</div>
<!-- Spacer prevents the client from pulling body copy into the inbox preview snippet -->
<div style="display:none;font-size:1px;color:#f4f4f4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f4f4;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
      <!-- =========================================================
           LOGO IMAGE — paste your Mailchimp media URL into the src
           attribute below. Recommended: 400px wide PNG, transparent.
           ========================================================= -->
      <tr><td align="center" bgcolor="${headerBg}" style="padding:32px 24px 16px;background-color:${headerBg};">
        <img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(candidateName)}" width="200" style="max-width:200px;width:200px;height:auto;display:block;border:0;outline:none;text-decoration:none;">
      </td></tr>
      <!-- Color accent strip below the logo band. Auto-picks the brand
           color that contrasts best with the header bg (secondary → tertiary
           → primary), then derives a contrast tint from the header itself if
           all three brand colors are too close (e.g. a monochromatic-navy
           site that scrapes navy/navy/navy). -->
      <tr><td style="height:4px;background-color:${stripColor};line-height:4px;font-size:0;">&nbsp;</td></tr>
      <!-- Body -->
      <tr><td style="padding:32px 32px 8px;color:#1a1a1a;font-size:16px;line-height:1.6;font-family:Helvetica,Arial,sans-serif;">
${bodyHtml}
      </td></tr>
      <!-- Sign-off -->
      ${signoffHtml ? `<tr><td style="padding:8px 32px 32px;color:#1a1a1a;font-size:16px;line-height:1.6;font-family:Helvetica,Arial,sans-serif;">
${signoffHtml}
      </td></tr>` : ''}
      <!-- Tertiary-color divider line (skipped if tertiary is disabled) -->
      ${tertiaryActive ? `<tr><td style="height:2px;background-color:${accentColor};line-height:2px;font-size:0;">&nbsp;</td></tr>` : ''}
      <!-- Footer: social row + paid-for-by disclosure + Mailchimp-compliant unsubscribe -->
      <tr><td style="padding:24px 32px;background-color:#f9f9f9;${tertiaryActive ? '' : 'border-top:1px solid #e5e5e5;'}color:#888888;font-size:12px;line-height:1.5;font-family:Helvetica,Arial,sans-serif;text-align:center;">
        ${renderSocialRow(brand, accentColor)}
        <div style="${disclaimerStyle}">${disclaimerHtml}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
          <tr><td align="center" style="border:1px solid #cccccc;border-radius:4px;padding:0;">
            <a href="*|UNSUB|*" target="_blank" style="display:inline-block;padding:8px 18px;color:#666666;text-decoration:none;font-size:12px;font-family:Helvetica,Arial,sans-serif;line-height:1.2;">Unsubscribe</a>
          </td></tr>
        </table>
        <div style="margin:10px 0 0;font-size:11px;color:#aaaaaa;">
          <a href="*|UPDATE_PROFILE|*" style="color:#aaaaaa;text-decoration:underline;">Update preferences</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

function newBrandId(): string {
  return 'b_' + Math.random().toString(36).slice(2, 10)
}

const EMPTY_BRAND: Brand = {
  id: '', name: '', website: '', logo_url: '',
  primary_color: '#0066cc',
  secondary_color: '#6b7280', tertiary_color: '#9ca3af',
  header_color: '#ffffff',
  secondary_enabled: true, tertiary_enabled: true,
  donate_url: '',
  button_alignment: 'center', paid_for_by: '',
  social_facebook: '', social_instagram: '', social_twitter: '',
  social_youtube: '', social_reddit: '', social_website: '',
  default_donations_heading: DEFAULT_DONATIONS_HEADING,
  default_cta_label: DEFAULT_CTA_LABEL,
  default_donation_tiers: DEFAULT_TIERS,
  default_card_width: 'full',
  default_cta_size: 'standard',
}

interface EmailBuilderProps {
  embedded?: boolean
  initialSubject?: string
  initialBodyMarkdown?: string
  onClose?: () => void
}

export default function EmailBuilderPage({ embedded = false, initialSubject, initialBodyMarkdown, onClose }: EmailBuilderProps = {}) {
  const [brands, setBrands] = useState<Brand[]>(loadBrands)
  const [activeBrandId, setActiveBrandId] = useState<string>(brands[0]?.id || '')
  const [draftBrand, setDraftBrand] = useState<Brand>(brands[0] || EMPTY_BRAND)

  const [subject, setSubject] = useState(initialSubject || 'A note from the campaign')
  const [preheader, setPreheader] = useState('This campaign runs on small donations from folks right here at home.')
  // Body and sign-off both store HTML (from the rich editors). The DEFAULT_*
  // constants are markdown, so seed with the rendered HTML once.
  const [body, setBody] = useState(() => markdownToDisplayHtml(initialBodyMarkdown || DEFAULT_BODY))
  const [signoff, setSignoff] = useState(() => markdownToDisplayHtml(DEFAULT_SIGNOFF))
  // Per-email donations content. Initialized from the active brand's defaults
  // and editable for this email. Tier list capped at MAX_TIERS.
  const initBrand = brands[0] || EMPTY_BRAND
  const [donations, setDonations] = useState<DonationsData>({
    heading: initBrand.default_donations_heading ?? DEFAULT_DONATIONS_HEADING,
    cta_label: initBrand.default_cta_label ?? DEFAULT_CTA_LABEL,
    tiers: (initBrand.default_donation_tiers ?? DEFAULT_TIERS).slice(0, MAX_TIERS),
    card_width: initBrand.default_card_width ?? 'full',
    cta_size: initBrand.default_cta_size ?? 'standard',
  })
  const [donationsSaveStatus, setDonationsSaveStatus] = useState<'idle' | 'saved'>('idle')

  // Import-from-HTML modal state. `extracted` holds the parser output;
  // `picks` is the per-field include flags the user toggles before applying.
  const [importOpen, setImportOpen] = useState(false)
  const [importHtml, setImportHtml] = useState('')
  const [extracted, setExtracted] = useState<ExtractedEmail | null>(null)
  const [picks, setPicks] = useState<Record<string, boolean>>({})

  const [scraping, setScraping] = useState(false)
  const [extractingPalette, setExtractingPalette] = useState(false)
  const [scrapeError, setScrapeError] = useState<string | null>(null)
  // Collapsible social-media section in the brand panel. Closed by default
  // since most brands won't change their social URLs often after initial setup.
  const [socialOpen, setSocialOpen] = useState(false)
  // Full-screen preview modal — overlays the page with the email rendered
  // at either desktop (600px) or mobile (375px) width. Dark-mode toggle
  // simulates how Apple Mail / Outlook 365 render the email when the
  // recipient's client is in dark mode.
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [previewDark, setPreviewDark] = useState(false)
  // Test-send modal: sends the rendered HTML to a single email address via
  // SMTP so the user can verify rendering in real Gmail / Outlook / Apple Mail.
  const [testSendOpen, setTestSendOpen] = useState(false)
  const [testSendEmail, setTestSendEmail] = useState('')
  const [testSendStatus, setTestSendStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [testSendError, setTestSendError] = useState<string | null>(null)

  // ESC closes full preview / import / test-send modal.
  useEffect(() => {
    if (!fullPreviewOpen && !importOpen && !testSendOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullPreviewOpen(false)
        setImportOpen(false)
        setTestSendOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fullPreviewOpen, importOpen, testSendOpen])
  // Palette cycle: index 0 is the original auto-default returned by the
  // scrape; indexes 1+ are the backend-generated alternatives. Prev/Next
  // buttons in the brand panel cycle through and auto-apply each one.
  type PaletteVariant = { primary_color: string; secondary_color: string; tertiary_color: string }
  const [paletteDefault, setPaletteDefault] = useState<PaletteVariant | null>(null)
  const [paletteAlternatives, setPaletteAlternatives] = useState<PaletteVariant[]>([])
  const [paletteAltIndex, setPaletteAltIndex] = useState(0)
  const [copyState, setCopyState] = useState<'idle' | 'done'>('idle')
  const [showSource, setShowSource] = useState(false)
  const [pasteFlash, setPasteFlash] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  // Restore draft on mount
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}')
      // When seeded with personalized copy (embedded), keep the seed — only the
      // brand is restored from the saved draft.
      if (!initialBodyMarkdown) {
        if (draft.subject) setSubject(draft.subject)
        if (draft.preheader) setPreheader(draft.preheader)
        if (typeof draft.body === 'string' && draft.body) {
          // Older drafts were saved as markdown; upgrade to HTML on first load.
          setBody(looksLikeMarkdown(draft.body) ? markdownToDisplayHtml(draft.body) : draft.body)
        }
        if (typeof draft.signoff === 'string' && draft.signoff) {
          setSignoff(looksLikeMarkdown(draft.signoff) ? markdownToDisplayHtml(draft.signoff) : draft.signoff)
        }
      }
      if (draft.activeBrandId) setActiveBrandId(draft.activeBrandId)
    } catch { /* ignore */ }
  }, [])

  // Persist draft on change (skip when embedded so a one-off personalized email
  // doesn't overwrite the standalone Email Builder draft).
  useEffect(() => {
    if (embedded) return
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject, preheader, body, signoff, activeBrandId, donations }))
  }, [subject, preheader, body, signoff, activeBrandId, donations, embedded])

  // Restore donations from draft on mount (separate effect from the main draft
  // restore so the donations type stays narrowly scoped).
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}')
      if (draft.donations && Array.isArray(draft.donations.tiers)) {
        const cw = draft.donations.card_width
        const cs = draft.donations.cta_size
        setDonations({
          heading: typeof draft.donations.heading === 'string' ? draft.donations.heading : DEFAULT_DONATIONS_HEADING,
          cta_label: typeof draft.donations.cta_label === 'string' ? draft.donations.cta_label : DEFAULT_CTA_LABEL,
          tiers: draft.donations.tiers.slice(0, MAX_TIERS).map((t: any) => ({
            amount: String(t?.amount ?? ''),
            suffix: String(t?.suffix ?? ''),
            impact: String(t?.impact ?? ''),
          })),
          card_width: (['full', 'wide', 'standard', 'tight'] as CardWidth[]).includes(cw) ? cw : 'full',
          cta_size: (['compact', 'standard', 'generous'] as CtaSize[]).includes(cs) ? cs : 'standard',
        })
      }
    } catch { /* ignore */ }
  }, [])

  // When the active brand changes, copy it into the editable draft.
  useEffect(() => {
    const found = brands.find(b => b.id === activeBrandId)
    if (found) setDraftBrand(found)
    else if (!activeBrandId) setDraftBrand(EMPTY_BRAND)
  }, [activeBrandId, brands])

  const html = useMemo(
    // body and signoff are HTML from the rich editors; buildEmailHtml runs them
    // through htmlToMarkdown → mdToEmailHtml internally. donations only renders
    // if the body contains a {{donations}} placeholder.
    () => buildEmailHtml({ subject, preheader, body, signoff, brand: draftBrand, donations }),
    [subject, preheader, body, signoff, draftBrand, donations]
  )

  // Whether the body currently contains a donations placeholder. Used to
  // gate the toolbar insert (cap at 1) and to grey out the panel when none.
  const hasDonationsBlock = useMemo(
    () => /data-block=["']donations["']/.test(body),
    [body]
  )

  // Dark-mode preview: injects a <style> override into the rendered email
  // HTML that simulates how Apple Mail / Outlook 365 auto-invert near-white
  // backgrounds in dark mode. Brand-colored bands stay; only the white
  // wrapper, body cell, and dark text get re-tinted.
  const darkPreviewHtml = useMemo(() => {
    if (!previewDark) return html
    // Forces the same dark rules the exported email applies via
    // @media(prefers-color-scheme:dark), so the preview matches real dark-mode
    // rendering. Shares DARK_MODE_RULES with buildEmailHtml to prevent drift.
    const dark = `
<style>${DARK_MODE_RULES}
</style>`
    if (html.includes('</head>')) return html.replace('</head>', dark + '</head>')
    return dark + html
  }, [html, previewDark])

  const onScrape = async () => {
    if (!draftBrand.website.trim()) {
      setScrapeError('Enter a website URL first')
      return
    }
    setScraping(true)
    setScrapeError(null)
    try {
      const res = await fetch(`/api/email-builder/scrape?url=${encodeURIComponent(draftBrand.website.trim())}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setDraftBrand(b => ({
        ...b,
        name: data.name || b.name,
        website: data.site_url || b.website,
        logo_url: data.logo_url || b.logo_url,
        primary_color: data.primary_color || b.primary_color,
        secondary_color: data.secondary_color || b.secondary_color,
        tertiary_color: data.tertiary_color || b.tertiary_color,
        header_color: data.header_color || b.header_color,
        donate_url: data.donate_url || b.donate_url,
        social_facebook: data.social_facebook || b.social_facebook,
        social_instagram: data.social_instagram || b.social_instagram,
        social_twitter: data.social_twitter || b.social_twitter,
        social_youtube: data.social_youtube || b.social_youtube,
        social_reddit: data.social_reddit || b.social_reddit,
        social_website: data.social_website || b.social_website,
      }))
      if (data.primary_color) {
        setPaletteDefault({
          primary_color: data.primary_color,
          secondary_color: data.secondary_color || '',
          tertiary_color: data.tertiary_color || '',
        })
      }
      setPaletteAlternatives(Array.isArray(data.alternatives) ? data.alternatives : [])
      setPaletteAltIndex(0)
    } catch (e) {
      setScrapeError(String(e))
    } finally {
      setScraping(false)
    }
  }

  const onExtractPalette = async () => {
    const logo = draftBrand.logo_url.trim()
    if (!logo) {
      setScrapeError('Add a logo URL first')
      return
    }
    setExtractingPalette(true)
    setScrapeError(null)
    try {
      const res = await fetch(`/api/email-builder/analyze-logo?url=${encodeURIComponent(logo)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setDraftBrand(b => ({
        ...b,
        primary_color: data.primary_color || b.primary_color,
        secondary_color: data.secondary_color || b.secondary_color,
        tertiary_color: data.tertiary_color || b.tertiary_color,
        header_color: data.header_color || b.header_color,
      }))
      if (data.primary_color) {
        setPaletteDefault({
          primary_color: data.primary_color,
          secondary_color: data.secondary_color || '',
          tertiary_color: data.tertiary_color || '',
        })
      }
      setPaletteAlternatives(Array.isArray(data.alternatives) ? data.alternatives : [])
      setPaletteAltIndex(0)
    } catch (e) {
      setScrapeError(`Palette extraction failed: ${e}`)
    } finally {
      setExtractingPalette(false)
    }
  }

  const onSaveBrand = () => {
    if (!draftBrand.name.trim()) return
    const id = draftBrand.id || newBrandId()
    const next = { ...draftBrand, id }
    const updated = brands.find(b => b.id === id)
      ? brands.map(b => (b.id === id ? next : b))
      : [...brands, next]
    setBrands(updated)
    saveBrands(updated)
    setActiveBrandId(id)
    setDraftBrand(next)
  }

  const onDeleteBrand = () => {
    if (!draftBrand.id) return
    if (!confirm(`Delete brand "${draftBrand.name}"?`)) return
    const updated = brands.filter(b => b.id !== draftBrand.id)
    setBrands(updated)
    saveBrands(updated)
    setActiveBrandId(updated[0]?.id || '')
    setDraftBrand(updated[0] || EMPTY_BRAND)
  }

  const onNewBrand = () => {
    setActiveBrandId('')
    setDraftBrand({ ...EMPTY_BRAND })
  }

  // Blocking MEC gate shared by Copy / Download. Returns false if the user
  // aborts. A missing "Paid for by" disclaimer is treated like a broken donate
  // link: the tool refuses to hand off silently non-compliant HTML.
  const confirmDisclaimer = (): boolean => {
    if ((draftBrand.paid_for_by || '').trim()) return true
    return confirm(
      'No "Paid for by" disclaimer is set for this brand.\n\n' +
      'Missouri Ethics Commission rules require the exact registered committee ' +
      'name and current treasurer. The exported HTML will contain a red ' +
      'PLACEHOLDER in the footer, not a compliant disclaimer.\n\n' +
      'Export anyway?'
    )
  }

  const onCopy = async () => {
    if (!confirmDisclaimer()) return
    try {
      await navigator.clipboard.writeText(html)
      setCopyState('done')
      setTimeout(() => setCopyState('idle'), 1500)
    } catch {
      // Fallback: select-all in a temp textarea
      const ta = document.createElement('textarea')
      ta.value = html; document.body.appendChild(ta); ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopyState('done')
      setTimeout(() => setCopyState('idle'), 1500)
    }
  }

  const onDownload = () => {
    if (!confirmDisclaimer()) return
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const slug = (draftBrand.name || 'email').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'email'
    a.download = `${slug}-blast.html`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const onDownloadPdf = async () => {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const slug = (draftBrand.name || 'email').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'email'
      const filename = `${slug}-blast.pdf`
      // Server-side rendering via headless Chromium. Real browser engine →
      // multi-line highlights, custom fonts, and inline images all render
      // correctly (unlike client-side rasterization).
      const res = await fetch('/api/email-builder/render-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, filename }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
       
      alert(`PDF generation failed: ${e}`)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {embedded ? (
        <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <div className="text-terminal-accent text-sm font-bold tracking-wider uppercase">Personalized Fundraising Email</div>
            <div className="text-terminal-muted text-xs mt-0.5">Pre-filled with copy tailored to this donor — set your brand, style it, and export.</div>
          </div>
          {onClose && <button onClick={onClose} className="text-terminal-muted hover:text-terminal-accent text-2xl leading-none px-2 flex-shrink-0">×</button>}
        </div>
      ) : (
        <TopBarPortal>
        <div className="px-4 py-3 border-b border-terminal-border bg-terminal-panel">
          <div className="text-terminal-accent text-sm font-bold tracking-wider uppercase">Email Builder</div>
          <div className="text-terminal-muted text-xs mt-0.5">Generate Mailchimp-ready fundraising email HTML — paste into the source view of your campaign.</div>
        </div>
        </TopBarPortal>
      )}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left: form */}
        <div className="md:w-1/2 overflow-y-auto p-4 space-y-5 border-r border-terminal-border">
          {/* Brand panel */}
          <section className="border border-terminal-border bg-terminal-panel p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-terminal-muted text-xs uppercase tracking-wider">Candidate Brand</div>
              <div className="flex gap-1">
                <button onClick={onNewBrand} className="text-xs text-terminal-muted border border-terminal-border px-2 py-0.5 hover:border-terminal-accent hover:text-terminal-accent">+ New</button>
                {draftBrand.id && (
                  <button onClick={onDeleteBrand} className="text-xs text-terminal-muted border border-terminal-border px-2 py-0.5 hover:border-terminal-red hover:text-terminal-red">Delete</button>
                )}
              </div>
            </div>

            {brands.length > 0 && (
              <select
                value={activeBrandId}
                onChange={e => setActiveBrandId(e.target.value)}
                className="w-full bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs mb-3 focus:outline-none focus:border-terminal-accent"
              >
                <option value="">— New brand —</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name || '(unnamed)'}</option>)}
              </select>
            )}

            <div className="space-y-2">
              <Field label="Candidate / committee name">
                <input
                  value={draftBrand.name}
                  onChange={e => setDraftBrand({ ...draftBrand, name: e.target.value })}
                  placeholder="Jane Doe for State Rep"
                  className="w-full bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs focus:outline-none focus:border-terminal-accent"
                />
              </Field>

              <Field label="Website URL">
                <div className="flex gap-1">
                  <input
                    value={draftBrand.website}
                    onChange={e => setDraftBrand({ ...draftBrand, website: e.target.value })}
                    placeholder="https://janedoeforstaterep.com"
                    className="flex-1 bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs focus:outline-none focus:border-terminal-accent"
                  />
                  <button
                    onClick={onScrape}
                    disabled={scraping || !draftBrand.website.trim()}
                    className="text-xs px-2 py-0.5 border border-terminal-accent text-terminal-accent hover:bg-terminal-accent hover:text-white transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    {scraping ? 'Scraping…' : 'Auto-fill'}
                  </button>
                </div>
                {scrapeError && <div className="text-terminal-red text-xs mt-1">{scrapeError}</div>}
              </Field>

              <Field label="Logo URL (paste from Mailchimp media library)">
                <div className="flex gap-1">
                  <input
                    value={draftBrand.logo_url}
                    onChange={e => setDraftBrand({ ...draftBrand, logo_url: e.target.value })}
                    placeholder="https://mcusercontent.com/.../logo.png"
                    className="flex-1 bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs focus:outline-none focus:border-terminal-accent"
                  />
                  <button
                    type="button"
                    onClick={onExtractPalette}
                    disabled={extractingPalette || !draftBrand.logo_url.trim()}
                    className="text-xs px-2 py-0.5 border border-terminal-accent text-terminal-accent hover:bg-terminal-accent hover:text-white transition-colors disabled:opacity-40 whitespace-nowrap"
                    title="Analyze the logo image and auto-set primary / secondary / tertiary brand colors"
                  >
                    {extractingPalette ? 'Analyzing…' : 'Extract palette'}
                  </button>
                </div>
              </Field>

              <Field label="Brand color palette (auto-extracted from logo — override any swatch manually)">
                <div className="grid grid-cols-3 gap-2">
                  <ColorBox
                    label="Primary"
                    value={draftBrand.primary_color}
                    onChange={v => setDraftBrand({ ...draftBrand, primary_color: v })}
                  />
                  <ColorBox
                    label="Secondary"
                    value={draftBrand.secondary_color || ''}
                    onChange={v => setDraftBrand({ ...draftBrand, secondary_color: v })}
                    enabled={draftBrand.secondary_enabled !== false}
                    onToggleEnabled={v => setDraftBrand({ ...draftBrand, secondary_enabled: v })}
                  />
                  <ColorBox
                    label="Tertiary"
                    value={draftBrand.tertiary_color || ''}
                    onChange={v => setDraftBrand({ ...draftBrand, tertiary_color: v })}
                    enabled={draftBrand.tertiary_enabled !== false}
                    onToggleEnabled={v => setDraftBrand({ ...draftBrand, tertiary_enabled: v })}
                  />
                </div>
                <div className="text-terminal-muted text-[10px] mt-1.5 leading-relaxed">
                  <strong className="text-terminal-text">Primary</strong> styles buttons + accent bar. <strong className="text-terminal-text">Secondary</strong> styles inline links. <strong className="text-terminal-text">Tertiary</strong> styles the social-row heading + a thin divider above the footer. Toggle Secondary or Tertiary off to use only one or two brand colors.
                </div>
                {paletteDefault && paletteAlternatives.length > 0 && (() => {
                  // Index 0 is the original auto-default; 1..N are alternatives.
                  const cycle: PaletteVariant[] = [paletteDefault, ...paletteAlternatives]
                  const total = cycle.length
                  const idx = ((paletteAltIndex % total) + total) % total
                  const current = cycle[idx]
                  const isDefault = idx === 0
                  const apply = (newIdx: number) => {
                    const next = ((newIdx % total) + total) % total
                    setPaletteAltIndex(next)
                    const p = cycle[next]
                    setDraftBrand({
                      ...draftBrand,
                      primary_color: p.primary_color,
                      secondary_color: p.secondary_color,
                      tertiary_color: p.tertiary_color,
                    })
                  }
                  return (
                    <div className="mt-3 pt-2 border-t border-terminal-border space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="text-terminal-muted text-[10px] uppercase tracking-wider">
                          Palette {idx + 1} of {total} {isDefault && <span className="text-terminal-accent">· default</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setPaletteAlternatives([]); setPaletteDefault(null) }}
                          className="text-[10px] text-terminal-muted hover:text-terminal-red"
                          title="Hide the palette cycler"
                        >clear</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => apply(idx - 1)}
                          className="text-xs px-2 py-1 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent transition-colors"
                          title="Previous palette"
                        >← Prev</button>
                        <div className="flex-1 flex items-center gap-1.5 p-1.5 border border-terminal-accent bg-terminal-accent/5">
                          <span className="inline-block w-7 h-6 border border-terminal-border flex-shrink-0" style={{ backgroundColor: current.primary_color }} />
                          <span className="inline-block w-7 h-6 border border-terminal-border flex-shrink-0" style={{ backgroundColor: current.secondary_color }} />
                          <span className="inline-block w-7 h-6 border border-terminal-border flex-shrink-0" style={{ backgroundColor: current.tertiary_color }} />
                          <span className="font-mono text-[10px] text-terminal-muted ml-1 flex-1 text-left truncate">
                            {current.primary_color} · {current.secondary_color} · {current.tertiary_color}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => apply(idx + 1)}
                          className="text-xs px-2 py-1 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent transition-colors"
                          title="Next palette"
                        >Next →</button>
                      </div>
                      <div className="text-terminal-muted text-[10px] leading-relaxed">
                        Cycle through palettes to find one you like. Position 1 is the original auto-default; later positions are dominance-skip variants and color-theory derivations (triadic, complementary, analogous, tonal). Each click auto-applies to the brand colors above.
                      </div>
                    </div>
                  )
                })()}
              </Field>

              <Field label="Default donate URL (used for tier cards, CTA button, and any [Donate] link)">
                <input
                  value={draftBrand.donate_url}
                  onChange={e => setDraftBrand({ ...draftBrand, donate_url: e.target.value })}
                  placeholder="https://secure.actblue.com/donate/jane-doe"
                  className="w-full bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs focus:outline-none focus:border-terminal-accent"
                />
              </Field>

              <Field label="Button text alignment">
                <div className="flex gap-1">
                  {(['left', 'center', 'right', 'justify'] as ButtonAlign[]).map(opt => {
                    const active = (draftBrand.button_alignment || 'center') === opt
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setDraftBrand({ ...draftBrand, button_alignment: opt })}
                        className={`flex-1 text-xs uppercase tracking-wider py-1.5 border transition-colors ${active ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10' : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'}`}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <Field label="Paid-for-by statement (FEC/MEC disclaimer)">
                <textarea
                  value={draftBrand.paid_for_by || ''}
                  onChange={e => setDraftBrand({ ...draftBrand, paid_for_by: e.target.value })}
                  placeholder="Paid for by Jane Doe for State Rep, John Smith Treasurer."
                  rows={1}
                  className="w-full bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs leading-relaxed focus:outline-none focus:border-terminal-accent"
                />
                <div className="text-terminal-muted text-[10px] mt-1">
                  Appears centered at the bottom of every email built from this brand. MEC requires the exact registered committee name and current treasurer (e.g. "Paid for by Friends of Jane Doe, John Smith, Treasurer.").
                </div>
                {!(draftBrand.paid_for_by || '').trim() && (
                  <div className="mt-1.5 text-[10px] leading-relaxed text-terminal-red border border-terminal-red/50 bg-terminal-red/10 px-2 py-1">
                    ⚠ No disclaimer set. MEC compliance is required — the email will ship a red placeholder in the footer until you add the committee name + treasurer here.
                  </div>
                )}
              </Field>

              <div className="border-t border-terminal-border pt-2 mt-2">
                <button
                  type="button"
                  onClick={() => setSocialOpen(o => !o)}
                  className="w-full flex items-center gap-2 text-terminal-muted hover:text-terminal-accent transition-colors mb-2"
                  title={socialOpen ? 'Collapse social media URLs' : 'Expand social media URLs'}
                >
                  <span className="text-[10px] uppercase tracking-wider w-3 inline-block">{socialOpen ? '▾' : '▸'}</span>
                  <span className="text-[10px] uppercase tracking-wider">Social media links</span>
                  {(() => {
                    const filled = SOCIAL_PLATFORMS.filter(p => ((draftBrand as any)[p.key] || '').trim()).length
                    return filled > 0 && (
                      <span className="text-[10px] uppercase tracking-wider text-terminal-accent ml-auto">{filled} set</span>
                    )
                  })()}
                </button>
                {socialOpen && (
                  <>
                    <div className="text-terminal-muted text-[10px] mb-2 leading-relaxed">
                      Each populated URL becomes a circular icon button in the email footer (above the paid-for-by line). Empty fields are skipped — buttons only appear for the platforms you fill in.
                    </div>
                    <div className="space-y-1.5">
                      {SOCIAL_PLATFORMS.map(p => (
                        <div key={p.key} className="flex items-center gap-2">
                          <span
                            className="inline-block w-6 h-6 rounded-full flex-shrink-0"
                            style={{ backgroundColor: p.bg === 'BRAND' ? draftBrand.primary_color : p.bg }}
                            title={p.label}
                          />
                          <input
                            value={(draftBrand as any)[p.key] || ''}
                            onChange={e => setDraftBrand({ ...draftBrand, [p.key]: e.target.value })}
                            placeholder={p.placeholder}
                            className="flex-1 bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs focus:outline-none focus:border-terminal-accent"
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={onSaveBrand}
                disabled={!draftBrand.name.trim()}
                className="w-full text-xs uppercase tracking-wider py-1.5 border border-terminal-accent text-terminal-accent hover:bg-terminal-accent hover:text-white transition-colors disabled:opacity-40 mt-1"
              >
                {draftBrand.id ? 'Update Brand' : 'Save Brand'}
              </button>
            </div>
          </section>

          {/* Email content */}
          <section className="border border-terminal-border bg-terminal-panel p-3 space-y-2">
            <div className="text-terminal-muted text-xs uppercase tracking-wider mb-2">Email Content</div>

            <Field label="Subject line">
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs focus:outline-none focus:border-terminal-accent"
              />
            </Field>

            <Field label="Preheader (inbox preview text)">
              <input
                value={preheader}
                onChange={e => setPreheader(e.target.value)}
                className="w-full bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs focus:outline-none focus:border-terminal-accent"
              />
            </Field>

            <Field label="Body">
              <RichEditor
                value={body}
                onChange={setBody}
                pasteFlash={pasteFlash}
                setPasteFlash={setPasteFlash}
                brandColor={draftBrand.primary_color}
                allowDonationsButton
                donationsAlreadyPresent={hasDonationsBlock}
              />
              <div className="text-terminal-muted text-[10px] mt-1 leading-relaxed">
                Use the toolbar for bold/italic/underline, lists, text & highlight color, links. Paste from Word, Google Docs, or any webpage — formatting and hyperlinks are preserved. A hyperlink <strong>alone on its own paragraph</strong> renders as a styled button in the email preview; hyperlinks <em>inside a sentence</em> stay as inline links. Click <strong>💰 Donate Block</strong> to drop a donation tier stack + CTA button at the cursor (one per email; uses the brand's donate URL for every tier).
              </div>
            </Field>

            <DonationsPanel
              donations={donations}
              setDonations={(d) => { setDonations(d); setDonationsSaveStatus('idle') }}
              donateUrl={draftBrand.donate_url}
              brandDefaults={{
                heading: draftBrand.default_donations_heading ?? DEFAULT_DONATIONS_HEADING,
                cta_label: draftBrand.default_cta_label ?? DEFAULT_CTA_LABEL,
                tiers: draftBrand.default_donation_tiers ?? DEFAULT_TIERS,
                card_width: draftBrand.default_card_width ?? 'full',
                cta_size: draftBrand.default_cta_size ?? 'standard',
              }}
              placeholderInBody={hasDonationsBlock}
              saveStatus={donationsSaveStatus}
              onSaveAsDefault={() => {
                // Write current donations content to the active brand's defaults
                // so subsequent emails (and the Reset button) use it. If the
                // active brand is unsaved, we just update draftBrand; the user
                // still needs to click "Save Brand" to persist to localStorage.
                const next: Brand = {
                  ...draftBrand,
                  default_donations_heading: donations.heading,
                  default_cta_label: donations.cta_label,
                  default_donation_tiers: donations.tiers.map(t => ({ ...t })),
                  default_card_width: donations.card_width || 'full',
                  default_cta_size: donations.cta_size || 'standard',
                }
                setDraftBrand(next)
                if (draftBrand.id) {
                  // Brand is saved — persist to the brands list immediately so
                  // it sticks across reloads without requiring "Save Brand".
                  const updated = brands.map(b => b.id === draftBrand.id ? next : b)
                  setBrands(updated)
                  saveBrands(updated)
                }
                setDonationsSaveStatus('saved')
                window.setTimeout(() => setDonationsSaveStatus('idle'), 2500)
              }}
            />

            <Field label="Sign-off">
              <RichEditor value={signoff} onChange={setSignoff} pasteFlash={pasteFlash} setPasteFlash={setPasteFlash} brandColor={draftBrand.primary_color} compact />
              <div className="text-terminal-muted text-[10px] mt-1 leading-relaxed">
                Same toolbar as the body — bold/italic/lists/colors/links/images/merge tags all work. Typical sign-off: name, title, optional photo or signature image.
              </div>
            </Field>
          </section>
        </div>

        {/* Right: preview + actions */}
        <div className="md:w-1/2 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-terminal-border bg-terminal-panel flex items-center gap-1 overflow-x-auto">
            <div className="text-terminal-muted text-[10px] uppercase tracking-wider">Preview</div>
            <div className="flex-1" />
            <button
              onClick={() => { setImportOpen(true) }}
              className="text-[10px] px-1.5 py-0.5 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent transition-colors whitespace-nowrap"
              title="Paste another email's HTML — extract logo and colors. Save the result as a reference brand."
            >
              📥 Import
            </button>
            <button
              onClick={() => { setFullPreviewOpen(true) }}
              className="text-[10px] px-1.5 py-0.5 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent transition-colors whitespace-nowrap"
              title="Full-screen preview with desktop / mobile / dark-mode toggles"
            >
              🖥 Full
            </button>
            <button
              onClick={() => { setTestSendOpen(true); setTestSendError(null) }}
              className="text-[10px] px-1.5 py-0.5 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent transition-colors whitespace-nowrap"
              title="Send a test copy to your email so you can verify rendering in real Gmail / Outlook / Apple Mail"
            >
              📧 Test
            </button>
            <button
              onClick={() => setShowSource(s => !s)}
              className="text-[10px] px-1.5 py-0.5 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent transition-colors whitespace-nowrap"
              title="Toggle between rendered preview and raw HTML"
            >
              {showSource ? 'Preview' : 'Source'}
            </button>
            <button
              onClick={onCopy}
              className="text-[10px] px-1.5 py-0.5 border border-terminal-accent text-terminal-accent hover:bg-terminal-accent hover:text-white transition-colors whitespace-nowrap"
              title="Copy the rendered HTML to clipboard"
            >
              {copyState === 'done' ? '✓ Copied' : 'Copy'}
            </button>
            <button
              onClick={onDownload}
              className="text-[10px] px-1.5 py-0.5 border border-terminal-accent text-terminal-accent hover:bg-terminal-accent hover:text-white transition-colors whitespace-nowrap"
              title="Download the rendered HTML as a .html file"
            >
              ↓ HTML
            </button>
            <button
              onClick={onDownloadPdf}
              disabled={pdfBusy}
              className="text-[10px] px-1.5 py-0.5 border border-terminal-accent text-terminal-accent hover:bg-terminal-accent hover:text-white transition-colors disabled:opacity-50 whitespace-nowrap"
              title="Render the current preview as a single-page PDF (no headers/footers)"
            >
              {pdfBusy ? '…' : '↓ PDF'}
            </button>
          </div>

          <div className="flex-1 overflow-hidden bg-[#f4f4f4]">
            {showSource ? (
              <pre className="w-full h-full overflow-auto bg-terminal-bg text-terminal-text text-xs font-mono p-4 whitespace-pre-wrap break-all">{html}</pre>
            ) : (
              <iframe
                title="Email preview"
                srcDoc={html}
                className="w-full h-full border-0 bg-white"
                sandbox="allow-same-origin"
              />
            )}
          </div>
        </div>
      </div>

      {fullPreviewOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm"
          onClick={() => setFullPreviewOpen(false)}
        >
          <div
            className="flex items-center gap-3 px-4 py-2 bg-terminal-panel border-b border-terminal-border"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-terminal-accent text-sm font-bold tracking-wider uppercase">🖥 Full Preview</div>
            <div className="flex-1" />
            <div className="flex gap-1">
              <button
                onClick={() => setPreviewMode('desktop')}
                className={`text-xs uppercase tracking-wider px-3 py-1 border transition-colors ${
                  previewMode === 'desktop'
                    ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
                    : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'
                }`}
                title="600px wide — typical inbox view"
              >
                🖥 Desktop (600px)
              </button>
              <button
                onClick={() => setPreviewMode('mobile')}
                className={`text-xs uppercase tracking-wider px-3 py-1 border transition-colors ${
                  previewMode === 'mobile'
                    ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
                    : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'
                }`}
                title="375px wide — phone view (iPhone-sized)"
              >
                📱 Mobile (375px)
              </button>
              <button
                onClick={() => setPreviewDark(d => !d)}
                className={`text-xs uppercase tracking-wider px-3 py-1 border transition-colors ${
                  previewDark
                    ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
                    : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'
                }`}
                title="Simulate Apple Mail / Outlook 365 dark mode (auto-inverts near-white backgrounds)"
              >
                {previewDark ? '☾ Dark' : '☀ Light'}
              </button>
            </div>
            <button
              onClick={() => setFullPreviewOpen(false)}
              className="text-terminal-muted hover:text-terminal-text text-xl leading-none px-3"
              title="Close (or click outside)"
            >×</button>
          </div>
          <div
            className="flex-1 overflow-auto py-6 px-4 flex justify-center items-start bg-[#f4f4f4]"
            onClick={e => e.stopPropagation()}
          >
            <div
              className={`${previewMode === 'mobile' ? 'shadow-2xl rounded-[2rem] border-[10px] border-black overflow-hidden' : 'shadow-2xl'} bg-white`}
              style={{ width: previewMode === 'mobile' ? 375 : 600, maxWidth: '100%' }}
            >
              <iframe
                title="Full-screen email preview"
                srcDoc={darkPreviewHtml}
                className="w-full border-0 block"
                style={{ height: previewMode === 'mobile' ? '700px' : '900px', backgroundColor: previewDark ? '#0d0d0d' : '#ffffff' }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>
          <div
            className="px-4 py-2 bg-terminal-panel border-t border-terminal-border text-terminal-muted text-[10px] uppercase tracking-wider text-center"
            onClick={e => e.stopPropagation()}
          >
            Click outside or press the × button to close · ESC also works
          </div>
        </div>
      )}

      {testSendOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setTestSendOpen(false)}
        >
          <div
            className="bg-terminal-panel border border-terminal-border w-[440px] max-w-[92vw] p-4 space-y-3 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-terminal-accent text-sm font-bold tracking-wider uppercase">📧 Test Send</div>
              <button
                onClick={() => setTestSendOpen(false)}
                className="text-terminal-muted hover:text-terminal-text text-lg leading-none px-2"
                title="Close"
              >×</button>
            </div>
            <div className="text-terminal-muted text-[10px] leading-relaxed">
              Sends the rendered email to a single address so you can verify rendering in real Gmail / Outlook / Apple Mail before pasting into Mailchimp. Subject is prefixed with <code className="text-terminal-text">[TEST]</code>.
            </div>
            <input
              value={testSendEmail}
              onChange={e => { setTestSendEmail(e.target.value); setTestSendError(null) }}
              type="email"
              placeholder="your@email.com"
              autoFocus
              className="w-full bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs focus:outline-none focus:border-terminal-accent"
              onKeyDown={e => { if (e.key === 'Enter' && testSendEmail.trim()) (e.target as HTMLInputElement).blur() }}
            />
            {testSendError && (
              <div className="text-terminal-red text-[10px] border border-terminal-red/40 bg-terminal-red/10 px-2 py-1.5 leading-relaxed">
                {testSendError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const to = testSendEmail.trim()
                  if (!to) return
                  setTestSendStatus('sending')
                  setTestSendError(null)
                  try {
                    const res = await fetch('/api/email-builder/test-send', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ to, subject, html }),
                    })
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}))
                      throw new Error(data.detail || `HTTP ${res.status}`)
                    }
                    setTestSendStatus('sent')
                    window.setTimeout(() => { setTestSendStatus('idle'); setTestSendOpen(false) }, 1800)
                  } catch (e) {
                    setTestSendStatus('idle')
                    setTestSendError(String(e instanceof Error ? e.message : e))
                  }
                }}
                disabled={testSendStatus === 'sending' || !testSendEmail.trim()}
                className={`flex-1 text-xs uppercase tracking-wider py-2 border transition-colors ${
                  testSendStatus === 'sent'
                    ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
                    : 'border-terminal-accent text-terminal-accent hover:bg-terminal-accent hover:text-white'
                } disabled:opacity-40`}
              >
                {testSendStatus === 'sending' ? 'Sending…' : testSendStatus === 'sent' ? '✓ Sent' : 'Send Test'}
              </button>
              <button
                onClick={() => setTestSendOpen(false)}
                className="text-xs uppercase tracking-wider px-3 py-2 border border-terminal-border text-terminal-muted hover:text-terminal-text"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <ImportHtmlModal
          html={importHtml}
          setHtml={setImportHtml}
          extracted={extracted}
          setExtracted={setExtracted}
          picks={picks}
          setPicks={setPicks}
          close={() => setImportOpen(false)}
          onApplyToCurrent={(fields) => {
            setDraftBrand({ ...draftBrand, ...fields })
            setImportOpen(false)
          }}
          onSaveAsNewBrand={(fields) => {
            const name = window.prompt('Name this reference (e.g. "Bernie 2024 palette", "Slisz navy/red/gold"):')
            if (!name?.trim()) return
            const newBrand: Brand = { ...EMPTY_BRAND, ...fields, id: newBrandId(), name: name.trim() }
            const updated = [...brands, newBrand]
            setBrands(updated)
            saveBrands(updated)
            setActiveBrandId(newBrand.id)
            setImportOpen(false)
          }}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-terminal-muted text-[10px] uppercase tracking-wider mb-1">{label}</div>
      {children}
    </label>
  )
}

interface DonationsPanelProps {
  donations: DonationsData
  setDonations: (d: DonationsData) => void
  donateUrl: string
  brandDefaults: DonationsData
  placeholderInBody: boolean
  onSaveAsDefault: () => void
  saveStatus: 'idle' | 'saved'
}

function DonationsPanel({ donations, setDonations, donateUrl, brandDefaults, placeholderInBody, onSaveAsDefault, saveStatus }: DonationsPanelProps) {
  const updateTier = (i: number, patch: Partial<DonationTier>) => {
    const next = donations.tiers.map((t, idx) => idx === i ? { ...t, ...patch } : t)
    setDonations({ ...donations, tiers: next })
  }
  const addTier = () => {
    if (donations.tiers.length >= MAX_TIERS) return
    setDonations({
      ...donations,
      tiers: [...donations.tiers, { amount: '$10', suffix: '/ month', impact: '' }],
    })
  }
  const removeTier = (i: number) => {
    setDonations({ ...donations, tiers: donations.tiers.filter((_, idx) => idx !== i) })
  }
  const reset = () => {
    setDonations({
      heading: brandDefaults.heading,
      cta_label: brandDefaults.cta_label,
      tiers: brandDefaults.tiers.slice(0, MAX_TIERS).map(t => ({ ...t })),
      card_width: brandDefaults.card_width,
      cta_size: brandDefaults.cta_size,
    })
  }
  const inputCls = "w-full bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs focus:outline-none focus:border-terminal-accent"
  const canAdd = donations.tiers.length < MAX_TIERS
  const cardWidth: CardWidth = donations.card_width || 'full'
  const ctaSize: CtaSize = donations.cta_size || 'standard'
  const segBtn = (active: boolean) =>
    `flex-1 text-[10px] uppercase tracking-wider py-1.5 border transition-colors ${
      active
        ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
        : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'
    }`
  return (
    <div className="border border-terminal-border bg-terminal-bg/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-terminal-muted text-[10px] uppercase tracking-wider">Donations Block</div>
        <span
          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 border ${placeholderInBody ? 'border-terminal-accent text-terminal-accent' : 'border-terminal-border text-terminal-muted'}`}
          title={placeholderInBody ? 'A placeholder is in the body — this content renders inline at that spot' : 'Insert via the body toolbar (💰 Donate Block) to render this in the email'}
        >
          {placeholderInBody ? 'Inserted' : 'Not in body'}
        </span>
      </div>
      {!placeholderInBody && (
        <div className="text-terminal-muted text-[10px] leading-relaxed">
          Click <strong className="text-terminal-text">💰 Donate Block</strong> in the body toolbar to drop the tier stack + CTA where you want it. The content below is what will render at that spot.
        </div>
      )}
      {!donateUrl?.trim() && (
        <div className="text-terminal-red text-[10px] leading-relaxed border border-terminal-red/40 bg-terminal-red/10 px-2 py-1.5">
          ⚠ No donate URL set on this brand. Every tier card and the CTA button will be a dead link until you fill in the brand's <strong>Default donate URL</strong> field above.
        </div>
      )}
      <Field label="Heading (optional intro line, italic Georgia)">
        <textarea
          value={donations.heading}
          onChange={e => setDonations({ ...donations, heading: e.target.value })}
          rows={2}
          className={inputCls + ' leading-relaxed'}
        />
      </Field>
      <Field label="CTA button label (auto-uppercased, trailing arrow added)">
        <input
          value={donations.cta_label}
          onChange={e => setDonations({ ...donations, cta_label: e.target.value })}
          placeholder="CHIP IN TODAY"
          className={inputCls}
        />
      </Field>
      <Field label="Tier card width">
        <div className="flex gap-1">
          {(['tight', 'standard', 'wide', 'full'] as CardWidth[]).map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setDonations({ ...donations, card_width: opt })}
              className={segBtn(cardWidth === opt)}
              title={`Tier cards render at ${CARD_WIDTH_PCT[opt]}% of the email column`}
            >
              {opt} {CARD_WIDTH_PCT[opt]}%
            </button>
          ))}
        </div>
      </Field>
      <Field label="CTA button size">
        <div className="flex gap-1">
          {(['compact', 'standard', 'generous'] as CtaSize[]).map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setDonations({ ...donations, cta_size: opt })}
              className={segBtn(ctaSize === opt)}
              title={`Padding ${CTA_SIZE_SPEC[opt].padding}, font ${CTA_SIZE_SPEC[opt].fontSize}`}
            >
              {opt}
            </button>
          ))}
        </div>
      </Field>
      <div className="text-terminal-muted text-[10px] uppercase tracking-wider mt-1">
        Tiers ({donations.tiers.length} / {MAX_TIERS})
      </div>
      <div className="space-y-2">
        {donations.tiers.map((t, i) => (
          <div key={i} className="border border-terminal-border bg-terminal-bg p-2 space-y-1.5">
            <div className="flex gap-1">
              <input
                value={t.amount}
                onChange={e => updateTier(i, { amount: e.target.value })}
                placeholder="$7"
                className={inputCls + ' w-20 flex-shrink-0'}
                style={{ width: '5rem' }}
              />
              <input
                value={t.suffix}
                onChange={e => updateTier(i, { suffix: e.target.value })}
                placeholder="/ month"
                className={inputCls + ' flex-1'}
              />
              <button
                type="button"
                onClick={() => removeTier(i)}
                className="text-[10px] uppercase tracking-wider px-2 border border-terminal-border text-terminal-muted hover:border-terminal-red hover:text-terminal-red"
                title="Remove tier"
              >
                ×
              </button>
            </div>
            <input
              value={t.impact}
              onChange={e => updateTier(i, { impact: e.target.value })}
              placeholder="a digital ad seen by 200 voters in your district"
              className={inputCls}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={addTier}
          disabled={!canAdd}
          className="flex-1 text-[10px] uppercase tracking-wider py-1.5 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent disabled:opacity-40 disabled:hover:border-terminal-border disabled:hover:text-terminal-muted"
        >
          + Add tier {canAdd ? '' : `(max ${MAX_TIERS})`}
        </button>
      </div>
      <div className="flex gap-2 pt-1 border-t border-terminal-border mt-2">
        <button
          type="button"
          onClick={reset}
          className="flex-1 text-[10px] uppercase tracking-wider py-1.5 border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent mt-2"
          title="Replace this email's donations content with the brand defaults"
        >
          Reset to brand defaults
        </button>
        <button
          type="button"
          onClick={onSaveAsDefault}
          className={`flex-1 text-[10px] uppercase tracking-wider py-1.5 border mt-2 transition-colors ${
            saveStatus === 'saved'
              ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
              : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'
          }`}
          title="Save this email's donations content as the brand's default for new emails"
        >
          {saveStatus === 'saved' ? '✓ Saved as default' : 'Save as brand default'}
        </button>
      </div>
    </div>
  )
}

interface ImportHtmlModalProps {
  html: string
  setHtml: (s: string) => void
  extracted: ExtractedEmail | null
  setExtracted: (e: ExtractedEmail | null) => void
  picks: Record<string, boolean>
  setPicks: (p: Record<string, boolean>) => void
  close: () => void
  onApplyToCurrent: (fields: Partial<Brand>) => void
  onSaveAsNewBrand: (fields: Partial<Brand>) => void
}

// Each entry maps the ExtractedEmail field to the Brand field it writes into,
// plus a label for the UI checkbox row.
const IMPORT_FIELDS: { key: keyof ExtractedEmail; brandKey: keyof Brand; label: string; isColor?: boolean; isUrl?: boolean }[] = [
  { key: 'logo_url',         brandKey: 'logo_url',         label: 'Logo URL',           isUrl: true },
  { key: 'primary_color',    brandKey: 'primary_color',    label: 'Primary color',      isColor: true },
  { key: 'secondary_color',  brandKey: 'secondary_color',  label: 'Secondary color',    isColor: true },
  { key: 'tertiary_color',   brandKey: 'tertiary_color',   label: 'Tertiary color',     isColor: true },
  { key: 'header_color',     brandKey: 'header_color',     label: 'Header bg color',    isColor: true },
]

function ImportHtmlModal({ html, setHtml, extracted, setExtracted, picks, setPicks, close, onApplyToCurrent, onSaveAsNewBrand }: ImportHtmlModalProps) {
  const runExtract = () => {
    if (!html.trim()) return
    const result = extractFromEmailHtml(html)
    setExtracted(result)
    // Default: pre-check every field that was actually populated.
    const initialPicks: Record<string, boolean> = {}
    for (const f of IMPORT_FIELDS) {
      const v = (result as any)[f.key]
      initialPicks[f.key] = !!(v && String(v).trim())
    }
    setPicks(initialPicks)
  }

  const editField = (key: keyof ExtractedEmail, value: string) => {
    if (!extracted) return
    setExtracted({ ...extracted, [key]: value })
  }

  const fieldsToApply = (): Partial<Brand> => {
    if (!extracted) return {}
    const out: Partial<Brand> = {}
    for (const f of IMPORT_FIELDS) {
      if (picks[f.key]) {
        const val = (extracted as any)[f.key] as string
        if (val !== undefined) (out as any)[f.brandKey] = val
      }
    }
    return out
  }

  const previewSrc = html.trim() ? preprocessEmailHtml(html) : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={close}>
      <div
        className="bg-terminal-panel border border-terminal-border w-[min(1200px,95vw)] h-[min(900px,92vh)] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-border">
          <div className="text-terminal-accent text-sm font-bold tracking-wider uppercase">📥 Import from Email HTML</div>
          <button
            onClick={close}
            className="text-terminal-muted hover:text-terminal-text text-lg leading-none px-2"
            title="Close"
          >×</button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: paste textarea + live preview */}
          <div className="w-1/2 flex flex-col border-r border-terminal-border overflow-hidden">
            <div className="px-3 py-2 border-b border-terminal-border bg-terminal-bg/50">
              <div className="text-terminal-muted text-[10px] uppercase tracking-wider">Paste raw email source HTML</div>
              <div className="text-terminal-muted text-[10px] mt-0.5 leading-relaxed">
                In Gmail: open the email → click ⋮ → "Show original" → copy everything from the message body. Quoted-printable encoding (`=3D` etc.) is auto-decoded.
              </div>
            </div>
            <textarea
              value={html}
              onChange={e => setHtml(e.target.value)}
              placeholder="Paste the email HTML here…"
              className="flex-1 bg-terminal-bg text-terminal-text font-mono text-[11px] p-2 border-b border-terminal-border focus:outline-none resize-none"
              spellCheck={false}
            />
            <div className="px-3 py-2 flex gap-2 border-b border-terminal-border bg-terminal-bg/50">
              <button
                onClick={runExtract}
                disabled={!html.trim()}
                className="flex-1 text-xs uppercase tracking-wider py-1.5 border border-terminal-accent text-terminal-accent hover:bg-terminal-accent hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-terminal-accent"
              >
                Extract
              </button>
              <button
                onClick={() => { setHtml(''); setExtracted(null); setPicks({}) }}
                className="text-xs uppercase tracking-wider px-3 py-1.5 border border-terminal-border text-terminal-muted hover:border-terminal-red hover:text-terminal-red"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-hidden bg-white min-h-0">
              {previewSrc ? (
                <iframe
                  title="Pasted email preview"
                  srcDoc={previewSrc}
                  className="w-full h-full border-0"
                  sandbox=""
                />
              ) : (
                <div className="text-terminal-muted text-xs p-4 italic">Preview appears here once you paste HTML.</div>
              )}
            </div>
          </div>

          {/* Right: extracted fields review */}
          <div className="w-1/2 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-terminal-border bg-terminal-bg/50">
              <div className="text-terminal-muted text-[10px] uppercase tracking-wider">Extracted aesthetics</div>
              <div className="text-terminal-muted text-[10px] mt-0.5 leading-relaxed">
                Visual design only — colors and logo. Body copy, donate URLs, social handles, paid-for-by, and candidate names are NOT extracted (this tool is for poaching design, not borrowing identities). Check what to keep, edit inline if extraction missed something.
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {!extracted && (
                <div className="text-terminal-muted text-xs italic p-3 border border-dashed border-terminal-border">
                  Paste HTML on the left and click <strong>Extract</strong> to see what comes out.
                </div>
              )}

              {extracted && (
                <>
                  {/* Brand fields — each row: checkbox, label, editable value, optional swatch */}
                  {IMPORT_FIELDS.map(f => {
                    const value = (extracted as any)[f.key] as string
                    const valid = value && String(value).trim().length > 0
                    return (
                      <div key={f.key} className={`border ${valid ? 'border-terminal-border' : 'border-terminal-border/40'} bg-terminal-bg p-2 ${valid ? '' : 'opacity-50'}`}>
                        <label className="flex items-center gap-2 text-[11px] cursor-pointer mb-1">
                          <input
                            type="checkbox"
                            checked={!!picks[f.key]}
                            disabled={!valid}
                            onChange={e => setPicks({ ...picks, [f.key]: e.target.checked })}
                            className="cursor-pointer disabled:cursor-not-allowed"
                          />
                          <span className="text-terminal-text uppercase tracking-wider text-[10px] font-bold flex-1">{f.label}</span>
                          {f.isColor && valid && (
                            <span
                              className="inline-block w-5 h-5 border border-terminal-border"
                              style={{ backgroundColor: value }}
                              title={value}
                            />
                          )}
                          {!valid && <span className="text-terminal-muted text-[10px] italic">not detected</span>}
                        </label>
                        <input
                          value={value || ''}
                          onChange={e => editField(f.key, e.target.value)}
                          className="w-full bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1 text-[11px] focus:outline-none focus:border-terminal-accent"
                          placeholder={f.isColor ? '#000000' : f.isUrl ? 'https://…' : ''}
                        />
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* Bottom actions */}
            {extracted && (
              <div className="border-t border-terminal-border p-3 bg-terminal-bg/50 space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => onApplyToCurrent(fieldsToApply())}
                    className="flex-1 text-xs uppercase tracking-wider py-2 border border-terminal-accent text-terminal-accent hover:bg-terminal-accent hover:text-white transition-colors"
                    title="Overwrite checked colors / logo on the current brand. Still needs Save Brand to persist."
                  >
                    Apply to current brand
                  </button>
                  <button
                    onClick={() => onSaveAsNewBrand(fieldsToApply())}
                    className="flex-1 text-xs uppercase tracking-wider py-2 border border-terminal-accent text-terminal-accent hover:bg-terminal-accent hover:text-white transition-colors"
                    title="Create a new brand entry containing only the checked aesthetics. Always prompts for a name."
                  >
                    Save as new brand…
                  </button>
                </div>
                <div className="text-terminal-muted text-[10px] leading-relaxed">
                  <strong className="text-terminal-text">Save as new brand</strong> creates a partial brand with only the checked aesthetics — useful for stashing "Bernie's palette" or "Hawley's logo" as reference swatches. The brand dropdown becomes your design library.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface ColorRowProps {
  label: string
  value: string
  onChange: (v: string) => void
  enabled?: boolean
  onToggleEnabled?: (v: boolean) => void
}

// Compact 3-column color picker — label on top, swatch + hex side by side,
// optional On/Off pill in the corner. Used for the brand palette so primary /
// secondary / tertiary fit on one row.
function ColorBox({ label, value, onChange, enabled, onToggleEnabled }: ColorRowProps) {
  const isToggleable = typeof enabled === 'boolean' && !!onToggleEnabled
  const isOff = isToggleable && enabled === false
  return (
    <div className={`${isOff ? 'opacity-40' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-terminal-text uppercase tracking-wider">{label}</span>
        {isToggleable && (
          <button
            type="button"
            onClick={() => onToggleEnabled!(!enabled)}
            className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 border transition-colors ${enabled ? 'border-terminal-accent text-terminal-accent' : 'border-terminal-border text-terminal-muted'}`}
            title={enabled ? `Disable ${label.toLowerCase()} color` : `Enable ${label.toLowerCase()} color`}
          >
            {enabled ? 'On' : 'Off'}
          </button>
        )}
      </div>
      <div className="flex gap-1">
        <input
          type="color"
          value={value || '#000000'}
          onChange={e => onChange(e.target.value)}
          disabled={isOff}
          className="w-7 h-7 bg-terminal-bg border border-terminal-border cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
        />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={isOff}
          placeholder="#000000"
          className="flex-1 min-w-0 bg-terminal-bg border border-terminal-border text-terminal-text px-1.5 py-1 text-[11px] font-mono focus:outline-none focus:border-terminal-accent disabled:cursor-not-allowed"
        />
      </div>
    </div>
  )
}

interface RichEditorProps {
  value: string
  onChange: (html: string) => void
  brandColor: string
  pasteFlash: boolean
  setPasteFlash: (b: boolean) => void
  compact?: boolean
  allowDonationsButton?: boolean
  donationsAlreadyPresent?: boolean
}

function RichEditor({ value, onChange, brandColor, pasteFlash, setPasteFlash, compact, allowDonationsButton, donationsAlreadyPresent }: RichEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const lastSyncedRef = useRef<string>('')
  type MenuPos = { top: number; left: number; maxHeight: number }
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const tagMenuRef = useRef<HTMLDivElement>(null)
  const [tagMenuPos, setTagMenuPos] = useState<MenuPos>({ top: 0, left: 0, maxHeight: 400 })
  const [imgMenuOpen, setImgMenuOpen] = useState(false)
  const imgMenuRef = useRef<HTMLDivElement>(null)
  const [imgMenuPos, setImgMenuPos] = useState<MenuPos>({ top: 0, left: 0, maxHeight: 400 })
  const [divMenuOpen, setDivMenuOpen] = useState(false)
  const divMenuRef = useRef<HTMLDivElement>(null)
  const [divMenuPos, setDivMenuPos] = useState<MenuPos>({ top: 0, left: 0, maxHeight: 400 })

  // Compute viewport-fixed coords for a popover anchored to a button. Picks
  // below-the-button when there's room, otherwise flips above. Also nudges
  // left if the menu would spill off the right edge, and returns a max
  // height so the menu becomes internally scrollable rather than clipped
  // by the viewport edge.
  const computeMenuPos = (btn: HTMLElement, menuWidth: number, menuHeight = 400): MenuPos => {
    const rect = btn.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = rect.left
    if (left + menuWidth > vw - 8) left = Math.max(8, vw - menuWidth - 8)
    const gap = 4
    const spaceBelow = vh - rect.bottom - 8
    const spaceAbove = rect.top - 8
    if (spaceBelow >= menuHeight || spaceBelow >= spaceAbove) {
      return { top: rect.bottom + gap, left, maxHeight: Math.max(120, spaceBelow - gap) }
    }
    const usable = Math.min(menuHeight, spaceAbove - gap)
    return { top: Math.max(8, rect.top - gap - usable), left, maxHeight: Math.max(120, spaceAbove - gap) }
  }
  const [imgUrl, setImgUrl] = useState('')
  const [imgCaption, setImgCaption] = useState('')
  const [imgLayout, setImgLayout] = useState<'center' | 'full' | 'left' | 'right'>('center')
  const [imgFrame, setImgFrame] = useState<ImageFrame>('none')
  const [imgParallelText, setImgParallelText] = useState('')
  // Remember the last selection range inside the editor so opening the menu
  // (which moves focus to the button) doesn't lose the cursor position.
  const savedRange = useRef<Range | null>(null)

  // Close the merge-tag menu when clicking outside.
  useEffect(() => {
    if (!tagMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!tagMenuRef.current?.contains(e.target as Node)) setTagMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [tagMenuOpen])

  // Same for the image menu.
  useEffect(() => {
    if (!imgMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!imgMenuRef.current?.contains(e.target as Node)) setImgMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [imgMenuOpen])

  // Same for the divider menu.
  useEffect(() => {
    if (!divMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!divMenuRef.current?.contains(e.target as Node)) setDivMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [divMenuOpen])

  // Sync external value → editor only when it diverges from what the editor
  // produced last (e.g. draft load, "New brand" reset). User typing flows out
  // via onChange and the parent passes it back; we recognize that as "no-op"
  // and don't reset innerHTML, preserving the cursor.
  useEffect(() => {
    if (!ref.current) return
    if (value !== lastSyncedRef.current) {
      ref.current.innerHTML = value
      lastSyncedRef.current = value
    }
    // Inject a hover-visible × delete button into any figure that doesn't
    // already have one. Handles legacy figures restored from localStorage as
    // well as freshly-inserted ones. The button has `data-editor-only="true"`
    // so it's stripped before the email render.
    ref.current.querySelectorAll('figure').forEach(figure => {
      if (figure.querySelector('.md-figure-del')) return
      const btn = document.createElement('button')
      btn.className = 'md-figure-del'
      btn.setAttribute('data-editor-only', 'true')
      btn.setAttribute('contenteditable', 'false')
      btn.setAttribute('type', 'button')
      btn.setAttribute('title', 'Remove this image')
      btn.setAttribute('tabindex', '-1')
      btn.textContent = '×'
      figure.appendChild(btn)
    })
  }, [value])

  // Click delegation — handle clicks on the figure delete button. Removes
  // the parent <figure> and emits the new HTML so the body state updates.
  useEffect(() => {
    const editor = ref.current
    if (!editor) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const delBtn = target.closest('.md-figure-del')
      if (!delBtn) return
      e.preventDefault()
      const figure = delBtn.closest('figure')
      figure?.remove()
      // Strip any trailing empty <p><br></p> that was inserted alongside
      // the figure to avoid leaving a phantom blank line behind.
      emit()
    }
    editor.addEventListener('click', onClick)
    return () => editor.removeEventListener('click', onClick)
  }, [])

  const emit = () => {
    if (!ref.current) return
    const html = ref.current.innerHTML
    lastSyncedRef.current = html
    onChange(html)
  }

  const exec = (cmd: string, val?: string) => {
    ref.current?.focus()
    document.execCommand(cmd, false, val)
    emit()
  }

  const onLink = () => {
    const url = window.prompt('Link URL (https://…)')
    if (!url) return
    // If nothing is selected, insert the URL as both link text and href.
    const sel = window.getSelection()
    if (sel && sel.toString().trim().length === 0) {
      exec('insertHTML', `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`)
    } else {
      exec('createLink', url)
    }
  }

  const saveSelection = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (ref.current && ref.current.contains(range.commonAncestorContainer)) {
      savedRange.current = range.cloneRange()
    }
  }

  const restoreSelection = () => {
    if (!savedRange.current || !ref.current) {
      ref.current?.focus()
      return
    }
    const sel = window.getSelection()
    if (!sel) return
    sel.removeAllRanges()
    sel.addRange(savedRange.current)
  }

  const insertMergeTag = (tag: string) => {
    restoreSelection()
    document.execCommand('insertText', false, tag)
    setTagMenuOpen(false)
    emit()
  }

  const insertDonations = () => {
    if (donationsAlreadyPresent) return
    restoreSelection()
    // Trailing <p> gives the user a clean place to keep typing after the
    // placeholder (otherwise the cursor lands inside the contenteditable=false
    // block and feels stuck).
    document.execCommand('insertHTML', false, donationsPlaceholderHtml() + '<p><br></p>')
    emit()
  }

  const insertDivider = (id: string) => {
    restoreSelection()
    document.execCommand('insertHTML', false, dividerPlaceholderHtml(id) + '<p><br></p>')
    setDivMenuOpen(false)
    emit()
  }

  const applyFontSize = (px: string) => {
    ref.current?.focus()
    restoreSelection()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (!ref.current?.contains(range.commonAncestorContainer)) return
    if (range.collapsed) return
    // Walk text nodes within the selection and wrap each ONE individually
    // in its own font-size span. This avoids creating a single span that
    // contains multiple block-level elements (paragraph, alignment marker,
    // divider placeholder) — which would emit a `{{fs:}}` marker that spans
    // block boundaries and leak through as literal text in the rendered email.
    const editor = ref.current
    if (!editor) return
    const inFalseEditable = (n: Node | null): boolean => {
      let p: Element | null = n instanceof Element ? n : (n?.parentElement ?? null)
      while (p && p !== editor) {
        if (p.getAttribute && p.getAttribute('contenteditable') === 'false') return true
        p = p.parentElement
      }
      return false
    }
    const root = range.commonAncestorContainer
    const textNodes: Text[] = []
    // TreeWalker.nextNode() advances to the NEXT node in document order — it
    // never returns the start (currentNode) itself. So when the selection
    // is within a single text node (the common case), we have to include
    // that text node explicitly; otherwise the walker yields nothing.
    if (root.nodeType === Node.TEXT_NODE) {
      if (!inFalseEditable(root) && root.textContent) textNodes.push(root as Text)
    } else {
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT
            if (inFalseEditable(node)) return NodeFilter.FILTER_REJECT
            if (!node.textContent) return NodeFilter.FILTER_REJECT
            return NodeFilter.FILTER_ACCEPT
          },
        }
      )
      let n: Node | null
      while ((n = walker.nextNode())) textNodes.push(n as Text)
    }
    if (textNodes.length === 0) return
    // Snapshot start/end before mutating (splitText invalidates offsets).
    const startContainer = range.startContainer
    const endContainer = range.endContainer
    const startOffset = range.startOffset
    const endOffset = range.endOffset
    textNodes.forEach(textNode => {
      let s = 0
      let e = textNode.length
      if (textNode === startContainer) s = startOffset
      if (textNode === endContainer) e = Math.min(endOffset, textNode.length)
      if (s >= e) return
      // Split off the un-selected tail first, then the un-selected head, so
      // `target` is exactly the in-selection slice.
      if (e < textNode.length) textNode.splitText(e)
      const target = s > 0 ? textNode.splitText(s) : textNode
      const span = document.createElement('span')
      span.style.fontSize = px
      target.parentNode?.insertBefore(span, target)
      span.appendChild(target)
    })
    emit()
  }

  const insertImage = () => {
    const url = imgUrl.trim()
    if (!url) return
    const caption = imgCaption.trim()
    // Pass the current brand color so the editor preview matches what the
    // email will render. (Pre-existing images keep their original color
    // baked into their inline style until re-inserted.)
    const frameStyle = frameDisplayStyle(imgFrame, brandColor)
    let figureHtml: string
    if (imgLayout === 'left' || imgLayout === 'right') {
      // Side-by-side: image cell + parallel-text cell. The text cell is
      // contentEditable so the user can keep editing it after insert.
      const text = imgParallelText.trim()
      const textHtml = markdownToDisplayHtml(text) || '<p><br></p>'
      const captionHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''
      const imageCell = `<div class="md-image-cell" contenteditable="false"><img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" style="${frameStyle}">${captionHtml}</div>`
      const textCell = `<div class="md-text-cell">${textHtml}</div>`
      const inner = imgLayout === 'left' ? imageCell + textCell : textCell + imageCell
      figureHtml = `<figure data-layout="${imgLayout}" data-frame="${imgFrame}" class="md-image-${imgLayout}">${inner}</figure><p><br></p>`
    } else {
      const cls = imgLayout === 'full' ? 'md-image-full' : 'md-image-center'
      figureHtml = `<figure data-layout="${imgLayout}" data-frame="${imgFrame}" class="${cls}"><img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" data-layout="${imgLayout}" data-frame="${imgFrame}" style="${frameStyle}">${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure><p><br></p>`
    }
    restoreSelection()
    document.execCommand('insertHTML', false, figureHtml)
    setImgMenuOpen(false)
    setImgUrl('')
    setImgCaption('')
    setImgParallelText('')
    setImgFrame('none')
    emit()
  }

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    if (html) {
      e.preventDefault()
      // Route Word/Docs HTML through the cleaner: html → markdown → display HTML.
      const md = htmlToMarkdown(html)
      const cleanHtml = markdownToDisplayHtml(md) || escapeHtml(text || '')
      document.execCommand('insertHTML', false, cleanHtml)
      setPasteFlash(true)
      setTimeout(() => setPasteFlash(false), 1200)
      emit()
    } else if (text) {
      e.preventDefault()
      document.execCommand('insertText', false, text)
      emit()
    }
  }

  const tbBtn = "px-2 py-1 text-xs border border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent transition-colors"
  return (
    <div className={`border ${pasteFlash ? 'border-terminal-accent' : 'border-terminal-border'} transition-colors`}>
      <div className="flex flex-wrap gap-1 p-1.5 bg-terminal-panel border-b border-terminal-border">
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')} className={`${tbBtn} font-bold`} title="Bold (Ctrl+B)">B</button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')} className={`${tbBtn} italic`} title="Italic (Ctrl+I)">I</button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')} className={`${tbBtn} underline`} title="Underline (Ctrl+U)">U</button>
        <select
          onMouseDown={e => { e.stopPropagation(); saveSelection() }}
          onChange={e => {
            if (!e.target.value) return
            applyFontSize(e.target.value)
            e.target.selectedIndex = 0
          }}
          defaultValue=""
          className="text-xs border border-terminal-border bg-terminal-bg text-terminal-muted px-1 py-1 hover:border-terminal-accent hover:text-terminal-accent transition-colors cursor-pointer"
          title="Font size — select text first, then pick a size"
        >
          <option value="">Size</option>
          <option value="11px">11px (small)</option>
          <option value="13px">13px</option>
          <option value="14px">14px</option>
          <option value="16px">16px (default)</option>
          <option value="18px">18px</option>
          <option value="22px">22px (large)</option>
          <option value="28px">28px</option>
          <option value="36px">36px (heading)</option>
        </select>
        <span className="border-l border-terminal-border mx-0.5" />
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('justifyLeft')} className={tbBtn} title="Align left">⇤</button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('justifyCenter')} className={tbBtn} title="Center">⇔</button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('justifyRight')} className={tbBtn} title="Align right">⇥</button>
        <span className="border-l border-terminal-border mx-0.5" />
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('insertUnorderedList')} className={tbBtn} title="Bulleted list">• List</button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('insertOrderedList')} className={tbBtn} title="Numbered list">1. List</button>
        <span className="border-l border-terminal-border mx-0.5" />
        <label className={tbBtn + " cursor-pointer flex items-center gap-1"} title="Text color" onMouseDown={e => e.preventDefault()}>
          <span style={{ color: brandColor, fontWeight: 'bold' }}>A</span>
          <input
            type="color"
            defaultValue={brandColor}
            onChange={e => exec('foreColor', e.target.value)}
            className="w-3 h-3 p-0 border-0 bg-transparent cursor-pointer"
          />
        </label>
        <label className={tbBtn + " cursor-pointer flex items-center gap-1"} title="Highlight color" onMouseDown={e => e.preventDefault()}>
          <span style={{ backgroundColor: '#ffff00', padding: '0 3px', color: '#000' }}>H</span>
          <input
            type="color"
            defaultValue="#ffff00"
            onChange={e => exec('hiliteColor', e.target.value)}
            className="w-3 h-3 p-0 border-0 bg-transparent cursor-pointer"
          />
        </label>
        <span className="border-l border-terminal-border mx-0.5" />
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={onLink} className={tbBtn} title="Insert link">🔗 Link</button>
        {allowDonationsButton && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); saveSelection() }}
            onClick={insertDonations}
            disabled={!!donationsAlreadyPresent}
            className={`${tbBtn} ${donationsAlreadyPresent ? 'opacity-40 cursor-not-allowed' : ''}`}
            title={donationsAlreadyPresent ? 'Already inserted — only 1 donations block per email' : 'Insert donation tier card stack + CTA button'}
          >
            💰 Donate Block
          </button>
        )}
        <div ref={divMenuRef} className="relative">
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); saveSelection() }}
            onClick={(e) => {
              if (divMenuOpen) { setDivMenuOpen(false); return }
              setDivMenuPos(computeMenuPos(e.currentTarget, 256, 300))
              setDivMenuOpen(true)
            }}
            className={tbBtn}
            title="Insert a decorative section divider — stars, rules, dots"
          >
            ✦ Divider
          </button>
          {divMenuOpen && (
            <div className="fixed z-50 bg-terminal-panel border border-terminal-border w-64 overflow-y-auto shadow-xl" style={{ top: divMenuPos.top, left: divMenuPos.left, maxHeight: divMenuPos.maxHeight }}>
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-terminal-muted border-b border-terminal-border bg-terminal-bg">
                Insert divider
              </div>
              {DIVIDER_STYLES.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => insertDivider(d.id)}
                  className="w-full text-left px-3 py-2 hover:bg-terminal-bg border-b border-terminal-border/50 last:border-b-0 transition-colors"
                >
                  <div
                    className="text-center mb-1"
                    style={{ color: brandColor, letterSpacing: d.id === 'dots' ? 8 : d.id.startsWith('stars') ? 6 : 4, fontSize: 14 }}
                  >
                    {d.preview}
                  </div>
                  <div className="text-[10px] text-terminal-muted uppercase tracking-wider text-center">{d.label}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div ref={imgMenuRef} className="relative">
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); saveSelection() }}
            onClick={(e) => {
              if (imgMenuOpen) { setImgMenuOpen(false); return }
              setImgMenuPos(computeMenuPos(e.currentTarget, 320, 480))
              setImgMenuOpen(true)
            }}
            className={tbBtn}
            title="Insert an image (URL)"
          >
            🖼 Image
          </button>
          {imgMenuOpen && (
            <div className="fixed z-50 bg-terminal-panel border border-terminal-border w-80 shadow-xl p-3 overflow-y-auto" style={{ top: imgMenuPos.top, left: imgMenuPos.left, maxHeight: imgMenuPos.maxHeight }}>
              <div className="text-[10px] uppercase tracking-wider text-terminal-muted mb-2">Insert image</div>
              <input
                value={imgUrl}
                onChange={e => setImgUrl(e.target.value)}
                placeholder="Image URL (https://…)"
                className="w-full bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs mb-2 focus:outline-none focus:border-terminal-accent"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); insertImage() } }}
              />
              <input
                value={imgCaption}
                onChange={e => setImgCaption(e.target.value)}
                placeholder="Caption (optional — shown below the image in italics)"
                className="w-full bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs mb-2 focus:outline-none focus:border-terminal-accent"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); insertImage() } }}
              />
              <div className="grid grid-cols-2 gap-1 mb-2">
                {(['center', 'full', 'left', 'right'] as const).map(opt => {
                  const active = imgLayout === opt
                  const labels: Record<typeof opt, { label: string; tip: string }> = {
                    center: { label: 'Centered (70%)', tip: 'Standalone image, 70% wide' },
                    full:   { label: 'Full width',     tip: 'Standalone image, full width' },
                    left:   { label: 'Image L, Text R', tip: 'Image on left, parallel text on right (40/60 split)' },
                    right:  { label: 'Image R, Text L', tip: 'Image on right, parallel text on left (40/60 split)' },
                  }
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setImgLayout(opt)}
                      className={`text-[10px] uppercase tracking-wider py-1 border transition-colors ${active ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10' : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'}`}
                      title={labels[opt].tip}
                    >
                      {labels[opt].label}
                    </button>
                  )
                })}
              </div>
              {(imgLayout === 'left' || imgLayout === 'right') && (
                <textarea
                  value={imgParallelText}
                  onChange={e => setImgParallelText(e.target.value)}
                  rows={4}
                  placeholder={`Parallel text (appears ${imgLayout === 'left' ? 'right' : 'left'} of the image). Markdown OK — **bold**, *italic*, [link](url).`}
                  className="w-full bg-terminal-bg border border-terminal-border text-terminal-text px-2 py-1.5 text-xs mb-2 leading-relaxed focus:outline-none focus:border-terminal-accent"
                />
              )}
              <div className="text-[10px] uppercase tracking-wider text-terminal-muted mb-1">Frame</div>
              <div className="grid grid-cols-4 gap-1 mb-2">
                {IMAGE_FRAMES.map(f => {
                  const active = imgFrame === f.id
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setImgFrame(f.id)}
                      className={`text-[10px] uppercase tracking-wider py-1 border transition-colors ${active ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10' : 'border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent'}`}
                      title={f.tip}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>
              <div className="h-1" />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={insertImage}
                  disabled={!imgUrl.trim()}
                  className="flex-1 text-xs uppercase tracking-wider py-1.5 border border-terminal-accent text-terminal-accent hover:bg-terminal-accent hover:text-white transition-colors disabled:opacity-40"
                >
                  Insert
                </button>
                <button
                  type="button"
                  onClick={() => { setImgMenuOpen(false); setImgUrl(''); setImgCaption('') }}
                  className="text-xs px-3 py-1.5 border border-terminal-border text-terminal-muted hover:text-terminal-text"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <div ref={tagMenuRef} className="relative">
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); saveSelection() }}
            onClick={(e) => {
              if (tagMenuOpen) { setTagMenuOpen(false); return }
              setTagMenuPos(computeMenuPos(e.currentTarget, 288, 320))
              setTagMenuOpen(true)
            }}
            className={tbBtn}
            title="Insert a Mailchimp merge tag"
          >
            {`{{ }} Merge`}
          </button>
          {tagMenuOpen && (
            <div className="fixed z-50 bg-terminal-panel border border-terminal-border w-72 overflow-y-auto shadow-xl" style={{ top: tagMenuPos.top, left: tagMenuPos.left, maxHeight: Math.min(tagMenuPos.maxHeight, 320) }}>
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-terminal-muted border-b border-terminal-border bg-terminal-bg">
                Mailchimp merge tags
              </div>
              {MERGE_TAGS.map(group => (
                <div key={group.group}>
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-terminal-accent bg-terminal-bg/50">{group.group}</div>
                  {group.tags.map(t => (
                    <button
                      key={t.tag}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => insertMergeTag(t.tag)}
                      className="w-full text-left px-2 py-1.5 hover:bg-terminal-bg border-b border-terminal-border/50 last:border-b-0"
                    >
                      <div className="text-xs text-terminal-text">{t.label}</div>
                      <div className="text-[10px] text-terminal-muted font-mono">{t.tag}</div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('removeFormat')} className={tbBtn} title="Clear formatting">Clear</button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        className={`bg-terminal-bg text-terminal-text px-3 py-2 text-sm leading-relaxed overflow-y-auto focus:outline-none rich-editor-body ${compact ? 'rich-editor-compact min-h-[100px] max-h-[240px]' : 'min-h-[280px] max-h-[460px]'}`}
        style={{ wordBreak: 'break-word' }}
      />
    </div>
  )
}
