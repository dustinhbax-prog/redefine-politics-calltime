import { useState } from 'react'

interface Props {
  candidateName: string; setCandidateName: (s: string) => void
  office: string; setOffice: (s: string) => void
  link: string; setLink: (s: string) => void
}

// Campaign info inputs with an optional website auto-fill: paste the campaign
// site URL, hit Scrape, and it pulls candidate name + donate link via the Email
// Builder's scraper. Manual fields always remain editable as a fallback.
export default function CampaignFields({ candidateName, setCandidateName, office, setOffice, link, setLink }: Props) {
  const [website, setWebsite] = useState('')
  const [scraping, setScraping] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const scrape = async () => {
    const url = website.trim()
    if (!url) return
    setScraping(true); setMsg(null)
    try {
      const res = await fetch(`/api/email-builder/scrape?url=${encodeURIComponent(url)}`)
      if (!res.ok) throw new Error()
      const r = await res.json()
      let filled = 0
      if (r.name) { setCandidateName(r.name); filled++ }
      if (r.donate_url) { setLink(r.donate_url); filled++ }
      setMsg(filled ? { text: `Filled ${filled} field${filled > 1 ? 's' : ''} from the site ✓ — review below`, ok: true }
                    : { text: 'Couldn’t find details — enter them manually', ok: false })
    } catch {
      setMsg({ text: 'Scrape failed — enter details manually', ok: false })
    }
    setScraping(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <label className="label">Campaign website <span className="text-terminal-border normal-case">(auto-fill — optional)</span></label>
        <div className="flex gap-1">
          <input
            className="input-field"
            value={website}
            onChange={e => setWebsite(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); scrape() } }}
            placeholder="https://yourcandidate.com"
          />
          <button onClick={scrape} disabled={scraping || !website.trim()}
            className="text-xs uppercase tracking-wider border border-terminal-border px-2 text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent transition-colors disabled:opacity-40 whitespace-nowrap">
            {scraping ? '…' : 'Scrape'}
          </button>
        </div>
        {msg && <div className={`text-[10px] mt-0.5 ${msg.ok ? 'text-terminal-green' : 'text-terminal-muted'}`}>{msg.text}</div>}
      </div>
      <div>
        <label className="label">Candidate name</label>
        <input className="input-field" value={candidateName} onChange={e => setCandidateName(e.target.value)} placeholder="e.g. Maria Chen" />
      </div>
      <div>
        <label className="label">Office / district</label>
        <input className="input-field" value={office} onChange={e => setOffice(e.target.value)} placeholder="e.g. Missouri Senate District 5" />
      </div>
      <div>
        <label className="label">Donation link</label>
        <input className="input-field" value={link} onChange={e => setLink(e.target.value)} placeholder="https://secure.actblue.com/..." />
      </div>
    </div>
  )
}
