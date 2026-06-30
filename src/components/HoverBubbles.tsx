import { useState, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  /** Hyperlink-style trigger text, e.g. "Danny's Employers". */
  label: string
  /** Values shown as bubbles when the label is hovered. */
  items: string[]
}

/**
 * A hyperlink-styled label that, on hover, drops a downward popover of "bubble"
 * chips — one per item. The popover is portaled to <body> and clamped to the
 * viewport so it is always completely visible (never clipped at a screen edge);
 * long lists scroll inside a capped height.
 */
export default function HoverBubbles({ label, items }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  // Small delay so the mouse can travel from the label into the panel without
  // the popover flickering shut.
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const margin = 8
    const panelW = panelRef.current?.offsetWidth ?? 240
    let left = rect.left + window.scrollX
    const maxLeft = window.scrollX + window.innerWidth - panelW - margin
    const minLeft = window.scrollX + margin
    if (left > maxLeft) left = maxLeft
    if (left < minLeft) left = minLeft
    setPos({ top: rect.bottom + window.scrollY + 6, left })
  }, [open])

  if (!items.length) return null

  return (
    <>
      <button
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="text-terminal-accent text-sm underline decoration-dotted underline-offset-2 hover:text-terminal-text cursor-pointer"
      >
        {label}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          onMouseEnter={show}
          onMouseLeave={hide}
          className="absolute z-[9999] max-w-[320px] max-h-[60vh] overflow-y-auto bg-terminal-panel border border-terminal-border text-terminal-text rounded-md px-2.5 py-2 shadow-xl flex flex-col gap-1.5"
          style={{ top: pos.top, left: pos.left }}
        >
          {items.map((it, i) => (
            <span
              key={i}
              className="bg-terminal-border text-terminal-text text-xs rounded-full px-3 py-1 leading-snug break-words"
            >
              {it}
            </span>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
