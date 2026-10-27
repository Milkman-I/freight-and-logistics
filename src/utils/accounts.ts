/* ============================================================
   F&L utils — accounts (src/utils/accounts.ts)
   Account naming + rail display labels (shared by dashboard
   and send surfaces).
   ============================================================ */

import type { MoneyAccountRow, Rail } from '../types/money'

export function accountName(a: MoneyAccountRow): string {
  if (a.kind === 'us_checking') return 'US Checking'
  if (a.kind === 'eur_iban') return 'European IBAN'
  return 'Custodial Wallet'
}

export const RAIL_LABEL: Record<Rail, string> = {
  ach: 'US bank · ACH',
  fednow: 'US bank · FedNow',
  wire: 'US bank · Wire',
  sepa: 'European bank · SEPA',
  base: 'Wallet · Base',
}
