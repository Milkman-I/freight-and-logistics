/**
 * F&L — Bridge client. Calls the deployed Edge Functions (bridge-customer,
 * bridge-kyc-link) with the user's access token; the browser never touches
 * Bridge directly. Money-mutating writes happen server-side via the
 * Bridge webhook.
 */

import { supabase } from './supabase'
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

export async function startKyc(
  profile: Pick<UserProfile, 'full_name' | 'google_email'>,
): Promise<string> {
  const parts = (profile.full_name || profile.google_email.split('@')[0] || '')
    .trim()
    .split(/\s+/)
  await callFn('bridge-customer', {
    first_name: parts[0] || 'F',
    last_name: parts.length > 1 ? parts[parts.length - 1] : 'L',
  })
  const link = await callFn<{ redirect_url: string }>('bridge-kyc-link', {
    redirect_uri: `${window.location.origin}/kyc/done`,
  })
  if (!link.redirect_url) throw new Error('no_redirect')
  return link.redirect_url
}
