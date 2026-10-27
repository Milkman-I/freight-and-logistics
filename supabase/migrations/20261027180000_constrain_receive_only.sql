-- ============================================================
-- Tighten check constraints to the receive-only surface.
-- The custody-wallet era allowed 'wallet' accounts, 'USDB'
-- currency and 'bridge_wallet'/'static_memo' rails; no code path
-- creates them anymore and zero legacy rows exist (webhook is the
-- sole writer and never emits them), so the domains below carry
-- only values the app can actually produce.
-- ============================================================

alter table public.money_accounts drop constraint money_accounts_currency_check;
alter table public.money_accounts
  add constraint money_accounts_currency_check
  check (currency = any (array['USD'::text, 'EUR'::text]));

alter table public.money_accounts drop constraint money_accounts_kind_check;
alter table public.money_accounts
  add constraint money_accounts_kind_check
  check (kind = any (array['us_checking'::text, 'eur_iban'::text]));

alter table public.transactions drop constraint transactions_currency_check;
alter table public.transactions
  add constraint transactions_currency_check
  check (currency = any (array['USD'::text, 'EUR'::text]));

alter table public.transactions drop constraint transactions_rail_check;
alter table public.transactions
  add constraint transactions_rail_check
  check (rail = any (array['ach_push'::text, 'fednow'::text, 'wire'::text, 'sepa'::text, 'base'::text]));
