/* ============================================================
   Cashflow — last 12 calendar months of real settled volume.
   Empty until real money settles (no sample data).
   ============================================================ */

import { useMemo } from 'react'
import type { TransactionRow } from '../../../types/money'
import { isSettled, macroOf, money, toMajor } from '../../../utils/format'
import { EmptyState } from '../../../components/ui'
import { I, ICONS } from '../../../components/icons'

const LIME = '#9FE870'

export function Cashflow({ transactions }: { transactions: TransactionRow[] }) {
  const flow = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('en', { month: 'short' })
    const now = new Date()
    const slots = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: fmt.format(d), major: 0 }
    })
    const idx = new Map(slots.map((s, i) => [s.key, i]))
    for (const t of transactions.filter(isSettled)) {
      const d = new Date(t.created_at)
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`)
      if (i !== undefined) slots[i].major += (t.direction === 'in' ? 1 : -1) * toMajor(t.amount_minor, t.currency)
    }
    const max = Math.max(...slots.map((s) => s.major), 0)
    return { slots, max }
  }, [transactions])

  return (
    <section className="mt-4 rounded-2xl border border-line bg-fog p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-[#9FE870]">
            <I d={ICONS.chart} className="h-4 w-4" />
          </span>
          Cashflow
        </h2>
        <span className="text-xs font-medium text-muted">Last 12 months</span>
      </div>

      {flow.max === 0 ? (
        <EmptyState text="No cashflow yet — your first settled payment will draw this chart." />
      ) : (
        <div className="mt-5 flex gap-3">
          <div className="flex w-12 shrink-0 flex-col justify-between py-0.5 text-right text-[10px] font-medium text-muted" style={{ height: 232 }}>
            {['1×', '¾', '½', '¼', '0'].map((k) => (
              <span key={k}>{k}</span>
            ))}
          </div>
          <div className="relative flex-1" style={{ height: 232 }}>
            <div className="absolute inset-x-0 border-t border-dashed border-lime/60" style={{ bottom: '92%' }}>
              <span className="absolute -top-3.5 left-2 rounded-full border border-lime/50 bg-paper px-2 py-0.5 text-[10px] font-bold text-[#9FE870]">
                {money(Math.round(flow.max * macroOf('USD')), 'USD')}
              </span>
            </div>
            <div className="flex h-full items-end justify-between gap-1.5 sm:gap-2">
              {flow.slots.map((s, i) => (
                <div key={i} className="group flex h-full flex-1 items-end">
                  <div
                    title={`${s.label} ${new Date().getFullYear()} · ${money(Math.round(Math.abs(s.major) * macroOf('USD')), 'USD')}`}
                    className="w-full rounded-t-md border-t-2 bg-gradient-to-b from-[#9FE870]/45 via-[#9FE870]/15 to-transparent transition-opacity group-hover:opacity-95"
                    style={{ height: `${Math.max(2, (s.major / flow.max) * 92)}%`, borderTopColor: s.major < 0 ? '#E5484D' : LIME }}
                  />
                </div>
              ))}
            </div>
            <div className="absolute inset-x-0 top-full mt-1.5 flex gap-1.5 text-[10px] font-medium text-muted sm:gap-2">
              {flow.slots.map((s, i) => (
                <span key={i} className="flex-1 text-center">{s.label}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
