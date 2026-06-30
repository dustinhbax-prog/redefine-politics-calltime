import { createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

// The top bar (in Layout) exposes a DOM node here; pages render their
// title/control bar into it via <TopBarPortal>, so everything lives in one
// unified bar beside the logo instead of a separate strip below.
export const TopBarSlotContext = createContext<HTMLElement | null>(null)

export function TopBarPortal({ children }: { children: React.ReactNode }) {
  const slot = useContext(TopBarSlotContext)
  if (!slot) return null
  return createPortal(children, slot)
}
