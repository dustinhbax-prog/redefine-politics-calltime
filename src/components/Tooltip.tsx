import { useState, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  content: React.ReactNode
  children: React.ReactElement
  widthClass?: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

interface Pos {
  top: number
  left: number
  arrowLeft?: number // arrow x-offset (top/bottom placement)
  arrowTop?: number  // arrow y-offset (left/right placement)
}

export default function Tooltip({ content, children, widthClass = 'max-w-[260px] text-center', placement = 'top' }: Props) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)
  const triggerRef = useRef<HTMLElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Measure after the panel mounts (useLayoutEffect runs before paint, so the
  // pre-positioned frame is never visible) and clamp to the viewport so the
  // panel always stays fully on-screen instead of being clipped at an edge.
  useLayoutEffect(() => {
    if (!visible || !triggerRef.current) {
      setPos(null)
      return
    }
    const rect = triggerRef.current.getBoundingClientRect()
    const margin = 8
    const panelW = panelRef.current?.offsetWidth ?? 260
    const panelH = panelRef.current?.offsetHeight ?? 40

    if (placement === 'left' || placement === 'right') {
      const centerY = rect.top + window.scrollY + rect.height / 2
      const minTop = window.scrollY + margin
      const maxTop = window.scrollY + window.innerHeight - panelH - margin
      let top = centerY - panelH / 2
      top = Math.max(minTop, Math.min(top, maxTop))
      let arrowTop = centerY - top
      arrowTop = Math.max(10, Math.min(arrowTop, panelH - 10))
      const left = placement === 'right'
        ? rect.right + window.scrollX + margin
        : rect.left + window.scrollX - margin - panelW
      setPos({ top, left, arrowTop })
    } else {
      const centerX = rect.left + window.scrollX + rect.width / 2
      const minLeft = window.scrollX + margin
      const maxLeft = window.scrollX + window.innerWidth - panelW - margin
      let left = centerX - panelW / 2
      left = Math.max(minLeft, Math.min(left, maxLeft))
      let arrowLeft = centerX - left
      arrowLeft = Math.max(12, Math.min(arrowLeft, panelW - 12))
      setPos({
        top: placement === 'bottom'
          ? rect.bottom + window.scrollY + 8
          : rect.top + window.scrollY - 8,
        left,
        arrowLeft,
      })
    }
  }, [visible, placement])

  const child = children as React.ReactElement<React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }>

  return (
    <>
      {/* @ts-ignore */}
      <child.type
        {...child.props}
        ref={triggerRef}
        onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
          child.props.onMouseEnter?.(e)
          setVisible(true)
        }}
        onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
          child.props.onMouseLeave?.(e)
          setVisible(false)
        }}
      />
      {visible && createPortal(
        <div
          className="absolute z-[9999] pointer-events-none"
          style={{
            top: pos ? pos.top : -9999,
            left: pos ? pos.left : -9999,
            visibility: pos ? 'visible' : 'hidden',
            transform: placement === 'top' ? 'translateY(-100%)' : undefined,
          }}
        >
          <div className="relative">
            {placement === 'bottom' && (
              <div className="absolute -top-1 w-2 h-2 bg-[#1a1a1a] border-l border-t border-[#333] rotate-45" style={{ left: (pos?.arrowLeft ?? 0) - 4 }} />
            )}
            {placement === 'right' && (
              <div className="absolute -left-1 w-2 h-2 bg-[#1a1a1a] border-l border-b border-[#333] rotate-45" style={{ top: (pos?.arrowTop ?? 0) - 4 }} />
            )}
            <div ref={panelRef} className={`bg-[#1a1a1a] border border-[#333] text-[#d4d4d4] text-xs rounded px-3 py-2 shadow-xl leading-relaxed ${widthClass}`}>
              {content}
            </div>
            {placement === 'top' && (
              <div className="absolute -bottom-1 w-2 h-2 bg-[#1a1a1a] border-r border-b border-[#333] rotate-45" style={{ left: (pos?.arrowLeft ?? 0) - 4 }} />
            )}
            {placement === 'left' && (
              <div className="absolute -right-1 w-2 h-2 bg-[#1a1a1a] border-r border-t border-[#333] rotate-45" style={{ top: (pos?.arrowTop ?? 0) - 4 }} />
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
