/**
 * /login and /signup — app-card layout (reference: AMU signup).
 * Page = soft paper with a centered dark rounded container.
 * LEFT  = gradient panel: logo top-left, "Back to website" chip top-right,
 *         tagline + carousel dots at the bottom (no wave animation).
 * RIGHT = email + password form only (Google sign-in removed).
 */

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../services/supabase'
import { notify } from '../../components/Toast'
import { Logo } from '../../components/Logo'
import { CurvedArrow } from '../../components/CurvedArrow'
import emeraldMoonrise from '../../assets/emerald-moonrise.png'

const PANEL_COPY = [
  'Your money, moving.',
  'One check. Global access.',
  'Collect. Spend. Send.',
] as const

export function AuthPage({ mode }: { mode: 'signin' | 'signup' }) {
  const isSignup = mode === 'signup'
  const navigate = useNavigate()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [formLoading, setFormLoading] = useState(false)

  const [copyIndex, setCopyIndex] = useState(0)
  useEffect(() => {
    const t = window.setInterval(
      () => setCopyIndex((i) => (i + 1) % PANEL_COPY.length),
      4000,
    )
    return () => window.clearInterval(t)
  }, [])

  async function submitEmail(e: FormEvent) {
    e.preventDefault()

    if (isSignup) {
      if (!agreed) {
        notify('Please agree to the Terms & Conditions to continue.', 'error')
        return
      }
      if (password.length < 8) {
        notify('Password must be at least 8 characters.', 'error')
        return
      }
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      notify('That email doesn’t look right — check and try again.', 'error')
      return
    }

    setFormLoading(true)
    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: [firstName, lastName].filter(Boolean).join(' '),
          },
        },
      })
      if (error) notify(error.message, 'error')
      else if (data.session) {
        notify('Account created — welcome to F&L.', 'success')
        navigate('/kyc') // confirmations disabled → instant session
      } else
        notify(
          'Account created! Check your inbox for the confirmation email, then log in.',
          'success',
        )
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) notify(mapAuthError(error.message), 'error')
    }
    setFormLoading(false)
  }

  const ctaLabel = isSignup ? 'Create account' : 'Log in'
  const alt = isSignup
    ? { text: 'Already have an account?', link: 'Log in', to: '/login' }
    : { text: 'New to F&L?', link: 'Create an account', to: '/signup' }

  return (
    <main className="page-enter flex min-h-screen bg-[#163300]">
      <aside className="relative hidden w-[42%] shrink-0 md:block lg:w-[45%]">
        <img
          src={emeraldMoonrise}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0E1B0440] via-transparent to-[#0E1B0466]" />

          <div className="absolute left-7 top-7 z-10">
            <Logo variant="light" />
          </div>

          <button
            onClick={() => navigate('/')}
            className="group absolute right-6 top-7 z-10 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[13px] font-semibold text-[#E9F5DF] backdrop-blur-md transition-all duration-200 hover:bg-white/20 active:scale-[0.98]"
            aria-label="Back to website"
          >
            Back to website
            <span
              className="text-lime transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden
            >
              <CurvedArrow size={15} />
            </span>
          </button>

          <div className="absolute inset-x-0 bottom-7 z-10 px-10 text-center">
            <p className="min-h-[2.6rem] text-2xl font-extrabold leading-snug tracking-tight text-[#E9F5DF]">
              {PANEL_COPY[copyIndex]}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2" role="tablist" aria-label="Panel messages">
              {PANEL_COPY.map((_, i) => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={i === copyIndex}
                  onClick={() => setCopyIndex(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === copyIndex ? 'w-7 bg-lime' : 'w-4 bg-white/25 hover:bg-white/40'
                  }`}
                  aria-label={`Show panel message ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </aside>

        <section className="flex w-full flex-col justify-center px-6 py-10 md:mx-auto md:w-auto md:max-w-xl md:px-14 lg:px-20">
          {isSignup && (
            <div className="mb-6 md:hidden">
              <Logo variant="light" size="lg" />
            </div>
          )}

          <h1 className="text-[34px] font-extrabold leading-[1.05] tracking-tight text-[#E9F5DF] md:text-4xl">
            {isSignup ? 'Create an account' : 'Log in'}
          </h1>

          <p className="mt-3 text-sm text-[#B9C9B0]">
            {alt.text}{' '}
            <button
              onClick={() => navigate(alt.to)}
              className="font-semibold text-lime underline underline-offset-4 decoration-[#9FE87066] hover:decoration-lime"
            >
              {alt.link}
            </button>
          </p>

          <form onSubmit={submitEmail} className="mt-8 space-y-4" noValidate>
            {isSignup && (
              <div className="grid grid-cols-2 gap-4">
                <AuthInput
                  label="First name"
                  placeholder="First"
                  value={firstName}
                  onChange={setFirstName}
                  autoComplete="given-name"
                />
                <AuthInput
                  label="Last name"
                  placeholder="Last"
                  value={lastName}
                  onChange={setLastName}
                  autoComplete="family-name"
                />
              </div>
            )}

            <AuthInput
              label="Email"
              placeholder="you@company.com"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />

            <AuthInput
              label={isSignup ? 'Create password' : 'Password'}
              placeholder={isSignup ? '8+ characters' : 'Your password'}
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              onToggleVisibility={() => setShowPassword((s) => !s)}
              reveal={showPassword}
            />

            {isSignup && (
              <label className="flex cursor-pointer items-center gap-2.5 pt-1 text-[13px] text-[#B9C9B0]">
                <span
                  onClick={(e) => {
                    e.preventDefault()
                    setAgreed((a) => !a)
                  }}
                  className={`grid h-5 w-5 place-items-center rounded-md border-2 transition-colors ${
                    agreed
                      ? 'border-lime bg-lime text-[#163300]'
                      : 'border-[#33461F] bg-transparent'
                  }`}
                  aria-checked={agreed}
                  role="checkbox"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault()
                      setAgreed((a) => !a)
                    }
                  }}
                >
                  {agreed && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M2 6.2 4.6 9 10 3.4" stroke="#163300" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span onClick={(e) => e.preventDefault()}>
                  I agree to the{' '}
                  <span className="font-semibold text-[#E9F5DF] underline underline-offset-2">Terms &amp; Conditions</span>
                </span>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="sr-only" tabIndex={-1} />
              </label>
            )}

            <button
              type="submit"
              disabled={formLoading}
              className="!mt-6 h-12 w-full rounded-xl bg-lime text-base font-bold text-on-lime transition-all duration-150 hover:opacity-90 active:opacity-80 disabled:opacity-50"
            >
              {formLoading ? 'Working…' : ctaLabel}
            </button>
          </form>

          <p className="mt-6 text-[11.5px] leading-relaxed text-[#8FA385]">
            By continuing you agree to the F&L Terms of Use and acknowledge the
            Privacy Policy. Identity verification is required before money
            features unlock.
          </p>
        </section>
    </main>
  )
}

function AuthInput({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  autoComplete,
  onToggleVisibility,
  reveal,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  onToggleVisibility?: () => void
  reveal?: boolean
}) {
  const isPassword = type === 'password'
  const shown = isPassword && reveal ? 'text' : type
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <span className="relative block">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={shown}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="h-12 w-full rounded-xl border border-[#33461F] bg-[#1A2E0E] px-4 text-[15px] text-[#E9F5DF] placeholder-[#7E9175] outline-none transition-all duration-150 focus:border-lime focus:ring-[3px] focus:ring-[#9FE87033]"
        />
        {isPassword && onToggleVisibility && (
          <button
            type="button"
            onClick={onToggleVisibility}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8FA385] transition-colors hover:text-[#E9F5DF]"
            aria-label={reveal ? 'Hide password' : 'Show password'}
          >
            {reveal ? (
              <EyeOffIcon />
            ) : (
              <EyeIcon />
            )}
          </button>
        )}
      </span>
    </label>
  )
}

function EyeIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17.4 17.4 0 0 1-2.3 3.2M6.1 6.1A17 17 0 0 0 2 12s3.5 7 10 7a9.9 9.9 0 0 0 5.9-1.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  )
}

function mapAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg))
    return 'Email or password is incorrect. Try again or reset your password.'
  if (/email not confirmed/i.test(msg))
    return 'Confirm your email first — check your inbox for the F&L confirmation link.'
  if (/rate limit/i.test(msg))
    return 'Too many attempts. Wait a minute and try again.'
  return msg
}
