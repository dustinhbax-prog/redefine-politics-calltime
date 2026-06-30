import { useState, useRef, useEffect, useCallback } from 'react'
import Tooltip from './Tooltip'

interface Column<T> {
  key: string
  header: string
  width?: string
  render: (row: T) => React.ReactNode
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  error?: string | null
  count?: number
}

interface ColState {
  width: number | string   // number = px (after first resize), string = initial CSS value
  savedWidth?: number | string
  collapsed: boolean
}

const COLLAPSED_W = 18

export default function DataTable<T>({ columns, rows, rowKey, loading, error, count }: Props<T>) {
  const [colStates, setColStates] = useState<Record<string, ColState>>(() =>
    Object.fromEntries(columns.map(c => [c.key, { width: c.width ?? 'auto', collapsed: false }]))
  )
  const tableRef = useRef<HTMLTableElement>(null)
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  // Sync if columns prop changes (new search results etc.)
  useEffect(() => {
    setColStates(prev => {
      const next = { ...prev }
      for (const c of columns) {
        if (!next[c.key]) next[c.key] = { width: c.width ?? 'auto', collapsed: false }
      }
      return next
    })
  }, [columns.map(c => c.key).join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  // Convert all columns to pixel widths (called lazily on first resize)
  const lockToPixels = useCallback(() => {
    const ths = tableRef.current?.querySelectorAll<HTMLElement>('th[data-ck]')
    if (!ths) return
    const px: Record<string, number> = {}
    ths.forEach(th => { px[th.dataset.ck!] = th.getBoundingClientRect().width })
    setColStates(prev => {
      const next = { ...prev }
      for (const [k, w] of Object.entries(px)) if (next[k]) next[k] = { ...next[k], width: w }
      return next
    })
    return px
  }, [])

  const startResize = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const px = lockToPixels()
    const startWidth = px?.[key] ?? 100
    resizingRef.current = { key, startX: e.clientX, startWidth }
    setDragging(true)
  }, [lockToPixels])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current; if (!r) return
      const w = Math.max(36, r.startWidth + (e.clientX - r.startX))
      setColStates(prev => ({ ...prev, [r.key]: { ...prev[r.key], width: w } }))
    }
    const onUp = () => { resizingRef.current = null; setDragging(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const toggleCollapse = (key: string) => {
    // Ensure we have pixel widths before collapsing so restore works cleanly
    const px = lockToPixels()
    setColStates(prev => {
      const col = prev[key]
      if (col.collapsed) {
        return { ...prev, [key]: { ...col, collapsed: false, width: col.savedWidth ?? px?.[key] ?? 100 } }
      } else {
        const current = px?.[key] ?? col.width
        return { ...prev, [key]: { ...col, collapsed: true, savedWidth: current, width: COLLAPSED_W } }
      }
    })
  }

  const colWidth = (key: string) => {
    const s = colStates[key]
    if (!s) return 'auto'
    const w = s.collapsed ? COLLAPSED_W : s.width
    return typeof w === 'number' ? `${w}px` : w
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ userSelect: dragging ? 'none' : undefined, cursor: dragging ? 'col-resize' : undefined }}>
      {/* Status bar */}
      <div className="px-4 py-1 border-b border-terminal-border flex items-center gap-4 text-terminal-muted text-xs bg-terminal-panel">
        {loading && <span className="text-terminal-accent animate-pulse">LOADING…</span>}
        {!loading && count !== undefined && <span>{count.toLocaleString()} RESULTS</span>}
        {error && <span className="text-red-400">{error}</span>}
      </div>

      <div className="flex-1 overflow-auto">
        <table ref={tableRef} className="border-collapse text-xs" style={{ tableLayout: 'fixed', width: '100%', minWidth: '800px' }}>
          <colgroup>
            {columns.map(col => (
              <col key={col.key} style={{ width: colWidth(col.key) }} />
            ))}
          </colgroup>

          <thead className="sticky top-0 bg-terminal-panel z-10">
            <tr>
              {columns.map(col => {
                const collapsed = colStates[col.key]?.collapsed ?? false
                return (
                  <th
                    key={col.key}
                    data-ck={col.key}
                    className={`border-b border-terminal-border font-normal relative text-terminal-muted select-none ${collapsed ? 'overflow-visible' : 'overflow-hidden'}`}
                    style={{ padding: 0 }}
                  >
                    {collapsed ? (
                      /* ── Collapsed: just the checkbox centered ── */
                      <div className="w-full h-full min-h-[28px] flex items-center justify-center">
                        <Tooltip
                          placement="bottom"
                          widthClass="w-48 text-center"
                          content={<><div className="font-bold text-terminal-accent mb-1 uppercase tracking-wider">{col.header || col.key}</div><span className="text-yellow-400">Column hidden.</span> Click to expand.</>}
                        >
                          <input
                            type="checkbox"
                            checked={true}
                            aria-label={`Show ${col.header || col.key} column`}
                            onChange={() => toggleCollapse(col.key)}
                            className="cursor-pointer opacity-10 hover:opacity-40 transition-opacity"
                            style={{ width: 11, height: 11 }}
                            onClick={e => e.stopPropagation()}
                          />
                        </Tooltip>
                      </div>
                    ) : (
                      /* ── Normal header ── */
                      <div className="flex items-center h-full px-2 py-2 gap-1.5">
                        <Tooltip
                          placement="bottom"
                          widthClass="w-48 text-center"
                          content={<><div className="font-bold text-terminal-accent mb-1 uppercase tracking-wider">{col.header || col.key}</div>Click to hide this column.</>}
                        >
                          <input
                            type="checkbox"
                            checked={false}
                            aria-label={`Hide ${col.header || col.key} column`}
                            onChange={() => toggleCollapse(col.key)}
                            className="cursor-pointer accent-terminal-accent flex-shrink-0"
                            style={{ width: 11, height: 11 }}
                            onClick={e => e.stopPropagation()}
                          />
                        </Tooltip>
                        <span className="uppercase tracking-wider text-xs flex-1 truncate">{col.header}</span>
                        {/* Resize handle */}
                        <div
                          className="absolute right-0 top-0 h-full w-2 cursor-col-resize flex items-center justify-center group/rh z-10"
                          onMouseDown={e => startResize(col.key, e)}
                        >
                          <div className="w-px h-3/5 bg-terminal-border group-hover/rh:bg-terminal-accent transition-colors" />
                        </div>
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {loading && rows.length === 0 && (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-terminal-border">
                  {columns.map(col => (
                    <td key={col.key} className="overflow-hidden" style={{ padding: 0 }}>
                      <div className="px-3 py-1.5">
                        <div className="skeleton h-3" style={{ width: `${55 + ((i * 7 + col.key.length * 11) % 40)}%` }} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))
            )}
            {rows.map((row, i) => (
              <tr
                key={rowKey(row)}
                className={`dt-row border-b border-terminal-border ${i % 2 === 0 ? '' : 'dt-row-alt'}`}
              >
                {columns.map(col => {
                  const collapsed = colStates[col.key]?.collapsed ?? false
                  return (
                    <td
                      key={col.key}
                      className="text-terminal-text overflow-hidden"
                      style={{ padding: 0 }}
                    >
                      {collapsed
                        ? null
                        : <div className="px-3 py-1.5 break-words leading-snug">{col.render(row)}</div>
                      }
                    </td>
                  )
                })}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-terminal-muted">
                    <span className="text-2xl leading-none opacity-50 select-none">⌖</span>
                    <span className="uppercase tracking-wider text-xs">No results</span>
                    <span className="text-[11px] opacity-70 normal-case tracking-normal">
                      {error ? 'Something went wrong — adjust your query and try again.' : 'Try broadening your search or clearing filters.'}
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
