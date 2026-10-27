/*
  features/landing — public home page.
  Dark forest hero glow fading into paper, centered headline + glass CTA,
  then a 4-up isometric feature grid in brand colors. Copy comes from
  constants/site.ts; shape SVGs from ./components/IsoShapes.
*/

import type { Session } from '@supabase/supabase-js'
import { Link, useNavigate } from 'react-router-dom'
import { LANDING_FEATURES, NAV_LINKS } from '../../constants/site'
import { SHAPES } from './components/IsoShapes'
import { Footer } from '../../components/Footer'
import { Logo } from '../../components/Logo'

export function Landing({ session }: { session: Session | null }) {
  const navigate = useNavigate()

  const goAuth = (mode: 'login' | 'signup') =>
    navigate(session ? '/app' : mode === 'login' ? '/login' : '/signup')

  return (
    <main className="page-enter min-h-screen bg-[#FDFDFC]">
      <section id="top" className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(85% 62% at 50% -12%, #071700 0%, #102702 32%, rgba(22,51,0,0) 72%)',
              'radial-gradient(55% 42% at 10% 6%, rgba(91,138,30,0.55) 0%, rgba(91,138,30,0) 70%)',
              'radial-gradient(55% 42% at 90% 6%, rgba(91,138,30,0.50) 0%, rgba(91,138,30,0) 70%)',
              'linear-gradient(180deg, #0B1F00 0%, #16400D 30%, #4A7023 62%, #DDEBC8 88%, #FDFDFC 100%)',
            ].join(', '),
          }}
        />

        <header className="relative mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-6 py-7">
          <div className="justify-self-start">
            <Logo variant="light" />
          </div>
          <nav className="hidden items-center gap-8 justify-self-center md:flex">
            {NAV_LINKS.map((link) =>
              link.to.startsWith('#') ? (
                <a
                  key={link.label}
                  href={link.to}
                  className="text-sm font-semibold text-[#E9F5DF]/85 transition-colors hover:text-[#E9F5DF]"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  to={link.to}
                  className="text-sm font-semibold text-[#E9F5DF]/85 transition-colors hover:text-[#E9F5DF]"
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>
          <div className="flex items-center gap-2.5 justify-self-end">
            <button
              onClick={() => goAuth('login')}
              className="h-10 rounded-full border border-white/15 bg-[#071700]/60 px-5 text-sm font-semibold text-[#E9F5DF] backdrop-blur transition-colors hover:bg-[#071700]/80"
            >
              Sign in
            </button>
            <button
              onClick={() => goAuth('signup')}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-lime px-5 text-sm font-bold text-[#163300] transition-opacity hover:opacity-90"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx={12} cy={8} r={4} />
                <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
              </svg>
              Sign up
            </button>
          </div>
        </header>

        <div className="relative mx-auto max-w-4xl px-6 pb-24 pt-14 text-center md:pt-20">
          <span aria-hidden className="absolute right-[6%] top-[38%] text-xl text-[#9FE870]/90">✦</span>
          <span aria-hidden className="absolute left-[9%] top-[64%] text-lg text-[#163300]/40">✦</span>
          <span aria-hidden className="absolute left-[16%] top-[22%] text-sm text-[#E9F5DF]/60">+</span>
          <span aria-hidden className="absolute bottom-[6%] left-[30%] text-sm text-[#163300]/30">+</span>

          <h1 className="mx-auto max-w-3xl text-5xl font-extrabold leading-[1.06] tracking-tight text-[#F4FAEB] md:text-[68px]">
            Real accounts, real railroads.
            <br />
            Straight to your wallet.
          </h1>
          <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-[#C9E3AE] md:text-lg">
            One sign-in, one identity check — then collect US and EU
            payments through bank-grade accounts built for you.
          </p>

          <div className="mt-9 flex justify-center">
            <button
              onClick={() => goAuth('signup')}
              className="h-12 rounded-full border border-white/30 bg-white/15 px-9 text-base font-semibold text-[#F4FAEB] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/25"
            >
              Get Started
            </button>
          </div>

          <div className="mx-auto mt-20 flex max-w-2xl flex-wrap justify-center gap-x-10 gap-y-3 pb-4 text-[15px] font-medium text-[#2E4214] md:justify-between">
            {[
              ['2 min', 'to open an account'],
              ['<60s', 'identity check'],
              ['US + EU', 'bank rails, one account'],
            ].map(([v, l]) => (
              <span key={l}>
                <b className="font-extrabold text-[#163300]">{v}</b>{' '}
                <span className="font-semibold">{l}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="bg-[#FDFDFC]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-y-14 px-6 py-20 sm:grid-cols-2 md:py-24 lg:grid-cols-4 lg:gap-x-0 lg:divide-x lg:divide-[#E6EAE4]">
          {LANDING_FEATURES.map((feature, i) => {
            const Shape = SHAPES[i % SHAPES.length]
            return (
              <article key={feature.id} className="group flex flex-col px-2 sm:px-6 lg:first:pl-8">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#45553B]">
                  F&amp;L {feature.id}
                </p>
                <div className="flex h-52 items-center justify-center transition-transform duration-200 group-hover:-translate-y-1">
                  <Shape />
                </div>
                <h3 className="text-[15px] font-bold leading-snug text-[#163300]">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#45553B]">{feature.body}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="bg-[#FDFDFC]">
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-4 text-center">
          <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-lime" />
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#163300] md:text-4xl">
            Your money, moving.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#45553B]">
            Open your F&amp;L account today — free sign-up, transparent fees,
            zero branch visits.
          </p>
          <button
            onClick={() => goAuth('signup')}
            className="mt-7 inline-flex h-12 items-center rounded-xl bg-lime px-8 text-base font-bold text-[#163300] transition-all hover:-translate-y-0.5 hover:opacity-90"
          >
            Get started
          </button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
