/**
 * F&L — Bridge client. Calls the deployed Edge Functions (bridge-customer,
 * bridge-kyc-link, bridge-accounts) with the user's access token; the
 * browser never touches Bridge directly. KYC link onboarding reopens the
 * user's one link per email (self-healing server-side) and carries
 * redirect_url on every success. Money-mutating writes happen server-side
 * via the Bridge webhook.
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
    if (err.detail) console.warn(`[${name}] provider detail:`, err.detail)
    throw err
  }
  return json as T
}

export function onboardKyc(
  profile: Pick<UserProfile, 'full_name' | 'email'>,
): Promise<{
  kyc_status?: string
  redirect_url?: string
  tos_link?: string
  tos_status?: string
}> {
  return callFn('bridge-customer', {
    full_name: profile.full_name || profile.email.split('@')[0] || 'F&L customer',
    redirect_uri: `${window.location.origin}/kyc/done`,
  })
}

export async function startKycUrl(): Promise<string> {
  const link = await callFn<{ redirect_url: string }>('bridge-kyc-link', {})
  if (!link.redirect_url) throw new Error('no_redirect')
  return link.redirect_url
}

export function syncKyc(): Promise<{
  kyc_status?: string
  customer_id?: string
  redirect_url?: string
  tos_link?: string
  tos_status?: string
}> {
  return callFn('bridge-customer', {})
}

/** provision (idempotently) the user's virtual accounts + webhook endpoint;
 * `depositDestination` (the user's own wallet) is required unless a
 * previous call already stored one server-side */
export function provisionAccounts(depositDestination: string): Promise<{
  accounts: MoneyAccountRow[]
  deposit_destination?: string | null
  notes?: string[]
  webhook?: { id: string; url: string; status: string; public_key?: string | null }
}> {
  return callFn('bridge-accounts', {
    ...(depositDestination ? { deposit_destination: depositDestination } : {}),
  })
}
