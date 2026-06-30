import { useState, lazy, Suspense } from 'react'
import { fecApi } from '../api/fec'
import { getClientCandidate, updateClientCandidate } from '../lib/clientCandidate'
import Tooltip from './Tooltip'
import CampaignFields from './CampaignFields'

// Lazy so the (large) Email Builder is its own chunk — only loaded when the
// branded-email popup is actually opened, not on every donor profile.
const EmailBuilderPage = lazy(() => import('../pages/EmailBuilderPage'))

interface Props {
  name: string
  state?: string
  className?: string
  title?: string
  children?: React.ReactNode
}

// Opens the FULL Email Builder in a popup, pre-seeded with fundraising copy
// personalized to this donor (giving trends + inferred issues + ask). The user
// then styles it with their brand (logo, colors, donate buttons, socials,
// paid-for-by) and exports — all inside the editor.
export default function BrandedEmailLauncher({ name, state, className, title, children }: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const cc = getClientCandidate()
  const [candidateName, setCandidateName] = useState(cc?.candidate_name || '')
  const [office, setOffice] = useState(cc?.office_label || '')
  const [link, setLink] = useState(cc?.fundraising_url || '')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [seed, setSeed] = useState<{ subject: string; body: string } | null>(null)

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
      setSeed({ subject: r.subject, body: r.email })
      setFormOpen(false)
      setEditorOpen(true)
    } catch {
      setErr('Generation failed — try again.')
    }
    setLoading(false)
  }

  const trigger = (
    <button onClick={e => { e.stopPropagation(); setFormOpen(true) }} className={className}>
      {children}
    </button>
  )

  return (
    <>
      {title ? <Tooltip content={title} placement="bottom">{trigger}</Tooltip> : trigger}

      {/* Step 1: campaign details */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setFormOpen(false)}>
          <div className="bg-terminal-panel border border-terminal-border rounded-lg p-4 w-[26rem] max-w-full text-sm" onClick={e => e.stopPropagation()}>
            <div className="text-terminal-accent font-bold uppercase tracking-wider text-xs mb-1">Branded fundraising email</div>
            <div className="text-terminal-muted text-xs mb-3 truncate">for {name} — personalized to their giving &amp; issues</div>
            <div className="flex flex-col gap-2">
              <CampaignFields
                candidateName={candidateName} setCandidateName={setCandidateName}
                office={office} setOffice={setOffice}
                link={link} setLink={setLink}
              />
              <div className="text-terminal-border text-[10px] leading-snug">
                Generates copy tailored to this donor, then opens the full email editor — set your brand (logo, colors, donate buttons, socials, paid-for-by) there.
              </div>
              {err && <div className="text-terminal-red text-xs">{err}</div>}
              <div className="flex gap-2 mt-1">
                <button onClick={generate} disabled={loading} className="btn-primary flex-1 py-1.5 disabled:opacity-50">
                  {loading ? 'Generating…' : 'Generate & open editor'}
                </button>
                <button onClick={() => setFormOpen(false)} className="px-3 py-1.5 text-xs text-terminal-muted border border-terminal-border rounded hover:text-terminal-text transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: full Email Builder in a popup, seeded with the personalized copy */}
      {editorOpen && seed && (
        <div className="fixed inset-0 z-50 bg-black/70 p-2 md:p-6 flex" onClick={() => setEditorOpen(false)}>
          <div className="bg-terminal-bg border border-terminal-border rounded-lg w-full h-full overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <Suspense fallback={<div className="p-6 text-terminal-muted text-xs uppercase tracking-wider animate-pulse">Loading editor…</div>}>
              <EmailBuilderPage
                embedded
                initialSubject={seed.subject}
                initialBodyMarkdown={seed.body}
                onClose={() => setEditorOpen(false)}
              />
            </Suspense>
          </div>
        </div>
      )}
    </>
  )
}
