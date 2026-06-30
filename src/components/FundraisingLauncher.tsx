import { useState } from 'react'
import { fecApi, FundraisingMessage } from '../api/fec'
import { getClientCandidate, updateClientCandidate } from '../lib/clientCandidate'
import Tooltip from './Tooltip'
import CampaignFields from './CampaignFields'

interface Props {
  name: string
  state?: string
  className?: string
  title?: string
  children?: React.ReactNode
}

// Generates a personalized fundraising message (email + text) for one donor,
// reusing the call-sheet's donor analysis. Output is editable + copyable text.
export default function FundraisingLauncher({ name, state, className, title, children }: Props) {
  const [open, setOpen] = useState(false)
  const cc = getClientCandidate()
  const [candidateName, setCandidateName] = useState(cc?.candidate_name || '')
  const [office, setOffice] = useState(cc?.office_label || '')
  const [link, setLink] = useState(cc?.fundraising_url || '')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [out, setOut] = useState<FundraisingMessage | null>(null)
  const [subjectText, setSubjectText] = useState('')
  const [emailText, setEmailText] = useState('')
  const [smsText, setSmsText] = useState('')
  const [copied, setCopied] = useState('')

  const generate = async () => {
    setLoading(true); setErr('')
    updateClientCandidate({ candidate_name: candidateName, office_label: office, fundraising_url: link })
    const c = getClientCandidate()
    try {
      const r = await fecApi.fundraisingMessage({
        name, state,
        candidate_name: candidateName || undefined,
        office_label: office || undefined,
        fundraising_url: link || undefined,
        district_type: c?.district_type,
        district_value: c?.district_value,
      })
      setOut(r); setSubjectText(r.subject); setEmailText(r.email); setSmsText(r.sms)
    } catch {
      setErr('Generation failed — try again.')
    }
    setLoading(false)
  }

  const copy = (text: string, which: string) => {
    navigator.clipboard?.writeText(text)
    setCopied(which); setTimeout(() => setCopied(''), 1500)
  }

  const trigger = (
    <button onClick={e => { e.stopPropagation(); setOpen(true) }} className={className}>
      {children}
    </button>
  )

  return (
    <>
      {title ? <Tooltip content={title} placement="bottom">{trigger}</Tooltip> : trigger}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="bg-terminal-panel border border-terminal-border rounded-lg w-[56rem] max-w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-2 border-b border-terminal-border flex items-center justify-between">
              <div>
                <div className="text-terminal-accent font-bold uppercase tracking-wider text-xs">Personalized Fundraising Message</div>
                <div className="text-terminal-muted text-xs truncate">for {name} · tailored to their giving &amp; inferred issues</div>
              </div>
              <button onClick={() => setOpen(false)} className="text-terminal-muted hover:text-terminal-accent text-lg leading-none px-2">×</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              {/* Left: campaign inputs */}
              <div>
                <div className="text-terminal-muted text-[11px] uppercase tracking-wider mb-2">Your campaign</div>
                <div className="flex flex-col gap-2">
                  <CampaignFields
                    candidateName={candidateName} setCandidateName={setCandidateName}
                    office={office} setOffice={setOffice}
                    link={link} setLink={setLink}
                  />
                  <button onClick={generate} disabled={loading} className="btn-primary py-1.5 mt-1 disabled:opacity-50">
                    {loading ? 'Generating…' : out ? 'Regenerate' : 'Generate message'}
                  </button>
                  {err && <div className="text-terminal-red text-xs">{err}</div>}
                  {out && (
                    <div className="mt-2 text-[11px] text-terminal-muted leading-relaxed border-t border-terminal-border pt-2">
                      <div>Lean: <span className="text-terminal-text">{out.party || 'unknown'}</span> · Segment: <span className="text-terminal-text">{out.segment || '—'}</span>{out.ask ? <> · Ask: <span className="text-terminal-text">${out.ask.toLocaleString()}</span></> : null}</div>
                      {out.issues.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {out.issues.map(i => (
                            <span key={i.label} className="border border-terminal-border px-1.5 py-0.5 rounded text-[10px]">{i.label}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: generated, editable output */}
              <div className="border-l border-terminal-border md:pl-4">
                <div className="text-terminal-muted text-[11px] uppercase tracking-wider mb-2">Generated message <span className="normal-case text-terminal-border">(editable)</span></div>
                {!out && !loading && (
                  <div className="text-terminal-muted text-xs h-full flex items-center justify-center text-center py-10">
                    Fill in your campaign info and hit <span className="text-terminal-accent mx-1">Generate message</span> — the copy is personalized to this donor.
                  </div>
                )}
                {loading && <div className="text-terminal-accent text-xs animate-pulse py-10 text-center">Writing a message tailored to {name}…</div>}
                {out && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="label mb-0">Email subject</span>
                        <button onClick={() => copy(subjectText, 'subject')} className="text-[10px] uppercase tracking-wider text-terminal-muted hover:text-terminal-accent">{copied === 'subject' ? 'copied ✓' : 'copy'}</button>
                      </div>
                      <input className="input-field" value={subjectText} onChange={e => setSubjectText(e.target.value)} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="label mb-0">Email body</span>
                        <button onClick={() => copy(emailText, 'email')} className="text-[10px] uppercase tracking-wider text-terminal-muted hover:text-terminal-accent">{copied === 'email' ? 'copied ✓' : 'copy'}</button>
                      </div>
                      <textarea className="input-field font-sans leading-relaxed" rows={9} value={emailText} onChange={e => setEmailText(e.target.value)} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="label mb-0">Text message</span>
                        <button onClick={() => copy(smsText, 'sms')} className="text-[10px] uppercase tracking-wider text-terminal-muted hover:text-terminal-accent">{copied === 'sms' ? 'copied ✓' : 'copy'}</button>
                      </div>
                      <textarea className="input-field font-sans leading-relaxed" rows={3} value={smsText} onChange={e => setSmsText(e.target.value)} />
                    </div>
                    <div className="text-terminal-border text-[10px] leading-snug">
                      Inferred issue positions are statistical guesses from public giving records — review before sending.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
