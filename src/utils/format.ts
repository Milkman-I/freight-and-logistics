/* ============================================================
   F&L utils — formatting (src/utils/format.ts)
   Money display, date display, and lifecycle predicates.
   ============================================================ */

import type { TransactionRow } from '../types/money'

export const CURRENCY_MACRO: Record<string, number> = {
  USD: 100,
  EUR: 100,
  USDB: 1_000_000,
}

export function macroOf(currency: string): number {
  return CURRENCY_MACRO[currency] ?? 100
}

export function toMajor(minor: number, currency: string): number {
  return minor / macroOf(currency)
}

export function toMinor(major: number, currency: string): number {
  return Math.round(major * macroOf(currency))
}

export function money(minor: number, currency: string): string {
  const v = toMajor(minor, currency)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'USDB' ? 'USD' : currency,
    maximumFractionDigits: v < 1 && minor !== 0 ? 4 : 2,
    minimumFractionDigits: minor === 0 ? 2 : 0,
  })
    .format(v)
    .concat(currency === 'USDB' ? ' USDB' : '')
}

export function majorMoney(v: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'USDB' ? 'USD' : currency,
    maximumFractionDigits: 2,
  })
    .format(v)
    .concat(currency === 'USDB' ? ' USDB' : '')
}

export function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function isSettled(t: TransactionRow): boolean {
  return t.status === 'funds_received' || t.status === 'settled'
}
