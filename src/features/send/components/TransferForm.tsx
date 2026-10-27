/*
  TransferForm — the send-money form. All money-mutating logic
  (service insert) stays in the page; the form validates and
  hands normalized values up via onSubmit.
*/

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { MoneyAccountRow, Rail } from '../../../types/money'
import { accountName, RAIL_LABEL } from '../../../utils/accounts'
import { majorMoney } from '../../../utils/format'
import { notify } from '../../../components/Toast'

export type TransferValues = {
  accountId: string
  rail: Rail
  amountNum: number
  recipient: string
  routing: string
  destAccount: string
  iban: string
  address: string
  note: string
}

const ALL_RAILS: Rail[] = ['ach', 'fednow', 'wire', 'sepa', 'base']

const inputCls =
  'mt-2 h-12 w-full rounded-xl bg-fog px-4 font-mono text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-[1.5px] focus:border-moss focus:bg-paper'
const inputTextCls =
  'mt-2 h-12 w-full rounded-xl bg-fog px-4 text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-[1.5px] focus:border-moss focus:bg-paper'
const labelCls = 'text-[13px] font-semibold text-ink'

export function TransferForm({
  accounts,
  available,
  busy,
  onSubmit,
}: {
  accounts: MoneyAccountRow[]

  available: Record<string, number>
  busy: boolean

  onSubmit: (values: TransferValues) => Promise<void>
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [rail, setRail] = useState<Rail | ''>('')
  const [recipient, setRecipient] = useState('')
  const [routing, setRouting] = useState('')
  const [destAccount, setDestAccount] = useState('')
  const [iban, setIban] = useState('')
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const from = accounts.find((a) => a.id === accountId) ?? null
  const currency = from?.currency ?? 'USDB'
  const rails = (from?.rails ?? []).filter((r) => r in RAIL_LABEL) as Rail[]

  useEffect(() => {
    setRail(rails[0] ?? '')
    setRouting('')
    setDestAccount('')
    setIban('')
    setAddress('')
  }, [accountId]) // eslint-disable-line react-hooks/exhaustive-deps

  const amountNum = Number(amount)
  const insufficient = amount !== '' && amountNum > (available[currency] ?? 0)

  function destination(): string {
    if (rail === 'sepa') return iban
    if (rail === 'base') return address
    return routing && destAccount ? `${routing} / ${destAccount}` : ''
  }

  async function go(e: FormEvent) {
    e.preventDefault()
    const values = {
      accountId,
      rail: (rail || (ALL_RAILS.length && rails[0])) as Rail,
      amountNum,
      recipient: recipient.trim(),
      routing,
      destAccount,
      iban,
      address,
      note,
    }
    const dest = destination()
    if (!from || !values.rail) return notify('Choose an account to send from.', 'error')
    if (!values.recipient) return notify('Add the recipient name.', 'error')
    if (!dest) return notify('Add the recipient bank / wallet details.', 'error')
    if (!Number.isFinite(amountNum) || amountNum <= 0)
      return notify('Enter an amount above zero.', 'error')
    if (insufficient)
      return notify(
        `Not enough ${currency}. You have ${majorMoney(available[currency] ?? 0, currency)}.`,
        'error',
      )
    await onSubmit(values)
  }

  const railList = rails.length > 0 ? rails : ALL_RAILS

  return (
    <form onSubmit={(e) => void go(e)} className="mt-8 space-y-5">
      <div>
        <label className={labelCls}>Send from</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {accounts.map((a) => (
            <button
              type="button"
              key={a.id}
              onClick={() => setAccountId(a.id)}
              className={
                'flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ' +
                (a.id === accountId
                  ? 'border-[#5B8A1E] bg-spring'
                  : 'border-line bg-fog/60 hover:bg-fog')
              }
            >
              <span className="text-sm font-bold text-ink">{accountName(a)}</span>
              <span className="text-xs font-semibold text-muted">
                {majorMoney(available[a.currency] ?? 0, a.currency)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>How it travels (rail)</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {railList.map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => setRail(r)}
              className={
                'rounded-full border px-4 py-2 text-xs font-bold transition-colors ' +
                (r === rail ? 'border-[#5B8A1E] bg-spring text-ink' : 'border-line bg-fog/60 text-muted hover:text-ink')
              }
            >
              {RAIL_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Recipient name</label>
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="e.g. Riverside Studio GmbH"
          className={inputTextCls}
        />
      </div>

      {rail === 'sepa' ? (
        <div>
          <label className={labelCls}>Recipient IBAN</label>
          <input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="DE89 3704 0044 0532 0130 00"
            className={inputCls}
          />
        </div>
      ) : rail === 'base' ? (
        <div>
          <label className={labelCls}>Recipient wallet address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            className={inputCls}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Routing number</label>
            <input
              value={routing}
              onChange={(e) => setRouting(e.target.value.replace(/\D/g, '').slice(0, 9))}
              placeholder="9 digits"
              inputMode="numeric"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Account number</label>
            <input
              value={destAccount}
              onChange={(e) => setDestAccount(e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 17))}
              placeholder=""
              className={inputCls}
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>
            Amount · available {majorMoney(available[currency] ?? 0, currency)}
          </label>
          <div className="relative mt-2">
            <input
              value={amount}
              onChange={(e) => {
                const clean = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
                setAmount(clean)
              }}
              placeholder="0.00"
              inputMode="decimal"
              className={`h-12 w-full rounded-xl bg-fog px-4 pr-16 text-lg font-bold text-ink outline-none transition-colors focus:bg-paper ${insufficient ? 'border-[1.5px] border-danger' : 'focus:border-[1.5px] focus:border-moss'}`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted">
              {currency}
            </span>
          </div>
          {insufficient && (
            <p className="mt-1.5 text-xs font-semibold text-danger">
              That's more than your settled balance of {majorMoney(available[currency] ?? 0, currency)}.
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`e.g. Invoice #${new Date().getFullYear()}-001`}
            className={inputTextCls}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-1 rounded-xl bg-fog/60 px-4 py-3 text-xs text-muted">
        <span>0% spread · mid-market rate</span>
        <span>Fee: from $0</span>
        <span>Arrives in seconds, racks stay visible</span>
      </div>

      <button
        type="submit"
        disabled={busy || !from}
        className="h-13 w-full rounded-xl bg-lime py-3.5 text-base font-bold text-on-lime transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Starting transfer…' : amountNum > 0 ? `Send ${majorMoney(amountNum, currency)}` : 'Send money'}
      </button>
      <p className="text-center text-xs text-muted">
        Transfers recalc against your balance at send, then settle
        through our custody — failed transfers are returned automatically.
      </p>
    </form>
  )
}
