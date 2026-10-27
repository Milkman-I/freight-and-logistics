/* ============================================================
   F&L types — invoices (src/types/invoice.ts)
   Mirrors public.invoices; settlements arrive via the Bridge
   webhook (exact amount+currency match on an open invoice).
   ============================================================ */

import type { Currency } from './money'

export type InvoiceStatus = 'unpaid' | 'paid' | 'void'

export type InvoiceRow = {
  id: string
  user_id: string
  number: string
  client_name: string
  currency: Currency
  amount_minor: number
  note: string
  status: InvoiceStatus
  tx_id: string | null
  paid_at: string | null
  created_at: string
}
