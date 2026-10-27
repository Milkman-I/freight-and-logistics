# F&L — Web (Vite + React)

Stablecoin banking platform (receive-only): email sign-in → KYC → bank accounts → deposits. Deposits sweep straight to the user's own Base wallet.

## Stack

- **Vite + React 19 + TypeScript** (SPA)
- **Tailwind v4** via `@tailwindcss/vite`
- **Design system**: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) ("Lime Voltage") — tokens live in `src/tokens.css`
- **Supabase**: Auth (email + password) + Postgres + Edge Functions
  - Project: `nkpoijxwcowyrzcmvwjw` (eu-west-2)
- **Bridge** (current api.bridge.xyz `/v0` API — `Api-Key` header auth, KYC-links onboarding, API-based webhook endpoints with RSA signature verification) — all calls happen server-side via Edge Functions; the browser never touches Bridge. Sandbox is selected via the `BRIDGE_API_URL` secret (`https://api.sandbox.bridge.xyz/v0`); default is production

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
│   ├── dashboard/               # "/app" real-data shell (+ AccountDetails, Cashflow, History, KycStrip, StatCard)
│   └── legal/                   # "/terms", "/privacy"
├── services/                    # all Supabase I/O lives here
│   ├── supabase.ts              # browser client (persistSession, detectSessionInUrl)
│   ├── auth.ts                  # signInWithGoogle + useGoogleAuth
│   ├── profiles.ts              # user_profiles reads
│   ├── money.ts                 # money_accounts + transactions reads (fetchDashboardMoney)
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
| `bridge-customer` | ✅ | creates/resumes the user's Bridge **kyc link** (`POST /v0/kyc_links`, `Api-Key` header), syncs `kyc_status` + `bridge_customer_id` + Bridge's terms-of-service acceptance (`tos_link` / `tos_status` — required by Bridge before a customer can be approved); self-healing — Bridge allows one kyc link per email, so a `duplicate_record` rejection adopts the existing link and re-opens it instead of erroring (abandoned-mid-Persona users always get their original link back); every success response carries `redirect_url` |
| `bridge-kyc-link` | ✅ | returns the hosted Persona verification URL for the stored kyc link |
| `bridge-accounts` | ✅ | idempotent provisioning for approved customers — **receive-only, no custody wallet**: USD virtual account (ACH push/FedNow/Wire → USDC) and EUR virtual IBAN (SEPA → EURC) whose sweeps land on the **deposit destination** the user must enter at setup (their own Base address — required in the request body, persisted in `user_profiles`; frozen once virtual accounts exist, a change returns `409 destination_locked`); registers + activates the Bridge webhook endpoint and stores its RSA public key in `bridge_config` |
| `bridge-webhook` | ❌ | single receiver for all Bridge events; RSA signature verification (`X-Webhook-Signature: t=…,v0=…` against the `bridge_config` public key). New flat event schema only: `customer.*` → `kyc_status`, `kyc_link.*` → kyc + customer id, `virtual_account*` → `money_accounts`, `bridge_wallet*` → wallet row (legacy users only), `transfer.*` → `transactions` (upsert by `bridge_transfer_id`; deposits are categorized `external_sweep` — swept money belongs to the user's own wallet, not in-app balance). At-least-once: processed event ids answer 200 without re-running, failures answer 5xx for redelivery |
| `bridge-create-transfer` | ✅ | retired with the send feature (no client route); kept deployed as a fail-fast guard — without a custody wallet row it flips the `pending` row to `failed` and answers `400 wallet_not_provisioned` |

Database (canonical migrations now in `supabase/migrations/*` — single source of truth; never hand-apply via dashboard):

| Migration | What it creates |
|---|---|
| `20261022093423_create_user_profiles.sql` | `user_profiles` + `on_auth_user_created` trigger (`handle_new_user`) |
| `20261022093446_create_money_tables.sql` | `money_accounts`, `transactions` |
| `20261022093512_harden_rls_and_indexes.sql` | RLS policies, indexes, `guard_user_profile` trigger |
| `20261026071717_webhook_events_and_transfer_link.sql` | `webhook_events` audit table + unique `transactions.bridge_transfer_id` index |
| `20261027093000_add_kyc_link.sql` | `user_profiles.bridge_kyc_link_id` (KYC-link first onboarding) |
| `20261027100000_money_accounts_new_bridge.sql` | `money_accounts.bank_name` / `beneficiary_name` / `wallet_address` (current Bridge deposit-instruction data) |
| `20261027103000_bridge_config.sql` | `bridge_config` — webhook endpoint RSA public key + registration metadata (no secrets; service-role only) |
| `20261027110000_transactions_rail_new_bridge.sql` | `transactions.rail` constraint → current Bridge rails (`ach_push | fednow | wire | sepa | base | bridge_wallet | static_memo`) |
| `20261027140000_deposit_destination.sql` | `user_profiles.deposit_destination` (required sweep wallet — the user's own Base address, `^0x[a-fA-F0-9]{40}$` CHECK) + canonical `balances` view (`security_invoker`, excludes `external_sweep` rows) |
| `20261027150000_receive_only_transactions.sql` | drops `transactions_insert_own_out` — clients never insert transactions (receive-only; webhook is the sole writer) |
| `20261027160000_remove_invoices.sql` | drops the retired invoices feature entirely (table, sequence, KYC-gate trigger + function) |
| `20261027170000_deep_cleanup.sql` | drops dead `transactions.account_id` (+index/FK); renames `user_profiles.google_email → email` (+ trigger functions rebuilt); locks `bridge_config` to the service role (RLS on, anon/authenticated grants revoked) |

- **`user_profiles`** — `id` (= auth.users), `email`, `full_name`, `avatar_url`, `bridge_customer_id`, `bridge_kyc_link_id`, `kyc_status` (`not_started | under_review | incomplete | approved | rejected`), `deposit_destination` (the user's own Base address that virtual-account deposits sweep into — required to open accounts, written by `bridge-accounts` only, frozen once accounts exist). The `guard_user_profile` trigger blocks non-service updates to `kyc_status` / `bridge_customer_id` / `email`.

> Note: legacy tables referenced this column as `google_email`; it was renamed to `email` in `20261027170000_deep_cleanup.sql` — it carries the auth email for any provider. No Google/OAuth dependency remains in the app.

- **`money_accounts`** — `kind` (`us_checking | eur_iban | wallet`), `currency` (`USD | EUR | USDB`), `routing_number` / `account_number` / `iban`, `bank_name` / `beneficiary_name` (real deposit instructions), `wallet_address` (the sweep destination Bridge reported), `rails` (text[]), `status` (`pending | active | failed`), `bridge_account_id`.
- **`transactions`** — `amount_minor > 0`, `currency`, `rail` (`ach_push | fednow | wire | sepa | base` (+ `bridge_wallet` / `static_memo` as recorded from Bridge webhook sources)), `status` lifecycle (`awaiting_funds → funds_arriving → pending → funds_received → settled | failed`), `bridge_transfer_id`.

RLS: users can SELECT/own everything; `user_profiles` allows UPDATE own (column guard trigger); `transactions` is read-only for clients — the Bridge webhook (service role) is the only writer, both directions.

## What's needed for email sign-in to work

Supabase Auth → Providers: none — email + password is enabled by default. If you want instant sessions on signup (skip the confirmation email), turn off **Auth → Providers → Email → Confirm email**. With it on, users confirm then sign in; the form handles both paths.

## Phases (from the build plan)

1. ✅ **Google auth** → replaced by **email + password** (no provider config needed; Google/Apple buttons removed)
2. ✅ **DB schema + RLS** — canonical in `supabase/migrations/` (4 files, matching remote history; plan's old names `accounts`/`wallets` became `money_accounts`, `kyc_state` lives in `user_profiles.kyc_status`)
3. ✅ **Edge Functions holding the Bridge key** — 5 functions deployed on the **current Bridge API** (`Api-Key` auth header + `Idempotency-Key` on writes; target host via `BRIDGE_API_URL`, default production; CORS echoes allowlisted origins only — `ALLOWED_ORIGINS` env, dev default `localhost:5173|4173`). Includes `bridge-accounts` provisioning + API-registered webhook endpoint with RSA signature verification
4. ⏳ **Dashboard real data** — page, reads, and history flows all built; the deposit → webhook → balance loop is wired and signature-verified live, but real traffic starts once a human completes Persona KYC + provider-TOS acceptance and the user picks their deposit destination on `/kyc` — provisioning (`bridge-accounts`) only runs after that user approval (self-serve, no extra secrets)