/* ============================================================
   F&L components — UI primitives (src/components/ui.tsx)
   Small presentational bits shared across feature surfaces.
   ============================================================ */

import { useEffect, useId, useRef, useState } from 'react'

export function Select({
  value,
  onChange,
  options,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listboxId = useId()

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  useEffect(() => {
    if (open && listRef.current?.children[active]) {
      listRef.current.children[active].scrollIntoView({ block: 'nearest' })
    }
  }, [active, open])

  const openList = () => {
    setActive(selectedIndex)
    setOpen(true)
  }

  const commit = (i: number) => {
    onChange(options[i].value)
    setOpen(false)
    btnRef.current?.focus()
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      if (open) {
        setOpen(false)
        btnRef.current?.focus()
      }
      return
    }
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + options.length) % options.length)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      commit(active)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`} onKeyDown={onKey}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        className="flex h-10 w-full items-center gap-2 rounded-full border border-line bg-paper pl-4 pr-9 text-left text-xs font-semibold text-ink outline-none transition-colors hover:border-lime/50 focus:border-lime/60"
      >
        <span className="min-w-0 flex-1 truncate">{options[selectedIndex]?.label ?? value}</span>
      </button>
      <svg
        viewBox="0 0 24 24"
        className={`pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        aria-hidden
      >
        <path d="m6 9 6 6 6-6" />
      </svg>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-activedescendant={`${listboxId}-${active}`}
          className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-auto rounded-xl border border-line bg-paper py-1 shadow-[0_12px_32px_rgba(22,51,0,0.16)]"
        >
          {options.map((o, i) => {
            const sel = o.value === value
            return (
              <li
                key={o.value}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={sel}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-xs font-semibold transition-colors ${
                  i === active ? 'bg-spring' : sel ? 'bg-lime/10' : 'hover:bg-spring'
                } ${sel ? 'text-ink' : 'text-ink/80'}`}
              >
                <span className="truncate">{o.label}</span>
                {sel && (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 shrink-0 text-moss"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="m-2 rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
      {text}
    </div>
  )
}

export function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="truncate font-mono text-sm font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
    </div>
  )
}
