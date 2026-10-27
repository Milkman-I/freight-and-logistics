/*
  AppRail — the fixed left icon nav shared by every signed-in page
  (dashboard, /kyc). Light buttons = dark theme, and vice versa.
  Only functional destinations; profile-aware KYC badge.
*/

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { fetchProfile } from '../services/profiles'
import type { UserProfile } from '../types/user'
import { I, ICONS } from './icons'

function RailButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={
        'flex h-11 w-11 items-center justify-center rounded-xl border transition-colors ' +
        (active
          ? 'border-lime/50 bg-lime/15 shadow-[0_0_18px_rgba(159,232,112,0.25)] text-lime'
          : 'border-transparent bg-fog text-muted hover:border-line hover:text-ink')
      }
    >
      {children}
    </button>
  )
}

export function AppRail({ active }: { active: 'home' | 'kyc' | 'history' | 'accounts' }) {
  const navigate = useNavigate()
  const [kyc, setKyc] = useState<UserProfile['kyc_status'] | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    (localStorage.getItem('fl-theme') as 'light' | 'dark') ?? 'light',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('fl-theme', theme)
  }, [theme])

  useEffect(() => {
    void supabase.auth
      .getUser()
      .then(({ data: { user } }) => (user ? fetchProfile(user.id).then(setProfile) : null))
      .catch(() => null)
    function setProfile(p: UserProfile | null) {
      if (p) setKyc(p.kyc_status)
    }
  }, [])

  const verified = kyc === 'approved'
  const toId = (id: string) => navigate(`/app#${id}`)

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden flex-col items-center gap-2 bg-paper py-6 md:flex md:w-[72px]">
      <button aria-label="F&L home" onClick={() => navigate('/app')} className="mb-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime text-lg font-black text-on-lime">
          F
        </span>
      </button>

      <RailButton label="Home" active={active === 'home'} onClick={() => navigate('/app')}>
        <I d={ICONS.home} />
      </RailButton>
      <RailButton label="Transaction history" active={active === 'history'} onClick={() => toId('history')}>
        <I d={ICONS.list} />
      </RailButton>
      <RailButton label="Account details" active={active === 'accounts'} onClick={() => toId('accounts')}>
        <I d={ICONS.doc} />
      </RailButton>

      {!verified ? (
        <RailButton label="Verify identity" active={active === 'kyc'} onClick={() => navigate('/kyc')}>
          <span className="relative">
            <I d={ICONS.userCheck} />
            {kyc !== null && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-lime" />
            )}
          </span>
        </RailButton>
      ) : (
        <RailButton label="Verification status" active={active === 'kyc'} onClick={() => navigate('/kyc')}>
          <I d={ICONS.shieldCheck} />
        </RailButton>
      )}

      <div className="mt-auto flex flex-col items-center gap-2">
        <RailButton
          label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20.5 14.6A8.2 8.2 0 0 1 9.4 3.5a8.2 8.2 0 1 0 11.1 11.1Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx={12} cy={12} r={4} />
              <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" />
            </svg>
          )}
        </RailButton>
        <RailButton label="Sign out" onClick={() => void supabase.auth.signOut()}>
          <I d={ICONS.signOut} />
        </RailButton>
      </div>
    </aside>
  )
}
