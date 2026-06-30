import { useState } from 'react'
import { useSettings, FONTS, FONT_SIZES } from '../contexts/SettingsContext'

interface Props {
  onClose: () => void
  onOpenLog: (type: 'ip' | 'search' | 'export') => void
}

export default function SettingsPanel({ onClose, onOpenLog }: Props) {
  const [showAdminButtons, setShowAdminButtons] = useState(false)
  const { theme, fontSize, fontFamily, setTheme, setFontSize, setFontFamily } = useSettings()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="bg-terminal-panel border border-terminal-border w-80 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border">
          <span className="text-terminal-accent text-xs font-bold tracking-widest uppercase">Settings</span>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="text-terminal-muted hover:text-terminal-text transition-colors text-sm leading-none px-1"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="px-4 py-4 space-y-5">

          {/* Theme */}
          <div>
            <div className="label">Theme</div>
            <div className="flex gap-0">
              {(['night', 'day'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex-1 py-1.5 text-xs uppercase tracking-wider border transition-colors ${
                    theme === t
                      ? 'border-terminal-accent text-terminal-accent bg-terminal-bg'
                      : 'border-terminal-border text-terminal-muted hover:text-terminal-text'
                  }`}
                >
                  {t === 'night' ? '◐ Dark' : '○ Paper'}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <div className="label">Font Size</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const idx = FONT_SIZES.indexOf(fontSize)
                  if (idx > 0) setFontSize(FONT_SIZES[idx - 1])
                }}
                disabled={fontSize === FONT_SIZES[0]}
                className="border border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent transition-colors w-7 h-7 flex items-center justify-center text-sm disabled:opacity-30"
              >
                −
              </button>
              <span className="flex-1 text-center text-terminal-text text-xs tracking-wider">
                {fontSize}px
              </span>
              <button
                onClick={() => {
                  const idx = FONT_SIZES.indexOf(fontSize)
                  if (idx < FONT_SIZES.length - 1) setFontSize(FONT_SIZES[idx + 1])
                }}
                disabled={fontSize === FONT_SIZES[FONT_SIZES.length - 1]}
                className="border border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent transition-colors w-7 h-7 flex items-center justify-center text-sm disabled:opacity-30"
              >
                +
              </button>
            </div>
            <div className="flex gap-1 mt-2">
              {FONT_SIZES.map(s => (
                <button
                  key={s}
                  onClick={() => setFontSize(s)}
                  className={`flex-1 py-1 text-center text-xs border transition-colors ${
                    fontSize === s
                      ? 'border-terminal-accent text-terminal-accent'
                      : 'border-terminal-border text-terminal-muted hover:border-terminal-text'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Font Family */}
          <div>
            <div className="label">Font</div>
            <div className="flex flex-col gap-1">
              {FONTS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFontFamily(f.value)}
                  className={`text-left px-3 py-1.5 text-xs border transition-colors ${
                    fontFamily === f.value
                      ? 'border-terminal-accent text-terminal-accent bg-terminal-bg'
                      : 'border-terminal-border text-terminal-muted hover:text-terminal-text hover:border-terminal-border'
                  }`}
                  style={{ fontFamily: f.value }}
                >
                  {f.label}
                  <span className="text-terminal-muted ml-2 text-[10px]">Aa 0O lI</span>
                </button>
              ))}
            </div>
          </div>

        </div>

        <div className="px-4 py-3 border-t border-terminal-border text-terminal-muted text-xs text-center">
          Changes apply instantly · Saved to browser
        </div>

        {/* Hidden admin trigger */}
        <div className="px-4 pb-3 text-center">
          {!showAdminButtons ? (
            <button
              onClick={() => setShowAdminButtons(true)}
              className="text-terminal-border hover:text-terminal-muted text-xs opacity-30 hover:opacity-60 transition-opacity select-none"
            >
              ···
            </button>
          ) : (
            <div className="flex gap-1 justify-center flex-wrap">
              <button
                onClick={() => { onClose(); onOpenLog('ip') }}
                className="border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent text-xs px-2 py-1 uppercase tracking-wider transition-colors"
              >
                IP Log
              </button>
              <button
                onClick={() => { onClose(); onOpenLog('search') }}
                className="border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent text-xs px-2 py-1 uppercase tracking-wider transition-colors"
              >
                Search Log
              </button>
              <button
                onClick={() => { onClose(); onOpenLog('export') }}
                className="border border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent text-xs px-2 py-1 uppercase tracking-wider transition-colors"
              >
                Export Log
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
