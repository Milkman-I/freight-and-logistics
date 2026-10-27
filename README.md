# F&L — Web (Vite + React)

Stablecoin banking platform: email sign-in → KYC → bank accounts → wallets → transfers → invoices.

## Stack

- **Vite + React 19 + TypeScript** (SPA)
- **Tailwind v4** via `@tailwindcss/vite`
- **Design system**: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) ("Lime Voltage") — tokens live in `src/tokens.css`
- **Supabase**: Auth (email + password) + Postgres + Edge Functions
  - Project: `nkpoijxwcowyrzcmvwjw` (eu-west-2)
- **Bridge** (current api.bridge.xyz `/v0` API — `Api-Key` header auth, KYC-links onboarding, API-based webhook endpoints with RSA signature verification) — all calls happen server-side via Edge Functions; the browser never touches Bridge. Sandbox: keys starting `sk-test` auto-route to `api.sandbox.bridge.xyz`

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-checks + production build
```

`.env` (never commit; the publishable key is public info — secrets live in Edge Functions):

```
VITE_SUPABASE_URL=https://nkpoijxwcowyrzcmvwjw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

## Structure

Routes live in `src/app`, pages in `src/features` (one folder per route):

```
src/
├── app/
│   └── App.tsx                  # BrowserRouter, session state (Supabase getSession + onAuthStateChange)
├── features/
│   ├── landing/                 # "/" marketing page (+ IsoShapes)
│   ├── auth/                    # "/login", "/signup" — dual mode, public-only guard
│   ├── kyc/                     # "/kyc" hosted verification flow (+ KycSteps)
│   ├── send/                    # "/send" transfers (+ TransferForm / TransferConfirmation)
│   ├── dashboard/               # "/app" real-data shell (+ AccountDetails, Cashflow, History, KycStrip, StatCard)
│   └── legal/                   # "/terms", "/privacy"
├── services/                    # all Supabase I/O lives here
│   ├── supabase.ts              # browser client (persistSession, detectSessionInUrl)
│   ├── auth.ts                  # signInWithGoogle + useGoogleAuth
│   ├── profiles.ts              # user_profiles reads
│   ├── money.ts                 # money_accounts + transactions reads (fetchDashboardMoney)
│   ├── transfers.ts             # insert-only outgoing pending transactions
│   └── bridge.ts                # calls Edge Functions with the user's access token
├── types/                       # DB mirror types (user.ts: profile/KYC, money.ts: accounts/tx lifecycle)
├── utils/                       # format.ts (minor/major money), accounts.ts (naming, rails)
├── constants/                   # site.ts (landing copy), legal.ts (Terms/Privacy text)
├── components/                  # AppRail (signed-in nav), Logo, Footer, icons, ui.tsx primitives
├── tokens.css                   # F&L tokens (light + dark)
└── index.css                    # Tailwind v4 theme mapping of tokens
```

### Supabase backend

Edge Functions (`supabase/functions/`, deployed):

| Function | `verify_jwt` | Purpose |
|---|---|---|
| `bridge-customer` | ✅ | creates/resumes the user's Bridge **kyc link** (`POST /v0/kyc_links`, `Api-Key` header), syncs `kyc_status` + `bridge_customer_id` |
| `bridge-kyc-link` | ✅ | returns the hosted Persona verification URL for the stored kyc link |
| `bridge-accounts` | ✅ | idempotent provisioning for approved customers: Base custody wallet (USDB) → USD virtual account (ACH push/FedNow/Wire) → EUR virtual IBAN (SEPA); registers + activates the Bridge webhook endpoint and stores its RSA public key in `bridge_config` |
| `bridge-webhook` | ❌ | single receiver for all Bridge events; RSA signature verification (`X-Webhook-Signature: t=…,v0=…` against the `bridge_config` public key). New flat event schema only: `customer.*` → `kyc_status`, `kyc_link.*` → kyc + customer id, `virtual_account*` → `money_accounts`, `bridge_wallet*` → wallet row, `transfer.*` → `transactions` (upsert by `bridge_transfer_id`, settled incoming payments auto-mark matching invoices paid) |
| `bridge-create-transfer` | ✅ | submits the user's `pending` tx row as a real Bridge transfer (`destination.to_address`, `Idempotency-Key`); links `bridge_transfer_id` or flips the row to `failed` |

Database (canonical migrations now in `supabase/migrations/*` — single source of truth; never hand-apply via dashboard):

| Migration | What it creates |
|---|---|
| `20261022093423_create_user_profiles.sql` | `user_profiles` + `on_auth_user_created` trigger (`handle_new_user`) |
| `20261022093446_create_money_tables.sql` | `money_accounts`, `transactions` |
| `20261022093512_harden_rls_and_indexes.sql` | RLS policies, indexes, `guard_user_profile` trigger |
| `20261026071717_webhook_events_and_transfer_link.sql` | `webhook_events` audit table + unique `transactions.bridge_transfer_id` index |
| `20261027090000_create_invoices.sql` | `invoices` table (+sequence, 3 RLS policies, open-match index) — settled incoming Bridge payments auto-mark matching invoices paid |
| `20261027093000_add_kyc_link.sql` | `user_profiles.bridge_kyc_link_id` (KYC-link first onboarding) |
| `20261027100000_money_accounts_new_bridge.sql` | `money_accounts.bank_name` / `beneficiary_name` / `wallet_address` (current Bridge deposit-instruction data) |
| `20261027103000_bridge_config.sql` | `bridge_config` — webhook endpoint RSA public key + registration metadata (no secrets; service-role only) |

- **`user_profiles`** — `id` (= auth.users), `google_email`, `full_name`, `avatar_url`, `bridge_customer_id`, `bridge_kyc_link_id`, `kyc_status` (`not_started | under_review | incomplete | approved | rejected`). The `guard_user_profile` trigger blocks non-service updates to `kyc_status` / `bridge_customer_id` / `google_email`.

> Note: `google_email` is a legacy column name — it carries the auth email for any provider (email-based accounts included). No Google/OAuth dependency remains in the app.

- **`money_accounts`** — `kind` (`us_checking | eur_iban | wallet`), `currency` (`USD | EUR | USDB`), `routing_number` / `account_number` / `iban`, `bank_name` / `beneficiary_name` (real deposit instructions), `wallet_address` (custody address), `rails` (text[]), `status` (`pending | active | failed`), `bridge_account_id`.
- **`transactions`** — `amount_minor > 0`, `currency`, `rail` (`ach_push | fednow | wire | sepa | base`), `status` lifecycle (`awaiting_funds → funds_arriving → pending → funds_received → settled | failed`), `bridge_transfer_id`.

RLS: users can SELECT/own everything; `user_profiles` allows UPDATE own (column guard trigger); `transactions` allows INSERT only `direction='out'` and `pending | failed`. All inserts from Bridge flows happen via webhook service role, never the browser.

## What's needed for email sign-in to work

Supabase Auth → Providers: none — email + password is enabled by default. If you want instant sessions on signup (skip the confirmation email), turn off **Auth → Providers → Email → Confirm email**. With it on, users confirm then sign in; the form handles both paths.

## Phases (from the build plan)

1. ✅ **Google auth** → replaced by **email + password** (no provider config needed; Google/Apple buttons removed)
2. ✅ **DB schema + RLS** — canonical in `supabase/migrations/` (4 files, matching remote history; plan's old names `accounts`/`wallets` became `money_accounts`, `kyc_state` lives in `user_profiles.kyc_status`)
3. ✅ **Edge Functions holding the Bridge key** — 5 functions deployed on the **current Bridge API** (`Api-Key` auth header + `Idempotency-Key` on writes; sandbox keys `sk-test…` auto-target `api.sandbox.bridge.xyz`; CORS echoes allowlisted origins only — `ALLOWED_ORIGINS` env, dev default `localhost:5173|4173`). Includes `bridge-accounts` provisioning + API-registered webhook endpoint with RSA signature verification
4. ⏳ **Dashboard real data** — page, reads, history/invoice flows all built; the deposit → webhook → balance loop is wired and signature-verified live, but real traffic starts once a human completes Persona KYC and `bridge-accounts` provisioning runs (self-serve, no extra secrets)