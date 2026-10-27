/**
 * Global notifications (Lime Voltage).
 *  · success / info → toast stack, fixed top-right, auto-dismisses
 *    (stack capped at 4 so bursts of failures can't flood the screen)
 *  · error          → centered modal popup, dismissed by the user
 * notify(message, kind) from anywhere; <Toasts/> + <ErrorDialog/> mount
 * once in App.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { playError, playSuccess } from '../utils/sound'

export type ToastKind = 'error' | 'success' | 'info'
export type Toast = { id: number; kind: ToastKind; message: string }

let toasts: Toast[] = [] // success + info
let dialogs: Toast[] = [] // errors, shown front-most first
let nextId = 1
const listeners = new Set<() => void>()
const dismissTimers = new Map<number, number>()

function emit() {
  for (const l of listeners) l()
}

function push(message: string, kind: ToastKind): number {
  const t = { id: nextId++, kind, message }
  if (kind === 'error') {
    playError()
    dialogs = [...dialogs, t]
  } else {
    playSuccess()
    toasts = [...toasts, t].slice(-4)
    const timer = window.setTimeout(() => dismissToast(t.id), 6000)
    dismissTimers.set(t.id, timer)
  }
  emit()
  return t.id
}

export function notify(message: string, kind: ToastKind = 'info'): number {
  return push(message, kind)
}

export function dismissToast(id: number) {
  if (!toasts.some((t) => t.id === id)) return
  const timer = dismissTimers.get(id)
  if (timer !== undefined) window.clearTimeout(timer)
  dismissTimers.delete(id)
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function dismissDialog(id: number) {
  if (!dialogs.some((t) => t.id === id)) return
  dialogs = dialogs.filter((t) => t.id !== id)
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, () => toasts)
}

export function useErrorDialogs(): Toast[] {
  return useSyncExternalStore(subscribe, () => dialogs)
}

const KIND_CLS: Record<ToastKind, { border: string; icon: string; iconCls: string }> = {
  error: { border: 'border-l-[#E5484D]', icon: '✕', iconCls: 'text-[#FFB4AB]' },
  success: { border: 'border-l-[#9FE870]', icon: '✓', iconCls: 'text-[#B9E585]' },
  info: { border: 'border-l-[#8FA385]', icon: 'ℹ', iconCls: 'text-[#DDE7D6]' },
}

export function Toasts() {
  const stack = useToasts()
  if (stack.length === 0) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 top-4 z-[70] flex w-[min(21rem,calc(100vw-2rem))] flex-col gap-2.5"
    >
      {stack.map((t) => (
        <div
          key={t.id}
          className={`toast-in flex items-start gap-3 rounded-xl border-l-4 bg-[#163300] px-4 py-3 shadow-[0_10px_28px_rgba(22,51,0,0.35)] ${KIND_CLS[t.kind].border}`}
        >
          <span aria-hidden className={`mt-0.5 text-sm font-black ${KIND_CLS[t.kind].iconCls}`}>
            {KIND_CLS[t.kind].icon}
          </span>
          <p className="flex-1 text-sm font-medium leading-snug text-[#F2F7EC]">{t.message}</p>
          <button
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss notification"
            className="mt-0.5 text-[#8FA385] transition-colors hover:text-white"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

export function ErrorDialog() {
  const stack = useErrorDialogs()
  const top = stack[0] ?? null
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    okRef.current?.focus()
  }, [top?.id])

  useEffect(() => {
    if (!top) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissDialog(top.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [top?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!top || top.kind !== 'error') return null
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0B1A04]/60 p-4 backdrop-blur-[2px]"
      onClick={() => dismissDialog(top.id)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="dialog-in w-full max-w-sm rounded-2xl border border-line bg-paper px-6 pb-6 pt-8 text-center shadow-[0_24px_64px_rgba(0,0,0,0.4)]"
      >
        <span
          aria-hidden
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FDD9D7] text-base font-black text-[#9B1C12]"
        >
          ✕
        </span>
        <h2 className="mt-4 text-lg font-extrabold tracking-tight text-ink">Something went wrong</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{top.message}</p>
        <button
          ref={okRef}
          onClick={() => dismissDialog(top.id)}
          className="mt-6 h-11 w-full rounded-xl bg-lime text-sm font-bold text-on-lime transition-opacity hover:opacity-90"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
