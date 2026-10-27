/**
 * F&L — Bridge client. Calls the deployed Edge Functions (bridge-customer,
 * bridge-kyc-link, bridge-accounts) with the user's access token; the
 * browser never touches Bridge directly. Money-mutating writes happen
 * server-side via the Bridge webhook.
 */

import { supabase } from './supabase'
import type { MoneyAccountRow } from '../types/money'
import type { UserProfile } from '../types/user'

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function callFn<T = Record<string, unknown>>(
  name: string,
  body: unknown = {},
): Promise<T> {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) throw new Error('no_session')

  const res = await fetch(`${FN_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string; detail?: unknown }
  if (!res.ok) {
    const err = new Error(json.error ?? 'request_failed') as Error & {
      detail?: unknown
      status?: number
    }
    err.status = res.status
    err.detail = json.detail
    // operator diagnostics stay in the console — user sees only the soft copy
    if (err.detail) console.warn(`[${name}] provider detail:`, err.detail)
    throw err
  }
  return json as T
}

/** create (or resume) the user's Bridge KYC link; approval creates the customer */
export async function onboardKyc(
  profile: Pick<UserProfile, 'full_name' | 'google_email'>,
): Promise<void> {
  await callFn('bridge-customer', {
    full_name: profile.full_name || profile.google_email.split('@')[0] || 'F&L customer',
    redirect_uri: `${window.location.origin}/kyc/done`,
  })
}

/** the hosted verification URL from the user's stored kyc link */
export async function startKycUrl(): Promise<string> {
  const link = await callFn<{ redirect_url: string }>('bridge-kyc-link', {})
  if (!link.redirect_url) throw new Error('no_redirect')
  return link.redirect_url
}

/** fetch the user's kyc link state server-side and sync the profile */
export function syncKyc(): Promise<{ kyc_status?: string; customer_id?: string }> {
  return callFn('bridge-customer', {})
}

/** provision (idempotently) wallet + virtual accounts + webhook endpoint */
export function provisionAccounts(): Promise<{
  accounts: MoneyAccountRow[]
  wallet_address?: string
  webhook?: { id: string; url: string; status: string; public_key?: string | null }
}> {
  return callFn('bridge-accounts', {})
}
