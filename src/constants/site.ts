/* ============================================================
   F&L constants — site content (src/constants/site.ts)
   All marketing copy lives here so pages stay lean.
   ============================================================ */

export const NAV_LINKS = [
  { label: 'Home', to: '#top' },
  { label: 'Features', to: '#features' },
]

export const HERO_STATS = [
  { value: '2 min', label: 'to open an account' },
  { value: '<60s', label: 'identity check' },
  { value: 'US + EU', label: 'bank rails, one account' },
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
    title: 'Straight to your wallet',
    body: 'Deposits auto-convert into asset-backed stablecoins on Base and land in your own wallet — self-custody from the first payment.',
  },
  {
    id: '04',
    title: 'Live the second money lands',
    body: 'Every incoming payment is mirrored to your dashboard as it settles. No statements, no waiting — your ledger, real time.',
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
  ],
  resources: [
    { label: 'Terms of Service', to: '/terms' },
    { label: 'Privacy Policy', to: '/privacy' },
  ],
  firstDeposit: {
    label: 'Your first deposit',
    body: 'Get real bank details in your name in minutes — receive US or EU payments straight to your wallet.',
  },
  subscribe: { label: 'Subscribe for updates', placeholder: 'Enter your email' },
  legal: { copyright: '© Copyright 2026 Freight And Logistics LLC. All rights reserved' },
}
