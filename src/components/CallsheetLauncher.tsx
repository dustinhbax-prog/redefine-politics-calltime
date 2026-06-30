import { useState } from 'react'
import { getClientCandidate, updateClientCandidate } from '../lib/clientCandidate'
import Tooltip from './Tooltip'
import CampaignFields from './CampaignFields'

interface Props {
  name: string
  state?: string
  // Extra callsheet params (composite, district, candidate name/office/link, etc.)
  params?: Record<string, string>
  className?: string
  title?: string
  children?: React.ReactNode
}

// Button that opens a small popup asking WHO is calling (candidate vs staff/proxy)
// and optionally capturing donor contact info, then opens the tailored call sheet.
export default function CallsheetLauncher({ name, state, params, className, title, children }: Props) {
  const cc = getClientCandidate()
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<'candidate' | 'staff'>(cc?.caller_role || 'staff')
  const [candidateName, setCandidateName] = useState(cc?.candidate_name || '')
  const [office, setOffice] = useState(cc?.office_label || '')
  const [link, setLink] = useState(cc?.fundraising_url || '')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [bestTime, setBestTime] = useState('')
  const [askOverride, setAskOverride] = useState('')

  const launch = () => {
    // remember candidate + caller role for next time
    updateClientCandidate({ caller_role: role, candidate_name: candidateName, office_label: office, fundraising_url: link })
    const p = new URLSearchParams({ name, ...(state ? { state } : {}), ...(params || {}) })
    p.set('caller_role', role)
    if (candidateName.trim()) p.set('candidate_name', candidateName.trim())
    if (office.trim()) p.set('office_label', office.trim())
    if (link.trim()) p.set('fundraising_url', link.trim())
    if (phone.trim()) p.set('donor_phone', phone.trim())
    if (email.trim()) p.set('donor_email', email.trim())
    if (bestTime.trim()) p.set('donor_best_time', bestTime.trim())
    const ask = askOverride.replace(/[^0-9.]/g, '')
    if (ask && Number(ask) > 0) p.set('ask_override', ask)
    window.open(`/api/prospects/callsheet?${p}`, '_blank', 'noopener')
    setOpen(false)
    setPhone(''); setEmail(''); setBestTime(''); setAskOverride('')
  }

  const trigger = (
    <button onClick={e => { e.stopPropagation(); setOpen(true) }} className={className}>
      {children}
    </button>
  )

  return (
    <>
      {title
        ? <Tooltip content={title} placement="bottom">{trigger}</Tooltip>
        : trigger}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}>
          <div className="bg-terminal-panel border border-terminal-border rounded-lg p-4 w-[24rem] max-w-full max-h-[90vh] overflow-auto text-sm"
            onClick={e => e.stopPropagation()}>
            <div className="text-terminal-accent font-bold uppercase tracking-wider text-xs mb-1">Generate call sheet</div>
            <div className="text-terminal-muted text-xs mb-3 truncate">for {name}</div>

            <div className="text-terminal-muted text-[11px] uppercase tracking-wider mb-1.5">Your candidate</div>
            <div className="mb-3">
              <CampaignFields
                candidateName={candidateName} setCandidateName={setCandidateName}
                office={office} setOffice={setOffice}
                link={link} setLink={setLink}
              />
            </div>

            <div className="text-terminal-muted text-[11px] uppercase tracking-wider mb-1.5">Who's making the call?</div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {([['candidate', "I'm the candidate"], ['staff', 'Staff / proxy']] as const).map(([v, lbl]) => (
                <button key={v} onClick={() => setRole(v)}
                  className={`px-2 py-1.5 text-xs border rounded transition-colors ${role === v
                    ? 'border-terminal-accent text-terminal-accent bg-terminal-accent/10'
                    : 'border-terminal-border text-terminal-muted hover:border-terminal-muted'}`}>
                  {lbl}
                </button>
              ))}
            </div>
            <div className="text-terminal-border text-[10px] mb-3 leading-snug">
              {role === 'candidate'
                ? 'Script is written in first person — you introduce yourself and ask personally.'
                : 'Script introduces you as calling on the candidate’s behalf (leaves a blank for your name).'}
            </div>

            <div className="text-terminal-muted text-[11px] uppercase tracking-wider mb-1.5">
              Donor contact <span className="text-terminal-border normal-case">(optional — prints on the sheet)</span>
            </div>
            <div className="flex flex-col gap-1.5 mb-4">
              <input className="input-field" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" />
              <input className="input-field" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
              <input className="input-field" value={bestTime} onChange={e => setBestTime(e.target.value)} placeholder="Best time to call" />
            </div>

            <div className="text-terminal-muted text-[11px] uppercase tracking-wider mb-1.5">
              Ask amount <span className="text-terminal-border normal-case">(optional — overrides the suggested ask)</span>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-terminal-muted text-sm">$</span>
              <input className="input-field flex-1" value={askOverride} onChange={e => setAskOverride(e.target.value)}
                inputMode="numeric" placeholder="e.g. 350 — leave blank to use the recommended ask" />
            </div>

            <div className="flex gap-2">
              <button onClick={launch} className="btn-primary flex-1 py-1.5">Open call sheet</button>
              <button onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-xs text-terminal-muted border border-terminal-border rounded hover:text-terminal-text transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
