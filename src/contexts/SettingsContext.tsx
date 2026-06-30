import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'night' | 'day'

export const FONTS = [
  { label: 'JetBrains Mono', value: "'JetBrains Mono', Consolas, monospace" },
  { label: 'Fira Code',      value: "'Fira Code', Consolas, monospace" },
  { label: 'IBM Plex Mono',  value: "'IBM Plex Mono', Consolas, monospace" },
  { label: 'Consolas',       value: 'Consolas, monospace' },
  { label: 'Courier New',    value: "'Courier New', monospace" },
]

export const FONT_SIZES = [10, 11, 12, 13, 14]

interface Settings {
  theme:      Theme
  fontSize:   number
  fontFamily: string
}

interface SettingsCtx extends Settings {
  setTheme:      (t: Theme) => void
  setFontSize:   (n: number) => void
  setFontFamily: (f: string) => void
}

const Ctx = createContext<SettingsCtx | null>(null)

const STORAGE_KEY = 'rp_settings'

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaults(), ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return defaults()
}

function defaults(): Settings {
  return { theme: 'day', fontSize: 12, fontFamily: FONTS[0].value }
}

function apply(s: Settings) {
  const root = document.documentElement
  root.setAttribute('data-theme', s.theme)
  root.style.setProperty('--app-font-size',   `${s.fontSize}px`)
  root.style.setProperty('--app-font-family', s.fontFamily)
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const s = load()
    apply(s)
    return s
  })

  function update(patch: Partial<Settings>) {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      apply(next)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  return (
    <Ctx.Provider value={{
      ...settings,
      setTheme:      t => update({ theme: t }),
      setFontSize:   n => update({ fontSize: n }),
      setFontFamily: f => update({ fontFamily: f }),
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
