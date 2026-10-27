/*
  features/dashboard — app shell with ALL data live from Supabase:
  user_profiles · money_accounts · transactions · balances.
  No sample values anywhere: sections without data render
  empty states that clear as soon as real money arrives.
*/

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useNavigate } from 'react-router-dom'
import type { UserProfile } from '../../types/user'
import type { MoneyAccountRow, TransactionRow } from '../../types/money'
import { fetchProfile } from '../../services/profiles'
import { fetchDashboardMoney } from '../../services/money'
import { supabase } from '../../services/supabase'
import { money, isSettled, toMajor } from '../../utils/format'
import { AppRail } from '../../components/AppRail'
import { Logo } from '../../components/Logo'
import { I, ICONS } from '../../components/icons'
import { KycStrip } from './components/KycStrip'
import { StatCard } from './components/StatCard'
import { Cashflow } from './components/Cashflow'
import { History, type TypeFilter } from './components/History'
import { AccountDetails } from './components/AccountDetails'

export function Dashboard({ session }: { session: Session }) {
  const navigate = useNavigate()
  const user = session.user
  const fullName = (user.user_metadata?.full_name as string) ?? user.email ?? 'F&L User'
  const avatar = (user.user_metadata?.avatar_url as string) ?? null

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [accounts, setAccounts] = useState<MoneyAccountRow[]>([])
  const [txns, setTxns] = useState<TransactionRow[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  async function load() {
    const [prof, moneyData] = await Promise.all([
      fetchProfile(user.id).catch(() => null),
      fetchDashboardMoney(),
    ])
    setProfile(prof)
    setAccounts(moneyData.accounts)
    setTxns(moneyData.transactions)
    setBalances(moneyData.balanceMap)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = window.location.hash
    if (!h || h.length < 2) return
    const el = document.getElementById(h.slice(1))
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth' }))
  }, [loading])

  const yearAgo = useMemo(() => new Date(Date.now() - 365 * 864e5).toISOString(), [])
  const settled = useMemo(() => txns.filter(isSettled), [txns])
  const depositYear = settled.filter((t) => t.direction === 'in' && t.created_at >= yearAgo)
  const sendYear = settled.filter((t) => t.direction === 'out' && t.created_at >= yearAgo)

  const primaryCurrency = balances.USDB !== undefined ? 'USDB' : balances.USD !== undefined ? 'USD' : balances.EUR !== undefined ? 'EUR' : 'USDB'
  const totalBalance = money(balances[primaryCurrency] ?? 0, primaryCurrency)

  const chip = useMemo(() => {
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${now.getMonth()}`
    const prevMonth = `${now.getFullYear()}-${now.getMonth() - 1}`
    const [cur, prev] = [thisMonth, prevMonth].map((k) =>
      settled
        .filter((t) => {
          const d = new Date(t.created_at)
          return t.direction === 'in' && `${d.getFullYear()}-${d.getMonth()}` === k
        })
        .reduce((a, t) => a + t.amount_minor, 0),
    )
    if (cur > 0 && prev > 0) {
      const pct = Math.round(((cur - prev) / prev) * 100)
      return `${pct >= 0 ? '+' : ''}${pct}%`
    }
    return null
  }, [settled])

  const q = query.trim().toLowerCase()
  const visible = txns.filter((t) => {
    if (typeFilter !== 'all' && t.direction !== typeFilter) return false
    if (!q) return true
    return (
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    )
  }).slice(0, 8)

  const openKyc = () => navigate('/kyc')

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="h-9 w-9 animate-pulse rounded-full bg-[#9FE870]/30" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <AppRail active="home" />

      <div className="md:pl-[72px]">
        <header className="flex items-center gap-4 px-5 py-5 md:px-8">
          <Logo variant="light" />
          <div className="ml-auto flex items-center gap-3">
            <div className="relative hidden sm:block">
              <svg viewBox="0 0 24 24" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <circle cx={11} cy={11} r={7} />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search activity"
                className="h-11 w-56 rounded-full border border-line bg-paper pl-10 pr-4 text-sm text-ink outline-none placeholder:text-muted focus:border-lime/60 lg:w-80"
              />
            </div>
            <button
              onClick={() => navigate('/send')}
              className="flex h-11 items-center gap-2 rounded-full bg-lime px-4 text-sm font-bold text-on-lime transition-opacity hover:opacity-90"
            >
              <I d={ICONS.outArrow} className="h-4 w-4" />
              Send
            </button>
            {avatar && (
              <img src={avatar} referrerPolicy="no-referrer" alt="" className="h-11 w-11 rounded-full border border-line object-cover" />
            )}
            <button
              onClick={() => void supabase.auth.signOut()}
              className="hidden h-10 items-center rounded-xl border-[1.5px] border-line px-4 text-sm font-semibold text-muted transition-colors hover:bg-fog md:flex"
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 px-5 pb-10 md:px-8 lg:grid-cols-[1fr_400px] xl:gap-5">
          <main className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="flex flex-wrap items-center gap-3 text-4xl font-semibold tracking-tight text-ink md:text-5xl">
                  {profile ? `Hi ${fullName.split(' ')[0]}` : 'Activity'}
                  {chip && (
                    <span className="rounded-full bg-lime px-2.5 py-1 text-xs font-bold text-on-lime">
                      incoming vs last month {chip}
                    </span>
                  )}
                </h1>
                <p className="mt-1.5 text-sm text-muted">
                  Track and manage your financial activity at a glance
                </p>
              </div>
            </div>

            {profile && <KycStrip kyc={profile.kyc_status} onOpenKyc={openKyc} />}

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                title="Total balance"
                value={totalBalance}
                sub={
                  Object.entries(balances).length === 0
                    ? 'No settled money yet'
                    : Object.keys(balances).filter((c) => c !== primaryCurrency).join(' · ') || primaryCurrency
                }
                icon={<I d={ICONS.bank} className="h-4 w-4" />}
              />
              <StatCard
                title="Add money"
                value={'$' + depositYear.reduce((a, t) => a + toMajor(t.amount_minor, t.currency), 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                sub="Received in the past 12 months"
                icon={<I d={ICONS.inArrow} className="h-4 w-4" />}
              />
              <StatCard
                title="Send money"
                value={'$' + sendYear.reduce((a, t) => a + toMajor(t.amount_minor, t.currency), 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                sub="Sent in the past 12 months"
                icon={<I d={ICONS.outArrow} className="h-4 w-4" />}
              />
            </div>

            <Cashflow transactions={txns} />

            <History
              visible={visible}
              hasAny={txns.length > 0}
              query={query}
              onQuery={setQuery}
              typeFilter={typeFilter}
              onTypeFilter={setTypeFilter}
            />
          </main>

          <aside className="min-w-0">
            <AccountDetails
              accounts={accounts}
              kyc={profile?.kyc_status ?? null}
              showDetails={showDetails}
              onToggle={() => setShowDetails(!showDetails)}
              onOpenKyc={openKyc}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}
