import { useState } from 'react'
import { useMorph } from './MorphOverlay'

const KEY = 'rp_auth'
const PASSWORD = import.meta.env.VITE_APP_PASSWORD as string

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(KEY) === PASSWORD)
  const [input, setInput] = useState('')
  const [shake, setShake] = useState(false)
  const morph = useMorph()

  // The rolodex PWA at /rolodex is a public, client-facing app authenticated by a
  // per-client token in its install link — NOT the shared staff password. Let it
  // through the gate. (The back-office at /rolodex-admin stays gated.)
  if (window.location.pathname === '/rolodex' || authed) return <>{children}</>

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input === PASSWORD) {
      sessionStorage.setItem(KEY, PASSWORD)
      morph.beginUnlock() // arms the unlock dust transition for when home mounts
      setAuthed(true)
    } else {
      setShake(true)
      setInput('')
      setTimeout(() => setShake(false), 600)
    }
  }

  return (
    <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
      <div className="w-80 flex flex-col items-center">
        <img src="/logo.png" alt="ReDEFINE POLITICS" className="w-56 h-auto mb-8" />
        <form onSubmit={submit} className={`w-full flex flex-col gap-3 ${shake ? 'animate-shake' : ''}`}>
          <input
            type="password"
            className="input-field text-center tracking-widest"
            placeholder="ENTER PASSWORD"
            aria-label="Password"
            aria-invalid={shake}
            value={input}
            onChange={e => setInput(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-primary w-full">ENTER</button>
          <span role="status" aria-live="polite" className="sr-only">
            {shake ? 'Incorrect password' : ''}
          </span>
        </form>
      </div>
    </div>
  )
}
