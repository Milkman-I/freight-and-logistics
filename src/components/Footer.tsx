/* ============================================================
   F&L — Footer
   Deep-forest marketing footer; fixed dark colors both themes.
   All copy lives in constants/site.ts.
   ============================================================ */

import { Link } from 'react-router-dom'
import { FOOTER_CONTENT } from '../constants/site'

const SOCIALS = [
  {
    label: 'YouTube',
    svg: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M23 12s0-3.4-.4-5a2.6 2.6 0 0 0-1.8-1.8C19 4.7 12 4.7 12 4.7s-7 0-8.8.5A2.6 2.6 0 0 0 1.4 7C1 8.6 1 12 1 12s0 3.4.4 5a2.6 2.6 0 0 0 1.8 1.8c1.8.5 8.8.5 8.8.5s7 0 8.8-.5a2.6 2.6 0 0 0 1.8-1.8c.4-1.6.4-5 .4-5Zm-13.1 3.1V8.9L15.8 12l-5.9 3.1Z" />
      </svg>
    ),
  },
  {
    label: 'X',
    svg: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M17.7 3H21l-7.3 8.3L22 21h-6.7l-5.2-6.3L4 21H.8l7.8-8.9L1.3 3h6.9l4.7 5.8L17.7 3Zm-1.2 16h1.9L6.3 4.9H4.3L16.5 19Z" />
      </svg>
    ),
  },
  {
    label: 'Instagram',
    svg: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
        <rect x={3} y={3} width={18} height={18} rx={5} />
        <circle cx={12} cy={12} r={4} />
        <circle cx={17.2} cy={6.8} r={0.6} fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: 'Facebook',
    svg: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M13.5 21v-7.2h2.5l.4-2.9h-2.9V9c0-.8.2-1.4 1.4-1.4h1.5V5c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.2H8v2.9h2.5V21h3Z" />
      </svg>
    ),
  },
] as const

function InfoCol({ label, lines }: { label: string; lines: readonly string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A9BCA0]/70">
        {label}
      </p>
      <p className="mt-2.5 leading-relaxed">
        {lines.map((line, i) => (
          <span key={i}>
            {line}
            {i < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    </div>
  )
}

function LinkCol({ label, items }: { label: string; items: readonly string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A9BCA0]/70">
        {label}
      </p>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li key={item}>
            <a href="#" className="transition-colors hover:text-[#9FE870]">
              {item}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Footer() {
  const c = FOOTER_CONTENT
  return (
    <footer className="bg-[#12260A] text-[#E9F5DF]">
      <div className="mx-auto w-full px-6 pb-10 pt-16 md:px-14 md:pt-20">
        <div className="flex flex-col gap-14 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-5xl font-semibold leading-[1.05] tracking-tight text-[#E9F5DF] md:text-6xl">
              {c.headline[0]}
              <br />
              {c.headline[1]}
            </h2>
            <div className="mt-9 flex gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href="#"
                  aria-label={s.label}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-[#33461F] transition-colors hover:border-[#9FE870]/60 hover:bg-[#1A2E0E]"
                >
                  {s.svg}
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-16 gap-y-10 text-sm sm:grid-cols-2">
            {c.info.map((col) => (
              <InfoCol key={col.label} label={col.label} lines={col.lines} />
            ))}
          </div>
        </div>

        <hr className="my-12 border-[#33461F]" />

        <div className="grid grid-cols-1 gap-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <LinkCol label="Navigation" items={c.navigation} />
          <LinkCol label="Resources" items={c.resources} />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A9BCA0]/70">
              {c.firstTransfer.label}
            </p>
            <p className="mt-4 leading-relaxed text-[#C9E3AE]">{c.firstTransfer.body}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A9BCA0]/70">
              {c.subscribe.label}
            </p>
            <form
              onSubmit={(e) => e.preventDefault()}
              className="mt-4 flex h-12 items-center rounded-full border border-[#9FE870]/50 bg-transparent pl-5 pr-1.5"
            >
              <input
                type="email"
                required
                placeholder={c.subscribe.placeholder}
                className="h-full w-full bg-transparent text-sm text-[#E9F5DF] outline-none placeholder:text-[#A9BCA0]/70"
              />
              <button
                type="submit"
                aria-label="Subscribe"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#E9F5DF] transition-colors hover:bg-[#1A2E0E] hover:text-[#9FE870]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </button>
            </form>
          </div>
        </div>

        <hr className="mb-8 mt-12 border-[#33461F]" />

        <div className="flex flex-col items-center gap-3 text-xs text-[#A9BCA0] sm:flex-row sm:justify-between">
          <Link to="/terms" className="transition-colors hover:text-[#9FE870]">Terms of Service</Link>
          <p>{c.legal.copyright}</p>
          <Link to="/privacy" className="transition-colors hover:text-[#9FE870]">Privacy Policy</Link>
        </div>
      </div>
    </footer>
  )
}
