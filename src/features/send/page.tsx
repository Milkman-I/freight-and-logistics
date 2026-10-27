/*
  features/send — /send, real outgoing transfer initiation.
  Inserts only direction='out', status='pending' — the exact write
  the transactions RLS policy allows from the client. The 0x
  wallet-address field is the payout destination; bank rails fail
  fast server-side. The Bridge webhook takes over from there
  (status → settled/failed).
*/

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { getAccounts, getBalances } from '../../services/money'
import { createTransfer, sendToBridge } from '../../services/transfers'
import { majorMoney, toMajor, toMinor } from '../../utils/format'
import type { MoneyAccountRow } from '../../types/money'
import { AppRail } from '../../components/AppRail'
import { Logo } from '../../components/Logo'
import { TransferForm, type TransferValues } from './components/TransferForm'
import { TransferConfirmation } from './components/TransferConfirmation'
import { notify } from '../../components/Toast'

export function SendPage() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<MoneyAccountRow[]>([])
  const [available, setAvailable] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ id: string; amount: string; recipient: string; rail: string } | null>(null)

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login', { replace: true })
        return
      }
      const [accs, bal] = await Promise.all([getAccounts(true), getBalances()])
      setAccounts(accs)
      setAvailable(Object.fromEntries(Object.entries(bal).map(([c, minor]) => [c, toMajor(minor, c)])))
      setLoading(false)
    }
    void load()
  }, [navigate])

  async function onSubmit(values: TransferValues) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      notify('Session expired — sign in again.', 'error')
      return
    }
    setBusy(true)
    try {
      const from = accounts.find((a) => a.id === values.accountId)
      const tx = await createTransfer({
        userId: user.id,
        accountId: values.accountId,
        rail: values.rail,
        currency: from?.currency ?? 'USDB',
        amountMinor: toMinor(values.amountNum, from?.currency ?? 'USDB'),
        recipient: values.recipient,
        note: values.note,
      })
      await sendToBridge(tx.id, { walletAddress: values.rail === 'base' ? values.address : undefined })
      setSent({
        id: tx.id,
        amount: majorMoney(toMajor(tx.amount_minor, tx.currency), tx.currency),
        recipient: values.recipient,
        rail: values.rail,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'recipient_details_required') {
        notify(
          'Bank-route payments need the recipient’s account/routing details — for now pay USDB wallets, or use a wallet address.',
          'error',
        )
      } else if (msg === 'kyc_not_approved') {
        notify('Identity verification must be approved before sending.', 'error')
      } else if (msg === 'bridge_not_configured') {
        notify('Transfers are temporarily unavailable — try again soon.', 'error')
      } else {
        notify('Transfer failed to start. Funds were not sent — try again.', 'error')
      }
    }
    setBusy(false)
  }

  return (
    <main className="page-enter min-h-screen bg-paper">
      <AppRail active="send" />
      <div className="md:pl-[72px]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <button onClick={() => navigate('/app')} aria-label="Back to dashboard">
          <Logo />
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/app')}
            className="h-10 rounded-xl border-[1.5px] border-[#C4CCB4] px-4 text-sm font-semibold text-ink transition-colors hover:bg-fog"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <article className="mx-auto max-w-xl px-6 pb-24 pt-6 md:pt-10">
        {sent ? (
          <TransferConfirmation
            sent={sent}
            recipient={sent.recipient}
            rail={sent.rail}
            onAgain={() => setSent(null)}
            onDone={() => navigate('/app')}
          />
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-moss">
              Global payouts
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
              Send money<span className="hidden md:inline"> worldwide</span>.
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Mid-market exchange rate, zero hidden markups — your money, moving.
            </p>

            {loading ? (
              <div className="mt-8 h-40 animate-pulse rounded-2xl bg-fog" />
            ) : accounts.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-line bg-fog/60 p-8 text-center">
                <p className="text-base font-semibold text-ink">No active accounts to send from</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Your accounts are provisioned right after identity verification is approved.
                </p>
                <button
                  onClick={() => navigate('/kyc')}
                  className="mt-5 h-11 rounded-xl bg-lime px-6 text-sm font-bold text-on-lime transition-opacity hover:opacity-90"
                >
                  Verify identity →
                </button>
              </div>
            ) : (
              <TransferForm
                accounts={accounts}
                available={available}
                busy={busy}
                onSubmit={onSubmit}
              />
            )}
          </>
        )}
      </article>
      </div>
    </main>
  )
}
