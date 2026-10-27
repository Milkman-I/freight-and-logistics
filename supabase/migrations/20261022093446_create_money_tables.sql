-- ============================================================
-- create_money_tables  (20261022093446)
-- RECONSTRUCTED from the live F&L project schema (original was
-- applied out-of-band via the dashboard on 2026-10-22).
-- ============================================================

create table public.money_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users (id) on delete cascade,
  kind text not null check (kind in ('us_checking', 'eur_iban', 'wallet')),
  currency text not null check (currency in ('USD', 'EUR', 'USDB')),
  routing_number text,
  account_number text,
  iban text,
  rails text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'failed')),
  bridge_account_id text,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users (id) on delete cascade,
  account_id uuid
    references public.money_accounts (id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('USD', 'EUR', 'USDB')),
  rail text check (rail in ('ach', 'fednow', 'wire', 'sepa', 'base')),
  status text not null default 'awaiting_funds'
    check (status in (
      'awaiting_funds', 'funds_arriving', 'pending',
      'funds_received', 'settled', 'failed'
    )),
  description text not null default '',
  counterparty text not null default '',
  category text not null default '',
  bridge_transfer_id text,
  created_at timestamptz not null default now()
);
