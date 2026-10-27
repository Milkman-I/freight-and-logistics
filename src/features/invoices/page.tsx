/*
  features/invoices — /invoices. Real invoices in Postgres; creation is
  KYC-gated (invoices_kyc_gate trigger — only approved customers may
  insert). Settlement is auto-detected by the Bridge webhook (an incoming
  transfer that settles with the invoice's exact amount+currency flips
  it to paid).
*/

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { fetchProfile } from '../../services/profiles'
import { AppRail } from '../../components/AppRail'
import { Logo } from '../../components/Logo'
import { notify } from '../../components/Toast'
import { EmptyState, Select } from '../../components/ui'
import { I, ICONS } from '../../components/icons'
import { fmtDate, money, toMinor, toMajor, majorMoney } from '../../utils/format'
import type { InvoiceRow, InvoiceStatus } from '../../types/invoice'
import type { MoneyAccountRow } from '../../types/money'

const PILL: Record<InvoiceStatus, { cls: string; label: string }> = {
  unpaid: { cls: 'bg-[#FFE9B8] text-[#8A5A00]', label: 'Unpaid' },
  paid: { cls: 'bg-[#D6F5C0] text-[#2E5B12]', label: 'Paid' },
  void: { cls: 'bg-fog text-muted', label: 'Void' },
}

const CURRENCIES = [
  { value: 'USDB', label: 'USDB — stablecoin on Base' },
  { value: 'USD', label: 'USD — ACH / Wire' },
  { value: 'EUR', label: 'EUR — SEPA' },
]

export function InvoicesPage() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [accounts, setAccounts] = useState<MoneyAccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [clientName, setClientName] = useState('')
  const [currency, setCurrency] = useState('USDB')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [filter, setFilter] = useState('all')
  const [approved, setApproved] = useState<boolean | null>(null) // null = unknown, DB trigger stays the backstop

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const [inv, acc, prof] = await Promise.all([
      supabase.schema('public').from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.schema('public').from('money_accounts').select('*').eq('user_id', user.id),
      fetchProfile(user.id).catch(() => null),
    ])
    if (inv.error) notify(inv.error.message, 'error')
    if (acc.error) notify(acc.error.message, 'error')
    if (prof) setApproved(prof.kyc_status === 'approved')
    setInvoices((inv.data ?? []) as InvoiceRow[])
    setAccounts((acc.data ?? []) as MoneyAccountRow[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (approved === false) return notify('Verify your identity first — invoicing unlocks right after.', 'error')
    const num = Number(amount)
    if (!clientName.trim()) return notify('Add the client name.', 'error')
    if (!Number.isFinite(num) || num <= 0) return notify('Enter an invoice amount above zero.', 'error')
    setBusy(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setBusy(false)
      return notify('Session expired — sign in again.', 'error')
    }
    const { data, error } = await supabase
      .schema('public')
      .from('invoices')
      .insert({
        user_id: user.id,
        client_name: clientName.trim(),
        currency,
        amount_minor: toMinor(num, currency),
        note: note.trim(),
      })
      .select('*')
      .single()
    setBusy(false)
    if (error) {
      if (error.message.includes('kyc_not_approved'))
        return notify('Verify your identity first — invoicing unlocks right after.', 'error')
      return notify('Could not create the invoice — try again.', 'error')
    }
    setInvoices((s) => [data as InvoiceRow, ...s])
    notify(`Invoice ${(data as InvoiceRow).number} created — send the client your payment details.`, 'success')
    setFormOpen(false)
    setClientName('')
    setAmount('')
    setNote('')
  }

  async function setStatus(inv: InvoiceRow, status: InvoiceStatus) {
    if (inv.status === status) return
    setBusy(true)
    const { error } = await supabase
      .schema('public')
      .from('invoices')
      .update({ status, paid_at: status === 'paid' ? new Date().toISOString() : null, tx_id: null })
      .eq('id', inv.id)
    setBusy(false)
    if (error) return notify('Update failed — try again.', 'error')
    setInvoices((s) => s.map((r) => (r.id === inv.id ? { ...r, status, tx_id: null } : r)))
    notify(`Invoice ${inv.number} marked ${status}.`, 'success')
  }

  function instructions(inv: InvoiceRow): string {
    const acc = accounts.find((a) => a.currency === inv.currency)
    if (inv.currency === 'USD') {
      if (!acc?.routing_number || !acc?.account_number)
        return "USD account details aren't provisioned yet — they appear right after identity verification clears."
      return [
        `Pay invoice ${inv.number} — ${money(inv.amount_minor, inv.currency)}`,
        `Bank transfer (ACH/Wire) in USD to:`,
        `Beneficiary: ${acc.beneficiary_name ?? 'your F&L name on file'}`,
        `Routing number: ${acc.routing_number}`,
        `Account number: ${acc.account_number}`,
        acc.bank_name ? `Bank: ${acc.bank_name}` : '',
      ].filter(Boolean).join('\n')
    }
    if (inv.currency === 'EUR') {
      if (!acc?.iban) return "EUR IBAN isn't provisioned yet — it appears right after identity verification clears."
      return [
        `Pay invoice ${inv.number} — ${money(inv.amount_minor, inv.currency)}`,
        `SEPA credit transfer in EUR to:`,
        `IBAN: ${acc.iban}`,
        `Beneficiary: ${acc.beneficiary_name ?? 'your F&L name on file'}`,
        acc.bank_name ? `Bank: ${acc.bank_name}` : '',
      ].filter(Boolean).join('\n')
    }
    const wallet = accounts.find((a) => a.currency === 'USDB')
    if (!wallet?.wallet_address)
      return "Your USDB wallet isn't provisioned yet — it appears right after identity verification clears. Reopen this page in a moment."
    return [
      `Pay invoice ${inv.number} — ${majorMoney(toMajor(inv.amount_minor, inv.currency), inv.currency)}`,
      `Client sends USDB on Base to your F&L custody wallet:`,
      `${wallet.wallet_address}`,
      `The payment settles automatically and this invoice is marked paid the moment the funds arrive.`,
    ].join('\n')
  }

  async function copyDetails(inv: InvoiceRow) {
    try {
      await navigator.clipboard.writeText(instructions(inv))
      notify('Payment details copied — send them to the client.', 'success')
    } catch {
      notify('Clipboard unavailable in this browser — copy manually.', 'error')
    }
  }

  const visible = invoices.filter((r) => filter === 'all' || r.status === filter)
  const openCount = invoices.filter((r) => r.status === 'unpaid').length

  return (
    <main className="page-enter min-h-screen bg-paper">
      <AppRail active="invoices" />
      <div className="md:pl-[72px]">
        <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
          <button onClick={() => navigate('/app')} aria-label="Back to dashboard">
            <Logo />
          </button>
          <button
            onClick={() => void supabase.auth.signOut()}
            className="h-10 rounded-xl border-[1.5px] border-[#C4CCB4] px-4 text-sm font-semibold text-ink transition-colors hover:bg-fog"
          >
            Sign out
          </button>
        </header>

        <article className="mx-auto max-w-4xl px-6 pb-24 pt-6 md:pt-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-moss">Get paid</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h1 className="text-4xl font-extrabold tracking-tight text-ink md:text-5xl">Invoices</h1>
            <p className="pb-1 text-sm font-bold text-ink">
              {openCount} unpaid
            </p>
          </div>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Create an invoice, send the client your F&amp;L payment details, and the moment their
            transfer settles it's matched automatically and marked paid.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <Select
              value={filter}
              onChange={(v) => setFilter(v)}
              options={[
                { value: 'all', label: 'All invoices' },
                { value: 'unpaid', label: 'Unpaid' },
                { value: 'paid', label: 'Paid' },
                { value: 'void', label: 'Void' },
              ]}
              className="w-40"
            />
            {approved === false ? (
              <button
                onClick={() => navigate('/kyc')}
                className="flex h-11 items-center rounded-full border-[1.5px] border-moss px-4 text-sm font-bold text-moss transition-colors hover:bg-spring"
              >
                Verify identity to create invoices →
              </button>
            ) : (
              <button
                onClick={() => setFormOpen((o) => !o)}
                className="flex h-11 items-center gap-2 rounded-full bg-lime px-4 text-sm font-bold text-on-lime transition-opacity hover:opacity-90"
              >
                <I d={ICONS.invoice} className="h-4 w-4" />
                {formOpen ? 'Close form' : 'New invoice'}
              </button>
            )}
          </div>

          {formOpen && (
            <form
              onSubmit={(e) => void create(e)}
              className="mt-4 space-y-4 rounded-2xl border border-line bg-fog p-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[13px] font-semibold text-ink">Client name</span>
                  <input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Acme Studio"
                    className="mt-2 h-12 w-full rounded-xl bg-paper px-4 text-ink outline-none placeholder:text-muted/60 focus:border-[1.5px] focus:border-moss"
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] font-semibold text-ink">Currency</span>
                  <div className="mt-2">
                    <Select value={currency} onChange={(v) => setCurrency(v)} options={CURRENCIES} />
                  </div>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[13px] font-semibold text-ink">Amount</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder={currency === 'USDB' ? '1500.00' : '1500.00'}
                    className="mt-2 h-12 w-full rounded-xl bg-paper px-4 font-mono text-ink outline-none placeholder:text-muted/60 focus:border-[1.5px] focus:border-moss"
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] font-semibold text-ink">Note (optional)</span>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Design retainer — March"
                    className="mt-2 h-12 w-full rounded-xl bg-paper px-4 text-ink outline-none placeholder:text-muted/60 focus:border-[1.5px] focus:border-moss"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="h-12 w-full rounded-xl bg-lime text-sm font-bold text-on-lime transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-56"
              >
                {busy ? 'Creating…' : 'Create invoice'}
              </button>
            </form>
          )}

          <div className="mt-6 space-y-3">
            {loading ? (
              <div className="h-32 animate-pulse rounded-2xl bg-fog" />
            ) : visible.length === 0 ? (
              <EmptyState
                text={
                  invoices.length === 0
                    ? 'No invoices yet — create your first one and bill in USD, EUR or USDB.'
                    : 'Nothing matches this filter.'
                }
              />
            ) : (
              visible.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-fog p-4"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-lime">
                    <I d={ICONS.invoice} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">
                      {inv.number} · {inv.client_name || '—'}
                    </p>
                    <p className="truncate text-xs text-muted">
                      Created {fmtDate(inv.created_at)}
                      {inv.paid_at ? ` · paid ${fmtDate(inv.paid_at)}` : ''}
                      {inv.note ? ` · ${inv.note}` : ''}
                    </p>
                    {inv.status === 'unpaid' && (
                      <p className="mt-1 hidden text-[11px] leading-relaxed text-muted sm:block">
                        Client unpaid? Send them the details — settlement matches automatically.
                      </p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${PILL[inv.status].cls}`}
                  >
                    {PILL[inv.status].label}
                  </span>
                  <span
                    className="font-mono text-base font-bold text-ink"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {money(inv.amount_minor, inv.currency)}
                  </span>
                  <div className="flex w-full flex-wrap items-center gap-2">
                    {inv.status === 'unpaid' && (
                      <>
                        <button
                          onClick={() => void copyDetails(inv)}
                          className="rounded-full border border-line bg-paper px-3 py-2 text-xs font-bold text-ink transition-colors hover:bg-spring"
                        >
                          Copy payment details
                        </button>
                        <button
                          onClick={() => void setStatus(inv, 'paid')}
                          className="rounded-full border border-line bg-paper px-3 py-2 text-xs font-bold text-moss transition-colors hover:bg-spring"
                        >
                          Mark paid
                        </button>
                      </>
                    )}
                    {inv.status !== 'void' ? (
                      <button
                        onClick={() => void setStatus(inv, 'void')}
                        className="rounded-full px-3 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink"
                      >
                        Void
                      </button>
                    ) : (
                      <button
                        onClick={() => void setStatus(inv, 'unpaid')}
                        className="rounded-full px-3 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </div>
    </main>
  )
}
