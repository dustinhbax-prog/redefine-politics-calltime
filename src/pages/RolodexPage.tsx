// ── Rolodex: the client-facing call-time PWA ─────────────────────────────────
// A candidate / volunteer caller installs this to their phone via a unique token
// link. They pull in their contacts; we match each to a donor profile and show a
// call list with partisan lean, a recommended ask, and a "good day to call"
// score. Tap a name for the full script + one-tap call/text + outcome logging.
//
// Standalone page (rendered outside the app's Layout + password gate). Authed by
// the client token. Styled to the ReDEFINE brand (paper + brand red, Archivo /
// Inter), mobile-first, WCAG-AA, large tap targets, full ARIA.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { rolodexApi, type RolodexCard, type ClientInfo, type RawContact } from '../api/rolodex'
import { contactPickerSupported, pickContacts, parseVCard, normalizeState, nativeContactsAvailable, getNativeContacts } from '../lib/contacts'

const RED = '#ce1b2c'
const BLUE = '#0f4fc9'
const INK = '#15171a'
// Muted gray nudged a hair darker than the app's #6b7280 token: at 12–13px on the
// #f5f6f8 paper background #6b7280 lands at ~4.46:1 (just under WCAG AA 4.5:1).
// #616873 clears AA on both paper (~5.3:1) and white cards while reading identical.
const MUTED = '#616873'

const money = (n?: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type Stage = 'auth' | 'invalid' | 'enterCode' | 'home' | 'matching' | 'results'

// Partisan pill styling — solid fills, white text → AA contrast on any card.
function partyStyle(party?: string): { label: string; bg: string } {
  switch ((party || '').toUpperCase()) {
    case 'DEM': return { label: 'Democrat', bg: BLUE }
    case 'REP': return { label: 'Republican', bg: '#b91c1c' }
    case 'SPLIT': return { label: 'Split', bg: '#b45309' }
    default: return { label: 'Unaffiliated', bg: MUTED }
  }
}

function dayBadge(fit: number): string | null {
  if (fit >= 1.5) return '★ Great day to call'
  if (fit >= 1.15) return '★ Good day to call'
  return null
}

export default function RolodexPage() {
  const [stage, setStage] = useState<Stage>('auth')
  const [client, setClient] = useState<ClientInfo | null>(null)
  const [token, setToken] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [cards, setCards] = useState<RolodexCard[]>([])
  const [submitted, setSubmitted] = useState(0)
  const [busyMsg, setBusyMsg] = useState('')
  const [open, setOpen] = useState<RolodexCard | null>(null)

  // Force the brand paper theme for the standalone PWA (no settings panel here),
  // and make THIS page installable to the home screen (scoped to /rolodex so the
  // rest of the app is unaffected): inject the manifest + Apple metas + a SW.
  useEffect(() => {
    const prevTheme = document.documentElement.getAttribute('data-theme')
    const prevTitle = document.title
    document.documentElement.setAttribute('data-theme', 'day')
    document.title = 'Call Time — ReDEFINE Politics'
    const added: HTMLElement[] = []
    const ensure = (sel: string, make: () => HTMLElement) => {
      if (document.head.querySelector(sel)) return
      const el = make(); document.head.appendChild(el); added.push(el)
    }
    ensure('link[rel="manifest"][href="/rolodex.webmanifest"]', () => {
      const l = document.createElement('link'); l.rel = 'manifest'; l.href = '/rolodex.webmanifest'; return l
    })
    const meta = (name: string, content: string) => ensure(`meta[name="${name}"]`, () => {
      const m = document.createElement('meta'); m.name = name; m.content = content; return m
    })
    meta('apple-mobile-web-app-capable', 'yes')
    meta('mobile-web-app-capable', 'yes')
    meta('apple-mobile-web-app-title', 'Call Time')
    meta('apple-mobile-web-app-status-bar-style', 'default')
    // iOS uses the apple-touch-icon in the head for "Add to Home Screen". The app's
    // global one points at the generic logo, so override it to the Call Time icon
    // for this page (and restore it on unmount so the rest of the app is unaffected).
    const appleIcon = document.head.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null
    const prevAppleHref = appleIcon ? appleIcon.getAttribute('href') : null
    if (appleIcon) appleIcon.setAttribute('href', '/rolodex-icon-180.png')
    else ensure('link[rel="apple-touch-icon"]', () => {
      const l = document.createElement('link'); l.rel = 'apple-touch-icon'; l.href = '/rolodex-icon-180.png'; return l
    })
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/rolodex-sw.js', { scope: '/rolodex' }).catch(() => { /* noop */ })
    }
    // Cover the safe areas so env(safe-area-inset-*) resolves (fixes the fixed
    // header/footer jutting under the iOS notch + home indicator), and paint the
    // body bg so scroll-bounce never reveals a white gutter.
    const vp = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
    const prevVp = vp ? vp.getAttribute('content') : null
    if (vp && prevVp && !prevVp.includes('viewport-fit')) vp.setAttribute('content', `${prevVp}, viewport-fit=cover`)
    const prevBodyBg = document.body.style.background
    document.body.style.background = '#f5f6f8'
    document.documentElement.style.background = '#f5f6f8'
    return () => {
      added.forEach(el => el.remove())
      if (vp && prevVp) vp.setAttribute('content', prevVp)
      document.body.style.background = prevBodyBg
      document.documentElement.style.background = ''
      if (appleIcon && prevAppleHref) appleIcon.setAttribute('href', prevAppleHref)
      // Restore the app's theme/title in case the user navigates back into the
      // SPA client-side (the forced 'day' theme must not leak into the app).
      if (prevTheme) document.documentElement.setAttribute('data-theme', prevTheme)
      else document.documentElement.removeAttribute('data-theme')
      document.title = prevTitle
    }
  }, [])

  // ── auth: token from ?t= or the device, validate, persist ──
  // No token (native first launch, or a web user without their link) → ask them
  // to paste their invite link/code rather than dead-ending.
  useEffect(() => {
    const url = new URL(window.location.href)
    const t = url.searchParams.get('t') || localStorage.getItem('rolodex_token') || ''
    if (!t) { setStage('enterCode'); return }
    rolodexApi.me(t).then(c => {
      setClient(c); setToken(t)
      localStorage.setItem('rolodex_token', t)
      // scrub the token out of the visible URL
      if (url.searchParams.has('t')) { url.searchParams.delete('t'); window.history.replaceState({}, '', url.toString()) }
      setStage('home')
    }).catch(() => {
      localStorage.removeItem('rolodex_token')
      setStage('enterCode')
      setError('That access code didn’t work or has been turned off. Paste the link your campaign sent you.')
    })
  }, [])

  // Accept a pasted invite LINK (…/rolodex?t=XX;) or a raw access code.
  const submitCode = useCallback(async (raw: string) => {
    const s = (raw || '').trim()
    const m = s.match(/[?&]t=([^&\s]+)/)
    const t = m ? decodeURIComponent(m[1]) : s
    if (!t) { setError('Paste your invite link or access code.'); return }
    setError('')
    try {
      const c = await rolodexApi.me(t)
      setClient(c); setToken(t); localStorage.setItem('rolodex_token', t); setStage('home')
    } catch {
      setError('That code didn’t work. Check the link your campaign sent you.')
    }
  }, [])

  const runMatch = useCallback(async (raw: RawContact[]) => {
    if (!raw.length) { setError('No contacts were found to scan.'); return }
    setStage('matching'); setError(''); setBusyMsg(`Scanning ${raw.length} contacts against the donor database…`)
    const contacts = raw.map(c => ({ ...c, state: normalizeState(c.state) }))
    const todayDow = new Date().getDay() // 0=Sun..6=Sat — matches the backend
    try {
      const res = await rolodexApi.match(token, contacts, todayDow)
      setCards(res.results); setSubmitted(res.submitted); setStage('results')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Matching failed. Please try again.')
      setStage('home')
    }
  }, [token])

  if (stage === 'auth') return <Splash><p role="status" style={{ color: MUTED }}>Loading…</p></Splash>
  if (stage === 'invalid') return <Splash><p role="alert" style={{ color: RED, fontWeight: 600, textAlign: 'center' }}>{error}</p></Splash>
  if (stage === 'enterCode') return <Splash><CodeEntry onSubmit={submitCode} error={error} /></Splash>

  return (
    <div style={{ background: '#f5f6f8', minHeight: '100dvh', color: INK, fontFamily: 'Inter, system-ui, sans-serif', overflowX: 'hidden', width: '100%' }}>
      <Header client={client} />
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '12px 14px 96px' }}>
        {error && stage !== 'matching' && (
          <p role="alert" style={{ background: '#fde8ea', color: '#8a121e', padding: '10px 12px', borderRadius: 8, marginBottom: 12 }}>{error}</p>
        )}
        {stage === 'home' && <ImportPanel onContacts={runMatch} setError={setError} />}
        {stage === 'matching' && <Splash inline><Spinner /><p role="status" style={{ color: MUTED, marginTop: 14 }}>{busyMsg}</p></Splash>}
        {stage === 'results' && (
          <Results
            cards={cards} submitted={submitted}
            onOpen={setOpen} onRescan={() => { setStage('home'); setCards([]) }}
          />
        )}
      </main>
      {open && (
        <DetailSheet card={open} token={token} client={client!} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}

// ── chrome ────────────────────────────────────────────────────────────────────
// "ReDEFINE CALL TIME" wordmark in the ReDEFINE Politics brand style: Re red,
// DEFINE blue, CALL TIME black. Rendered as SVG so both lines are forced to the
// EXACT same width (textLength), giving the squared-off, aligned look of the logo.
function BrandMark() {
  // The real ReDEFINE CALLTIME logo (client-provided, trimmed to the wordmark).
  return <img src="/calltime-logo.png" alt="ReDefine Call Time" style={{ height: 38, width: 'auto', display: 'block' }} />
}

function Header({ client }: { client: ClientInfo | null }) {
  return (
    <header style={{ background: '#fff', borderBottom: '1px solid #e6e8ec', position: 'sticky', top: 0, zIndex: 10, paddingTop: 'env(safe-area-inset-top)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <BrandMark />
        {client?.candidate && <div style={{ fontSize: 11, color: MUTED, textAlign: 'right', maxWidth: '48%', lineHeight: 1.2 }}>{client.candidate}</div>}
      </div>
    </header>
  )
}

function Splash({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <div style={{
      background: inline ? 'transparent' : '#f5f6f8', minHeight: inline ? '50vh' : '100dvh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      {!inline && <img src="/logo.png" alt="ReDEFINE Politics" style={{ width: 200, marginBottom: 24 }} />}
      {children}
    </div>
  )
}

function Spinner() {
  return (
    <div aria-hidden style={{
      width: 36, height: 36, border: `3px solid #e6e8ec`, borderTopColor: RED,
      borderRadius: '50%', animation: 'rolodex-spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes rolodex-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// First-launch / lost-link screen: paste the invite link or access code.
function CodeEntry({ onSubmit, error }: { onSubmit: (s: string) => void; error: string }) {
  const [v, setV] = useState('')
  return (
    <div style={{ width: '100%', maxWidth: 360 }}>
      <h1 style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 800, fontSize: 21, textAlign: 'center', margin: '0 0 6px', color: INK }}>
        Welcome to Call Time
      </h1>
      <p style={{ color: MUTED, fontSize: 13.5, textAlign: 'center', margin: '0 0 16px' }}>
        Paste the invite link (or access code) your campaign sent you.
      </p>
      <form onSubmit={e => { e.preventDefault(); onSubmit(v) }}>
        <input value={v} onChange={e => setV(e.target.value)} autoFocus aria-label="Invite link or access code"
          placeholder="Paste your link or code"
          style={{ width: '100%', padding: 12, border: '1px solid #d6d9de', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }} />
        <button type="submit" disabled={!v.trim()} style={{ ...primaryBtn, marginTop: 10, opacity: v.trim() ? 1 : 0.5 }}>Continue</button>
      </form>
      {error && <p role="alert" style={{ color: RED, fontSize: 13, textAlign: 'center', marginTop: 12 }}>{error}</p>}
    </div>
  )
}

// ── import contacts (picker / vCard / paste) ───────────────────────────────────
function ImportPanel({ onContacts, setError }: { onContacts: (c: RawContact[]) => void; setError: (s: string) => void }) {
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const native = nativeContactsAvailable()
  const picker = contactPickerSupported()

  const handleNative = async () => {
    setError('')
    try { onContacts(await getNativeContacts()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read your contacts.') }
  }

  const handlePick = async () => {
    setError('')
    try { onContacts(await pickContacts()) }
    catch { setError('Could not open your contacts. Try importing a contacts file instead.') }
  }

  const handleFile = async (f: File | null) => {
    if (!f) return
    setError('')
    try { onContacts(parseVCard(await f.text())) }
    catch { setError('Could not read that contacts file. Make sure it is a .vcf export.') }
  }

  const handlePaste = () => {
    // crude paste fallback: one person per line "Name, phone, email"
    const rows = paste.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map((l): RawContact => {
      const parts = l.split(/[,\t]/).map(p => p.trim())
      return { name: parts[0], phone: parts.find(p => /\d{3}.*\d{4}/.test(p)), email: parts.find(p => p.includes('@')) }
    })
    onContacts(rows)
  }

  return (
    <section aria-labelledby="import-h">
      <div style={cardStyle}>
        <h1 id="import-h" style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 800, fontSize: 22, margin: '2px 0 6px' }}>
          Find the donors in your phone
        </h1>
        <p style={{ color: MUTED, fontSize: 14, margin: '0 0 16px' }}>
          We’ll match your contacts against the donor database and build you a call list — who leans your way,
          what to ask them for, and who’s a good catch <strong>today</strong>.
        </p>

        {native ? (
          <button onClick={handleNative} style={primaryBtn} aria-label="Choose contacts from your phone">
            📇 Choose contacts from my phone
          </button>
        ) : picker ? (
          <button onClick={handlePick} style={primaryBtn} aria-label="Choose contacts from your phone">
            📇 Choose contacts from my phone
          </button>
        ) : (
          <>
            <button onClick={() => fileRef.current?.click()} style={primaryBtn}>
              📇 Import my contacts file
            </button>
            <input ref={fileRef} type="file" accept=".vcf,text/vcard" hidden
              onChange={e => handleFile(e.target.files?.[0] || null)} />
            <p style={{ color: MUTED, fontSize: 12.5, marginTop: 10 }}>
              On iPhone: open <strong>Contacts</strong>, tap a contact, scroll down to <strong>Share Contact → Mail/Files</strong>
              (or export all from iCloud) to get a <code>.vcf</code> file, then choose it above.
            </p>
          </>
        )}

        <button onClick={() => setShowPaste(s => !s)} style={ghostBtn} aria-expanded={showPaste}>
          {showPaste ? 'Hide' : 'Or paste a list instead'}
        </button>
        {showPaste && (
          <div style={{ marginTop: 10 }}>
            <label htmlFor="paste" style={{ fontSize: 12.5, color: MUTED }}>One person per line — name, phone, email</label>
            <textarea id="paste" value={paste} onChange={e => setPaste(e.target.value)} rows={5}
              style={{ width: '100%', marginTop: 6, padding: 10, border: '1px solid #d6d9de', borderRadius: 8, fontSize: 14 }}
              placeholder={'Jane Doe, 573-555-0148, jane@email.com'} />
            <button onClick={handlePaste} disabled={!paste.trim()} style={{ ...primaryBtn, marginTop: 8, opacity: paste.trim() ? 1 : 0.5 }}>
              Scan this list
            </button>
          </div>
        )}
      </div>
      <p style={{ color: MUTED, fontSize: 12, textAlign: 'center', marginTop: 14, padding: '0 8px' }}>
        Your contacts are matched to build your personal call list. We never call anyone for you —
        these are <strong>your</strong> relationships.
      </p>
    </section>
  )
}

// ── results: filter bar + list ─────────────────────────────────────────────────
type SortKey = 'day' | 'ask' | 'ev' | 'loyal'
const MIN_ASKS = [0, 25, 50, 100, 250]

function Results({ cards, submitted, onOpen, onRescan }: {
  cards: RolodexCard[]; submitted: number
  onOpen: (c: RolodexCard) => void; onRescan: () => void
}) {
  const [lean, setLean] = useState<'all' | 'DEM' | 'REP' | 'other'>('all')
  const [minAsk, setMinAsk] = useState(0)
  const [todayOnly, setTodayOnly] = useState(false)
  const [issue, setIssue] = useState('')
  const [industry, setIndustry] = useState('')
  const [sort, setSort] = useState<SortKey>('day')
  const today = DOW[new Date().getDay()]

  const issueOpts = useMemo(() => {
    const m = new Map<string, string>()
    cards.forEach(c => c.issues.forEach(i => m.set(i.id, i.label)))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [cards])
  const industryOpts = useMemo(() => {
    const s = new Set<string>(); cards.forEach(c => c.industry_id && s.add(c.industry_id))
    return [...s].sort()
  }, [cards])

  const shown = useMemo(() => {
    const list = cards.filter(c => {
      if (lean === 'DEM' && c.party !== 'DEM') return false
      if (lean === 'REP' && c.party !== 'REP') return false
      if (lean === 'other' && (c.party === 'DEM' || c.party === 'REP')) return false
      if (minAsk && (c.ask || 0) < minAsk) return false
      if (todayOnly && c.day_fit < 1.15) return false
      if (issue && !c.issues.some(i => i.id === issue)) return false
      if (industry && c.industry_id !== industry) return false
      return true
    })
    const cmp: Record<SortKey, (a: RolodexCard, b: RolodexCard) => number> = {
      day: (a, b) => b.day_fit - a.day_fit || (b.ask || 0) - (a.ask || 0),
      ask: (a, b) => (b.ask || 0) - (a.ask || 0),
      ev: (a, b) => b.expected_value - a.expected_value,
      loyal: (a, b) => (b.gift_count || 0) - (a.gift_count || 0),
    }
    return [...list].sort(cmp[sort])
  }, [cards, lean, minAsk, todayOnly, issue, industry, sort])

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '4px 2px 10px' }}>
        <h1 style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 800, fontSize: 20 }}>
          {cards.length} of your contacts are donors
        </h1>
        <button onClick={onRescan} style={linkBtn}>Re-scan</button>
      </div>
      <p style={{ color: MUTED, fontSize: 12.5, margin: '0 2px 12px' }}>
        Matched from {submitted} contacts. It’s {today} — people who usually give on {today}s are flagged
        <span style={{ color: RED, fontWeight: 700 }}> ★</span>.
      </p>

      {/* filters */}
      <div role="group" aria-label="Filters" style={{ ...cardStyle, padding: 12, marginBottom: 12 }}>
        <ChipRow label="Lean">
          {([['all', 'All'], ['DEM', 'Dem'], ['REP', 'Rep'], ['other', 'Other']] as const).map(([v, l]) => (
            <Chip key={v} active={lean === v} onClick={() => setLean(v)}>{l}</Chip>
          ))}
        </ChipRow>
        <ChipRow label="Min ask">
          {MIN_ASKS.map(v => (
            <Chip key={v} active={minAsk === v} onClick={() => setMinAsk(v)}>{v === 0 ? 'Any' : `$${v}+`}</Chip>
          ))}
        </ChipRow>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <Chip active={todayOnly} onClick={() => setTodayOnly(t => !t)} aria-pressed={todayOnly}>
            ★ Best for {today}
          </Chip>
          <select aria-label="Sort by" value={sort} onChange={e => setSort(e.target.value as SortKey)} style={selectStyle}>
            <option value="day">Sort: Good day to call</option>
            <option value="ask">Sort: Recommended ask</option>
            <option value="ev">Sort: Best ROI</option>
            <option value="loyal">Sort: Most loyal</option>
          </select>
        </div>
        {(issueOpts.length > 0 || industryOpts.length > 0) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {issueOpts.length > 0 && (
              <select aria-label="Filter by issue" value={issue} onChange={e => setIssue(e.target.value)} style={selectStyle}>
                <option value="">Any issue</option>
                {issueOpts.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            )}
            {industryOpts.length > 0 && (
              <select aria-label="Filter by industry" value={industry} onChange={e => setIndustry(e.target.value)} style={selectStyle}>
                <option value="">Any industry</option>
                {industryOpts.map(id => <option key={id} value={id}>{id.replace(/_/g, ' ')}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      {/* list */}
      {shown.length === 0
        ? <p style={{ color: MUTED, textAlign: 'center', padding: 24 }}>No matches with these filters.</p>
        : <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shown.map(c => <li key={c.contributor_key}><DonorRow card={c} onOpen={onOpen} /></li>)}
          </ul>}
    </>
  )
}

function DonorRow({ card, onOpen }: { card: RolodexCard; onOpen: (c: RolodexCard) => void }) {
  const p = partyStyle(card.party)
  const badge = dayBadge(card.day_fit)
  return (
    <button onClick={() => onOpen(card)}
      style={{ ...cardStyle, width: '100%', textAlign: 'left', padding: 14, cursor: 'pointer', display: 'block' }}
      aria-label={`${card.name}, ${p.label}, recommended ask ${money(card.ask)}. Open call script.`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>
            {titleCase(card.name)}
          </div>
          {card.contact_name && card.contact_name.toUpperCase() !== card.name.toUpperCase() &&
            <div style={{ fontSize: 12, color: MUTED }}>saved as {card.contact_name}</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 800, fontSize: 18, color: RED }}>{money(card.ask)}</div>
          <div style={{ fontSize: 10.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>ask</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
        <Pill bg={p.bg}>{p.label}{card.lean_pct ? ` ${card.lean_pct}%` : ''}</Pill>
        {card.party_activist && <Pill bg="#7c3aed">Party activist</Pill>}
        {badge && <Pill bg={RED}>{badge}</Pill>}
        {card.issues.slice(0, 2).map(i => <Pill key={i.id} bg="#eef1f5" fg={INK}>{i.label}</Pill>)}
      </div>
    </button>
  )
}

// ── detail sheet (full call script) ────────────────────────────────────────────
function DetailSheet({ card, token, client, onClose }: {
  card: RolodexCard; token: string; client: ClientInfo; onClose: () => void
}) {
  const [data, setData] = useState<any>(null)
  const [loadErr, setLoadErr] = useState('')
  const [logged, setLogged] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [askingAmt, setAskingAmt] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Keep the latest onClose without making it an effect dependency (otherwise a
  // parent re-render would re-run the effect, refetch the script, and steal focus).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Mount-only: load the script once, lock background scroll, trap focus inside the
  // sheet, close on Escape, and restore focus to the trigger on unmount. card/token
  // are stable for the sheet's lifetime (it unmounts before another card opens).
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); return }
      if (e.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const f = Array.from(root.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
      )).filter(el => el.offsetParent !== null || el === document.activeElement)
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      const active = document.activeElement as HTMLElement
      if (e.shiftKey && (active === first || !root.contains(active))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (active === last || !root.contains(active))) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)

    let alive = true
    rolodexApi.script(token, { name: card.name, state: card.state, phone: card.phone, email: card.email })
      .then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) setLoadErr(e instanceof Error ? e.message : 'Could not load the script.') })

    return () => {
      alive = false
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const log = async (outcome: string, amt?: number) => {
    try {
      await rolodexApi.logCall(token, card.contributor_key, outcome, amt)
      setLogged(outcome === 'pledged' ? `Logged: pledged ${money(amt)}` : `Logged: ${outcome.replace(/_/g, ' ')}`)
      setAskingAmt(false)
    } catch { setLogged('Could not save — check your connection.') }
  }

  const p = partyStyle(card.party)
  const ask = data?.ask?.primary
  // Candidate name (strip a "… for HD-59" suffix) + donate link, for the ActBlue
  // button and the auto-drafted text message.
  const candidateName = (client.candidate || client.name || 'our campaign').split(/\s+for\s+/i)[0].trim()
  const donateUrl = client.fundraising_url || ''
  const tel = card.phone ? `tel:${card.phone.replace(/[^\d+]/g, '')}` : null
  const smsBody = `Hi, it's ${candidateName}! Thanks so much for taking my call.` +
    (donateUrl ? ` If you're able to chip in to the campaign, here's my link: ${donateUrl}` : '') +
    ` It truly makes a difference — thank you!`
  const sms = card.phone ? `sms:${card.phone.replace(/[^\d+]/g, '')}&body=${encodeURIComponent(smsBody)}` : null

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Call script for ${titleCase(card.name)}`}
      style={{ position: 'fixed', inset: 0, background: '#f5f6f8', zIndex: 50, overflowY: 'auto', color: INK }}>
      <div style={{ position: 'sticky', top: 0, background: '#fff', borderBottom: '1px solid #e6e8ec', padding: '10px 14px', paddingTop: 'calc(10px + env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button ref={closeRef} onClick={onClose} aria-label="Close" style={{ ...iconBtn }}>✕</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 800, fontSize: 16, lineHeight: 1.1 }}>{titleCase(card.name)}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
            <Pill bg={p.bg}>{p.label}{card.lean_pct ? ` ${card.lean_pct}%` : ''}</Pill>
            {dayBadge(card.day_fit) && <Pill bg={RED}>{dayBadge(card.day_fit)}</Pill>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 800, fontSize: 20, color: RED }}>{money(card.ask)}</div>
          <div style={{ fontSize: 10, color: MUTED, textTransform: 'uppercase' }}>ask</div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '14px 14px 120px' }}>
        {/* one-tap reach */}
        {card.phone && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <a href={tel!} style={{ ...primaryBtn, flex: 1, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>📞 Call {card.phone}</a>
            <a href={sms!} aria-label="Text a donation ask" style={{ ...ghostBtn, width: 56, marginTop: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>💬</a>
          </div>
        )}
        {/* take a donation on the spot */}
        {donateUrl && (
          <a href={donateUrl} target="_blank" rel="noopener noreferrer"
            aria-label="Open ActBlue to take a donation"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
              minHeight: 48, background: BLUE, color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 15,
              textDecoration: 'none', marginBottom: 14 }}>
            💙 Take a donation now (ActBlue)
          </a>
        )}

        {/* recommended ask ladder */}
        {ask && (
          <Section title="Recommended ask">
            <p style={{ fontSize: 14, margin: '0 0 8px' }}>{ask.label}: <strong style={{ color: RED }}>{money(ask.headline_ask)}</strong></p>
            {Array.isArray(ask.ask_array) && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ask.ask_array.map((a: number, i: number) => <Pill key={i} bg="#eef1f5" fg={INK}>{money(a)}</Pill>)}
              </div>
            )}
            {ask.rationale && <p style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>{ask.rationale}</p>}
          </Section>
        )}

        {loadErr && <p role="alert" style={{ color: RED }}>{loadErr}</p>}
        {!data && !loadErr && <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>}

        {/* understanding the donor */}
        {data?.narrative && (
          <Section title="Understanding this donor">
            {data.narrative.approach && <p style={{ fontSize: 14, margin: '0 0 8px' }}>{data.narrative.approach}</p>}
            {Array.isArray(data.narrative.points) && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.5 }}>
                {data.narrative.points.map((pt: string, i: number) => <li key={i}>{pt}</li>)}
              </ul>
            )}
          </Section>
        )}

        {/* the call script */}
        {data?.script && (
          <Section title="Call script">
            <ScriptBlock script={data.script} />
          </Section>
        )}

        {/* issues + giving */}
        {Array.isArray(data?.issues) && data.issues.length > 0 && (
          <Section title="What their giving suggests">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {data.issues.slice(0, 8).map((i: any, k: number) => <Pill key={k} bg="#eef1f5" fg={INK}>{i.label}</Pill>)}
            </div>
          </Section>
        )}
        <Section title="Giving history">
          <div style={{ fontSize: 13, color: MUTED }}>
            {card.gift_count || 0} gifts · {money(card.total_amount)} lifetime · typical {money(card.avg_gift)} · biggest {money(card.max_gift)}
            {card.last_gift_year ? ` · last in ${card.last_gift_year}` : ''}
          </div>
          {Array.isArray(data?.history) && data.history.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none', fontSize: 12.5 }}>
              {data.history.slice(0, 5).map((h: any, i: number) => (
                <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: i ? '1px solid #eef1f5' : 'none' }}>
                  <span style={{ color: MUTED }}>{h.date} · {h.committee}</span><span>{money(h.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* outcome logging — sticky footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e6e8ec', padding: '10px 14px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))', zIndex: 51 }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {logged ? (
            <p role="status" style={{ textAlign: 'center', color: '#1d7a3d', fontWeight: 600, margin: 0 }}>{logged} <button onClick={() => setLogged(null)} style={linkBtn}>log another</button></p>
          ) : askingAmt ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" inputMode="decimal" autoFocus aria-label="Pledge amount" placeholder="Amount $"
                value={amount} onChange={e => setAmount(e.target.value)}
                style={{ flex: 1, padding: 10, border: '1px solid #d6d9de', borderRadius: 8, fontSize: 15 }} />
              <button onClick={() => log('pledged', parseFloat(amount) || undefined)} style={{ ...primaryBtn, marginTop: 0, width: 'auto', padding: '0 18px' }}>Save</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <OutcomeBtn primary onClick={() => setAskingAmt(true)}>✓ Pledged</OutcomeBtn>
              <OutcomeBtn onClick={() => log('no_answer')}>No answer</OutcomeBtn>
              <OutcomeBtn onClick={() => log('left_message')}>Left msg</OutcomeBtn>
              <OutcomeBtn onClick={() => log('callback')}>Call back</OutcomeBtn>
              <OutcomeBtn onClick={() => log('declined')}>Declined</OutcomeBtn>
              <OutcomeBtn onClick={() => log('bad_number')}>Bad #</OutcomeBtn>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Render a script value of unknown shape (string | string[] | object) without
// ever printing "[object Object]" — nested objects flatten to readable lines.
function renderScriptValue(v: any): React.ReactNode {
  if (v == null) return null
  if (Array.isArray(v)) {
    return <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.55 }}>{v.map((x, i) => <li key={i}>{scriptText(x)}</li>)}</ul>
  }
  if (typeof v === 'object') {
    return (
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.55 }}>
        {Object.entries(v).filter(([, x]) => x != null).map(([k, x]) => (
          <li key={k}><strong>{k.replace(/_/g, ' ')}:</strong> {scriptText(x)}</li>
        ))}
      </ul>
    )
  }
  return <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{String(v)}</p>
}

// Inline string coercion that won't surface "[object Object]".
function scriptText(x: any): string {
  if (x == null) return ''
  if (typeof x === 'object') { try { return JSON.stringify(x) } catch { return '' } }
  return String(x)
}

function ScriptBlock({ script }: { script: any }) {
  if (typeof script === 'string') return <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{script}</p>
  if (Array.isArray(script)) return renderScriptValue(script)
  if (script && typeof script === 'object') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Object.entries(script).map(([k, v]) => {
          if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return null
          return (
            <div key={k}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: MUTED, fontWeight: 700, marginBottom: 3 }}>{k.replace(/_/g, ' ')}</div>
              {renderScriptValue(v)}
            </div>
          )
        })}
      </div>
    )
  }
  return null
}

// ── small styled primitives ────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e6e8ec', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }
const primaryBtn: React.CSSProperties = { width: '100%', minHeight: 48, background: RED, color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
const ghostBtn: React.CSSProperties = { width: '100%', minHeight: 44, background: '#fff', color: INK, border: '1px solid #d6d9de', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 10 }
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: BLUE, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: '8px 6px', minHeight: 36 }
const iconBtn: React.CSSProperties = { width: 44, height: 44, borderRadius: 8, border: '1px solid #d6d9de', background: '#fff', fontSize: 16, cursor: 'pointer', flexShrink: 0 }
const selectStyle: React.CSSProperties = { minHeight: 44, padding: '0 10px', border: '1px solid #d6d9de', borderRadius: 8, fontSize: 13, background: '#fff', color: INK, fontFamily: 'Inter, sans-serif' }

function Pill({ children, bg, fg = '#fff' }: { children: React.ReactNode; bg: string; fg?: string }) {
  return <span style={{ background: bg, color: fg, fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{children}</span>
}
function Chip({ children, active, onClick, ...rest }: { children: React.ReactNode; active: boolean; onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button onClick={onClick} aria-pressed={active} {...rest}
      style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        border: `1px solid ${active ? RED : '#d6d9de'}`, background: active ? RED : '#fff', color: active ? '#fff' : INK }}>
      {children}
    </button>
  )
}
function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <span aria-hidden style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: MUTED, fontWeight: 700, width: 56, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  )
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ ...cardStyle, marginBottom: 12 }}>
      <h2 style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: INK, margin: '0 0 8px' }}>{title}</h2>
      {children}
    </section>
  )
}
function OutcomeBtn({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick}
      style={{ minHeight: 46, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
        border: `1px solid ${primary ? '#1d7a3d' : '#d6d9de'}`, background: primary ? '#1d7a3d' : '#fff', color: primary ? '#fff' : INK }}>
      {children}
    </button>
  )
}

function titleCase(s: string): string {
  return (s || '').toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\bMc([a-z])/g, (_, c) => 'Mc' + c.toUpperCase())
}
