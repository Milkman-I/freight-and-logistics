/* ============================================================
   Account details — real routing/account/IBAN from money_accounts.
   Replaces any fake card; masked until "Reveal".
   ============================================================ */

import type { MoneyAccountRow } from '../../../types/money'
import type { KycStatus } from '../../../types/user'
import { accountName } from '../../../utils/accounts'
import { Field } from '../../../components/ui'
import { I, ICONS } from '../../../components/icons'

export function AccountDetails({
  accounts,
  kyc,
  showDetails,
  onToggle,
  onOpenKyc,
}: {
  accounts: MoneyAccountRow[]
  kyc: KycStatus | null
  showDetails: boolean
  onToggle: () => void
  onOpenKyc: () => void
}) {
  const hasAccounts = accounts.length > 0

  return (
    <section id="accounts" className="rounded-2xl border border-line bg-fog p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-[#9FE870]">
            <I d={ICONS.doc} className="h-4 w-4" />
          </span>
          Your account details
        </h2>
        {hasAccounts && (
          <button
            onClick={onToggle}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
          >
            {showDetails ? 'Hide' : 'Reveal'}
          </button>
        )}
      </div>

      {!hasAccounts ? (
        <div className="mt-4">
          <p className="text-sm leading-relaxed text-muted">
            Your US routing + account numbers and European IBAN are issued
            as soon as identity verification is approved.
          </p>
          <button
            onClick={onOpenKyc}
            className="mt-4 h-11 w-full rounded-xl bg-lime text-sm font-bold text-on-lime transition-opacity hover:opacity-90"
          >
            {kyc === 'approved' ? 'Accounts provisioning…' : 'Verify identity to unlock'}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {accounts.map((acc) => {
            const mask = (v: string | null) =>
              v ? (showDetails ? v : `•••• ${v.slice(-4)}`) : null
            return (
              <div key={acc.id} className="rounded-xl border border-line bg-paper p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-ink">{accountName(acc)}</p>
                  <span className="rounded-full bg-[#D6F5C0] px-2.5 py-0.5 text-[11px] font-bold text-[#2E5B12]">
                    {acc.status}
                  </span>
                </div>
                <div className="mt-3 flex gap-4">
                  {acc.routing_number && <Field label="Routing" value={mask(acc.routing_number)} />}
                  {acc.account_number && <Field label={acc.kind === 'wallet' ? 'Address' : 'Account'} value={mask(acc.account_number)} />}
                </div>
                {acc.iban && (
                  <div className="mt-2">
                    <Field label="IBAN" value={mask(acc.iban)} />
                  </div>
                )}
                {acc.rails.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {acc.rails.map((r) => (
                      <span key={r} className="rounded-md border border-line bg-paper px-2 py-0.5 text-[10px] font-bold uppercase text-muted">
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
