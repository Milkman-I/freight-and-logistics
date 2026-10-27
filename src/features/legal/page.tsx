/*
  features/legal — /terms and /privacy. Shared light-token layout;
  document copy lives in constants/legal.ts.
*/

import { Link } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { Footer } from '../../components/Footer'
import { TERMS, PRIVACY } from '../../constants/legal'

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const doc = kind === 'terms' ? TERMS : PRIVACY

  return (
    <main className="page-enter min-h-screen bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" aria-label="F&L home">
          <Logo />
        </Link>
        <Link
          to="/"
          className="h-10 rounded-xl border-[1.5px] border-[#C4CCB4] px-4 text-sm font-semibold leading-10 text-ink transition-colors hover:bg-fog"
        >
          ← Back to home
        </Link>
      </header>

      <article className="mx-auto max-w-3xl px-6 pb-24 pt-10 md:pt-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-moss">
          Legal · F&amp;L
        </p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
          {doc.title}
        </h1>
        <p className="mt-3 text-sm text-muted">Last updated: {doc.updated}</p>

        <div className="mt-10 space-y-10">
          {doc.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold tracking-tight text-ink">
                {section.title}
              </h2>
              {section.body.map((para, i) => (
                <p key={i} className="mt-3 text-[15px] leading-relaxed text-muted">
                  {para}
                </p>
              ))}
            </section>
          ))}
        </div>

        <p className="mt-14 rounded-2xl border border-line bg-fog p-5 text-xs leading-relaxed text-muted">
          This document is provided as a functional starting point and is not
          legal advice. Have it reviewed by qualified counsel in your
          jurisdiction before publishing it as your binding agreement.
        </p>
      </article>

      <Footer />
    </main>
  )
}
