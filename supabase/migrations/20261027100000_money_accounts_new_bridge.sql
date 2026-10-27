-- ============================================================
-- money_accounts_new_bridge  (20261027100000)
-- Align money_accounts with the current Bridge API: virtual account
-- source_deposit_instructions carry bank_name / beneficiary name, and
-- custodial wallets have an on-chain address (destination of deposits).
-- ============================================================

alter table public.money_accounts
  add column bank_name text;
alter table public.money_accounts
  add column beneficiary_name text;
alter table public.money_accounts
  add column wallet_address text;
