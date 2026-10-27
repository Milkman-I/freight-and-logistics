/* ============================================================
   F&L types — money (src/types/money.ts)
   Mirrors public.money_accounts / transactions / balances and the
   DB check constraints (receive-only domains: no wallet kinds,
   no USDB, no legacy rails).
   ============================================================ */

export type Currency = 'USD' | 'EUR'

export type Rail = 'ach_push' | 'wire' | 'fednow' | 'sepa' | 'base'

export type AccountKind = 'us_checking' | 'eur_iban'

export type MoneyAccountRow = {
  id: string
  user_id: string
  kind: AccountKind
  currency: Currency
  routing_number: string | null
  account_number: string | null
  iban: string | null
  bank_name: string | null
  beneficiary_name: string | null
  wallet_address: string | null
  rails: string[]
  status: 'pending' | 'active' | 'failed'
  bridge_account_id: string | null
  created_at: string
}

export type TransactionStatus =
  | 'awaiting_funds'
  | 'funds_arriving'
  | 'pending'
  | 'funds_received'
  | 'settled'
  | 'failed'

export type TransactionRow = {
  id: string
  user_id: string
  direction: 'in' | 'out'
  amount_minor: number
  currency: Currency
  rail: Rail | null
  status: TransactionStatus
  description: string
  counterparty: string
  category: string
  created_at: string
}

export type BalanceRow = {
  user_id: string
  currency: Currency
  balance_minor: number
}
