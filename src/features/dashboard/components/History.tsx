/* ============================================================
   Transactions history — real rows with real search + type filter.
   ============================================================ */

import type { TransactionRow } from '../../../types/money'
import { fmtDate, money } from '../../../utils/format'
import { EmptyState, Select } from '../../../components/ui'
import { I, ICONS } from '../../../components/icons'

export type TypeFilter = 'all' | 'in' | 'out'

export function History({
  visible,
  hasAny,
  query,
  onQuery,
  typeFilter,
  onTypeFilter,
}: {
  visible: TransactionRow[]
  hasAny: boolean
  query: string
  onQuery: (v: string) => void
  typeFilter: TypeFilter
  onTypeFilter: (v: TypeFilter) => void
}) {
  return (
    <section id="history" className="mt-4 rounded-2xl border border-line bg-fog p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-[#9FE870]">
            <I d={ICONS.list} className="h-4 w-4" />
          </span>
          Transactions History
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Filter by ID, name…"
              className="h-10 w-44 rounded-full border border-line bg-paper pl-4 pr-4 text-xs text-ink outline-none placeholder:text-muted focus:border-lime/60"
            />
          </div>
          <Select
            value={typeFilter}
            onChange={(v) => onTypeFilter(v as TypeFilter)}
            options={[
              { value: 'all', label: 'All types' },
              { value: 'in', label: 'Money in' },
              { value: 'out', label: 'Money out' },
            ]}
            className="w-32"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState text={hasAny ? 'Nothing matches this filter.' : 'No transactions yet. Money you receive appears here.'} />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs font-semibold text-muted">
                <th className="pb-3 pr-4 font-semibold">Description</th>
                <th className="pb-3 pr-4 font-semibold">Rail</th>
                <th className="pb-3 pr-4 font-semibold">Category</th>
                <th className="pb-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
              {visible.map((t) => (
                <tr key={t.id} className="border-b border-line/50 last:border-0">
                  <td className="py-3.5 pr-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                          t.direction === 'in'
                            ? 'border-lime/40 bg-lime/15 text-[#9FE870]'
                            : 'border-line bg-paper text-muted'
                        }`}
                      >
                        <I d={t.direction === 'in' ? ICONS.inArrow : ICONS.outArrow} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {t.description || (t.direction === 'in' ? 'Incoming payment' : 'Outgoing transfer')}
                        </p>
                        <p className="text-xs text-muted">
                          {fmtDate(t.created_at)} · {t.status.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 pr-4 text-xs uppercase text-muted">{t.rail ?? '—'}</td>
                  <td className="py-3.5 pr-4">
                    {t.category ? (
                      <span className="rounded-full border border-lime/40 bg-lime/10 px-2.5 py-1 text-[11px] font-semibold text-[#9FE870]">
                        {t.category}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className={`py-3.5 text-right font-bold tabular-nums ${t.direction === 'in' ? 'text-[#9FE870]' : 'text-ink'}`}>
                    {t.direction === 'in' ? '+' : '−'}{money(t.amount_minor, t.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
