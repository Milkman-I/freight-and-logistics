/*
  features/kyc — /kyc, real Bridge identity verification.
  States follow DS §5.5; actual KYC/data writes happen
  service-side via the Bridge webhook.
*/

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { fetchProfile } from '../../services/profiles'
import { onboardKyc, startKycUrl, syncKyc, provisionAccounts } from '../../services/bridge'
import { notify } from '../../components/Toast'
import type { UserProfile } from '../../types/user'
import { AppRail } from '../../components/AppRail'
import { Logo } from '../../components/Logo'
import { KycSteps, Pill } from './components/KycSteps'

const PILL: Record<UserProfile['kyc_status'], { cls: string; label: string }> = {
  not_started: { cls: 'bg-fog text-ink', label: 'Not started' },
  incomplete: { cls: 'bg-[#FFE9B8] text-[#8A5A00]', label: 'Incomplete — finish your details' },
  under_review: { cls: 'bg-[#FFE9B8] text-[#8A5A00]', label: 'KYC pending review' },
  approved: { cls: 'bg-[#D6F5C0] text-[#2E5B12]', label: 'Verified' },
  rejected: { cls: 'bg-[#FDD9D7] text-[#9B1C12]', label: 'Verification failed' },
}

export function KycPage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      navigate('/login', { replace: true })
      return
    }
    try {
      let p = await fetchProfile(user.id)
      if (p.kyc_status !== 'approved') {
        // pull the kyc link's live state server-side, then read the synced row
        await syncKyc().catch(() => null)
        p = await fetchProfile(user.id)
      } else {
        // approved: make sure wallet + virtual accounts exist (idempotent)
        void provisionAccounts().catch(() => null)
      }
      setProfile(p)
      setLoadFailed(false)
    } catch {
      setProfile(null)
      setLoadFailed(true)
    }
  }

  useEffect(() => {
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function onVerify() {
    if (!profile) return
    setBusy(true)
    try {
      // onboard reopens the user's one and only kyc link (self-healing);
      // fall back to the stored link's URL when the response omits one
      const url = (await onboardKyc(profile)) ?? (await startKycUrl())
      window.location.assign(url)
    } catch (e) {
      const slug = e instanceof Error ? e.message : 'request_failed'
      if (slug === 'bridge_not_configured') {
        notify('Our payments provider is switching on right now — check back shortly.', 'error')
      } else if (slug === 'bridge_error') {
        notify("Verification is temporarily unavailable — we're on it. Please try again shortly.", 'error')
      } else if (slug === 'no_customer_yet') {
        notify('Finishing your profile setup — try again in a moment.', 'error')
      } else if (slug === 'no_session') {
        notify('Your session expired — sign in again.', 'error')
      } else {
        notify('Could not start verification. Please try again.', 'error')
      }
      setBusy(false)
    }
  }

  const kyc = profile?.kyc_status ?? 'not_started'
  const done = kyc === 'approved'

  return (
    <main className="page-enter min-h-screen bg-paper">
      <AppRail active="kyc" />
      <div className="md:pl-[72px]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <button onClick={() => navigate('/app')} aria-label="Back to dashboard">
          <Logo />
        </button>
        <button
          onClick={() => void supabase.auth.signOut()}
          className="h-10 rounded-xl border-[1.5px] border-[#C4CCB4] px-4 text-sm font-semibold text-ink transition-colors hover:bg-fog"
        >
          Sign out
        </button>
      </header>

      <article className="mx-auto max-w-2xl px-6 pb-24 pt-10 md:pt-14">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-moss">
          Identity verification
        </p>

        {done ? (
          <>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
              You're verified ✓
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Your account is active and all money features are unlocked.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
              Verify once.{' '}
              <span className="relative inline-block">
                Money for good.
                <span className="absolute -bottom-1 left-0 h-3 w-full rounded bg-lime opacity-70" aria-hidden />
              </span>
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted">
              One check unlocks real bank details, custody, and global payouts —
              no paperwork, no branch visits.
            </p>
          </>
        )}

        <div className="mt-6 flex items-center gap-3">
          <Pill cls={PILL[kyc].cls}>{PILL[kyc].label}</Pill>
        </div>

        {loadFailed && !profile && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-fog px-4 py-3 text-sm text-muted">
            Couldn&apos;t load your profile.
            <button
              onClick={() => void load()}
              className="font-bold text-moss underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-4">
          {!done && kyc !== 'rejected' && (
            <button
              onClick={() => void onVerify()}
              disabled={busy || !profile}
              className="h-12 rounded-xl bg-lime px-7 text-base font-bold text-on-lime transition-transform hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? 'Opening verification…'
                : kyc === 'under_review'
                  ? 'Resume verification'
                  : kyc === 'incomplete'
                    ? 'Complete verification'
                    : 'Verify identity →'}
            </button>
          )}
          {(done || kyc === 'rejected') && (
            <button
              onClick={() => navigate('/app')}
              className="h-12 rounded-xl bg-lime px-7 text-base font-bold text-on-lime transition-transform hover:-translate-y-0.5"
            >
              Go to dashboard
            </button>
          )}
          {kyc === 'under_review' && (
            <p className="text-sm text-muted">
              Usually clears within a minute — the page updates when you check back.
            </p>
          )}
        </div>

        {!done && <KycSteps />}
      </article>
      </div>
    </main>
  )
}
