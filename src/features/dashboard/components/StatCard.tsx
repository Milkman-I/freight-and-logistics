/* ============================================================
   Stat card — icon + value + subline, used on the dashboard.
   ============================================================ */

import type { ReactNode } from 'react'

export function StatCard({ icon, title, value, sub }: { icon: ReactNode; title: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-fog p-5">
      <div className="flex items-start justify-between">
        <p className="pt-1 text-sm font-semibold text-muted">{title}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-paper text-[#9FE870]">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  )
}
