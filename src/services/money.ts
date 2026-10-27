/* ============================================================
   F&L services — money (src/services/money.ts)
   money_accounts · transactions · balances reads (RLS: select-own).
   ============================================================ */

import { supabase } from './supabase'
import type { BalanceRow, MoneyAccountRow, TransactionRow } from '../types/money'

export type DashboardMoney = {
  accounts: MoneyAccountRow[]
  transactions: TransactionRow[]

  balanceMap: Record<string, number>
}

export async function getAccounts(onlyActive = true): Promise<MoneyAccountRow[]> {
  let q = supabase.from('money_accounts').select('*')
  if (onlyActive) q = q.eq('status', 'active')
  const { data } = await q.order('created_at')
  return (data ?? []) as MoneyAccountRow[]
}

export async function getTransactions(limit = 200): Promise<TransactionRow[]> {
  const { data } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as TransactionRow[]
}

export async function getBalances(): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('balances')
    .select('currency,balance_minor')
  const rows = (data ?? []) as BalanceRow[]
  return Object.fromEntries(rows.map((b) => [b.currency, b.balance_minor]))
}

export async function fetchDashboardMoney(): Promise<DashboardMoney> {
  const [accounts, transactions, balanceMap] = await Promise.all([
    getAccounts(false),
    getTransactions(),
    getBalances(),
  ])
  return { accounts, transactions, balanceMap }
}
