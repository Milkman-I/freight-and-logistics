/* ============================================================
   F&L services — transfers (src/services/transfers.ts)
   Client-side outgoing transfer initiation. Only direction='out',
   status='pending' may be inserted by a user (RLS policy
   "transactions_insert_own_out") — the Bridge webhook takes over
   from there (pending → settled / failed).
   ============================================================ */

import { supabase } from './supabase'
import type { Currency, Rail, TransactionRow } from '../types/money'

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

export interface TransferInput {

  userId: string

  accountId: string
  rail: Rail
  currency: Currency

  amountMinor: number
  recipient: string
  note?: string
}

export async function createTransfer(
  input: TransferInput,
): Promise<TransactionRow> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: input.userId,
      account_id: input.accountId,
      direction: 'out',
      amount_minor: input.amountMinor,
      currency: input.currency,
      rail: input.rail,
      status: 'pending',
      description: input.note?.trim() || `Transfer to ${input.recipient}`,
      counterparty: input.recipient,
      category: 'send',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as TransactionRow
}

/**
 * Submit the freshly-created pending row to Bridge via the
 * `bridge-create-transfer` Edge Function (user JWT auth; authoritative
 * amount/currency come from the DB row, never the request body).
 * The row may end up 'failed' (Bridge rejected it) or move to its real
 * lifecycle — the transfer.updated webhook owns it from here on.
 */
export async function sendToBridge(
  transactionId: string,
  opts: { walletAddress?: string } = {},
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('not_signed_in')

  const res = await fetch(`${FN_BASE}/bridge-create-transfer`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ transaction_id: transactionId, ...opts }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.error ?? `bridge_transfer_failed_${res.status}`)
  }
}
