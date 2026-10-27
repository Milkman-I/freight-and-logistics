/* ============================================================
   F&L constants — site content (src/constants/site.ts)
   All marketing copy lives here so pages stay lean.
   ============================================================ */

export const NAV_LINKS = [
  { label: 'Home', to: '#top' },
  { label: 'Features', to: '#features' },
  { label: 'Send money', to: '/send' },
  { label: 'Invoices', to: '/invoices' },
]

export const HERO_STATS = [
  { value: '2 min', label: 'to open an account' },
  { value: '<60s', label: 'identity check' },
  { value: '80+', label: 'countries to send money' },
]

export const LANDING_FEATURES = [
  {
    id: '01',
    title: 'Sign in once, verified in seconds',
    body: 'One frictionless identity check — no paperwork, no branch visits. Verified a single time, unlocked for good.',
  },
  {
    id: '02',
    title: 'Real accounts, wired to every rail',
    body: 'Dedicated US routing numbers and European IBANs in your name. Collect on ACH, FedNow, Wire, and SEPA — automatically routed.',
  },
  {
    id: '03',
    title: 'Custody that earns while it waits',
    body: 'Your balance sits 1:1 in asset-backed stablecoins on Base, compounding daily with instant liquidity and zero lockups.',
  },
  {
    id: '04',
    title: 'Payouts that loop the globe',
    body: 'Send money to 80+ countries in seconds at mid-market rates. No SWIFT queues, no hidden markups — just your money, moving.',
  },
] as const

export const FINAL_CTA = {
  title: 'Your money, moving.',
  body: 'Open your F&L account today — free sign-up, transparent fees, zero branch visits.',
  button: 'Get started',
}

export const FOOTER_CONTENT = {
  headline: ['Start your journey', 'with us.'] as [string, string],
  info: [
    { label: 'Headquarters', lines: ['25 Roseland Ave, 2FL', 'Caldwell, NJ 07006'] },
    { label: 'Call us', lines: ['+1 (201) 737-1175'] },
    { label: 'Contact us', lines: ['mohamed@freightandlogistics.online'] },
    { label: 'Support hours', lines: ['24 / 7 · every day'] },
  ],
  navigation: [
    { label: 'Home', to: '#top' },
    { label: 'Features', to: '#features' },
    { label: 'Send money', to: '/send' },
    { label: 'Invoices', to: '/invoices' },
  ],
  resources: [
    { label: 'Terms of Service', to: '/terms' },
    { label: 'Privacy Policy', to: '/privacy' },
  ],
  firstTransfer: {
    label: 'Your first transfer',
    body: 'Your first transfer is on us — 0% fees when you send money for the first time.',
  },
  subscribe: { label: 'Subscribe for updates', placeholder: 'Enter your email' },
  legal: { copyright: '© Copyright 2026 Freight And Logistics LLC. All rights reserved' },
}
