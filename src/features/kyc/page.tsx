/*
  features/kyc — /kyc, real Bridge identity verification.
  Loads sync the kyc link's live state server-side; while Bridge reviews,
  the page re-syncs every 15s; a Verify click that finds the outcome
  already settled refreshes in place instead of reopening Persona.
  Bridge's own terms of service must be accepted before approval — the
  page surfaces that as step 1 (opens tos_link) and Persona as step 2.
  Once verified, accounts are NOT auto-provisioned: the setup card asks
  the user for their Base wallet — the only place deposits may sweep —
  and only then calls provisioning with that destination.
  Actual KYC/data writes happen service-side via the Bridge webhook.
*/

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { fetchProfile } from '../../services/profiles'
import { getAccounts } from '../../services/money'
import { onboardKyc, startKycUrl, syncKyc, provisionAccounts } from '../../services/bridge'
import { notify } from '../../components/Toast'
import type { UserProfile } from '../../types/user'
import type { MoneyAccountRow } from '../../types/money'
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
  const [accounts, setAccounts] = useState<MoneyAccountRow[]>([])
  const [tos, setTos] = useState<{ link: string | null; status: string | null }>({ link: null, status: null })
  const [customAddress, setCustomAddress] = useState('')
  const [setupBusy, setSetupBusy] = useState(false)
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
        const sync = await syncKyc().catch(() => null)
        // Bridge's provider-side TOS acceptance is a prerequisite for
        // approval — track it so the page can surface it as step 1.
        setTos({ link: sync?.tos_link ?? null, status: sync?.tos_status ?? null })
        p = await fetchProfile(user.id)
      } else {
        // Accounts are NOT auto-provisioned: the user chooses the deposit
        // destination first (the setup card below). Read-only here.
        setAccounts(await getAccounts(false))
        if (p.deposit_destination) setCustomAddress(p.deposit_destination)
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

  useEffect(() => {
    if (profile?.kyc_status !== 'under_review') return
    const t = setInterval(() => void load(), 15000)
    return () => clearInterval(t)
  }, [profile?.kyc_status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onVerify() {
    if (!profile) return
    setBusy(true)
    try {
      const link = await onboardKyc(profile)
      if (link.kyc_status === 'approved' || link.kyc_status === 'rejected') {
        await load()
        notify(
          link.kyc_status === 'approved'
            ? "You're verified — every money feature is unlocked."
            : 'Verification was declined — contact support if this looks wrong.',
          link.kyc_status === 'approved' ? 'success' : 'error',
        )
        setBusy(false)
        return
      }
      const url = link.redirect_url ?? (await startKycUrl())
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
  const needsSetup = done && accounts.length === 0

  async function onSetup() {
    if (!customAddress.trim()) {
      notify('Enter your wallet address to open your accounts.', 'error')
      return
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(customAddress.trim())) {
      notify('That wallet address doesn’t look right — Base addresses start with 0x and have 40 hex characters.', 'error')
      return
    }
    setSetupBusy(true)
    try {
      await provisionAccounts(customAddress.trim())
      await load()
      notify('Your accounts are ready — bank details are on the dashboard.', 'success')
    } catch (e) {
      const slug = e instanceof Error ? e.message : 'request_failed'
      if (slug === 'deposit_destination_invalid' || slug === 'deposit_destination_required') {
        notify('That wallet address doesn’t look right — Base addresses start with 0x and have 40 hex characters.', 'error')
      } else if (slug === 'destination_locked') {
        notify('Your accounts already exist with a different destination — contact support to replace them.', 'error')
      } else if (slug === 'kyc_not_approved') {
        notify('Your verification status just changed — reload and try again.', 'error')
      } else {
        notify('Could not set up your accounts. Please try again.', 'error')
      }
    } finally {
      setSetupBusy(false)
    }
  }

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
              {needsSetup
                ? 'One last step: enter the wallet where your incoming deposits should land.'
                : 'Your account is active and all money features are unlocked.'}
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
              One check unlocks real bank details in your name and
              global payment rails — no paperwork, no branch visits.
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

        {!done && tos.link && tos.status !== 'approved' && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-[#F0DFA0] bg-[#FFF8E5] px-4 py-3">
            <p className="min-w-48 flex-1 text-sm leading-snug text-[#5A4500]">
              <b>Step 1:</b> Accept the terms of our payments provider — verification
              can&apos;t finish without it. Then come back and verify.
            </p>
            <a
              href={tos.link}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border-[1.5px] border-[#C4CCB4] bg-white px-4 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-fog"
            >
              Open and accept ↗
            </a>
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
          {((done && !needsSetup) || kyc === 'rejected') && (
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

        {done && needsSetup && (
          <div className="mt-7 rounded-2xl border border-line bg-fog p-5 md:p-6">
            <p className="text-base font-extrabold text-ink">
              Where should your deposits land?
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Money sent to your new bank details (ACH, FedNow, Wire, SEPA) is converted
              into stablecoins and swept to your Base wallet. Enter your wallet address —
              this choice is permanent once your accounts exist.
            </p>

            <label className="mt-4 block rounded-xl border border-line bg-white p-4">
              <span className="block text-sm font-bold text-ink">Your wallet address</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-muted">
                A Base network address (starts with 0x, 40 hex characters). Deposits sweep
                straight to it — self-custody from day one: that money is yours at once,
                but it will not appear as in-app balance; send it out from your own wallet.
              </span>
              <input
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                className="mt-3 h-11 w-full rounded-xl border-[1.5px] border-[#C4CCB4] bg-white px-4 text-sm text-ink placeholder:text-muted/60 focus:border-moss focus:outline-none"
              />
            </label>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <button
                onClick={() => void onSetup()}
                disabled={setupBusy || customAddress.trim() === ''}
                className="h-12 rounded-xl bg-lime px-7 text-base font-bold text-on-lime transition-transform hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {setupBusy ? 'Setting up…' : 'Open my accounts →'}
              </button>
              <p className="text-sm text-muted">
                You&apos;ll get a US routing number and a European IBAN in your name.
              </p>
            </div>
          </div>
        )}

        {!done && <KycSteps />}
      </article>
      </div>
    </main>
  )
}
