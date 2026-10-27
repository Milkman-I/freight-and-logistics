-- ============================================================
-- create_invoices  (20261027090000)
-- Invoice tracking wired to the Bridge webhook: an incoming
-- transfer that settles with the exact amount+currency of an
-- open invoice marks that invoice paid (see bridge-webhook).
-- ============================================================

create sequence public.invoices_seq start 1;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users (id) on delete cascade,
  number text not null unique
    default ('INV-' || lpad(nextval('public.invoices_seq')::text, 6, '0')),
  client_name text not null default '',
  currency text not null check (currency in ('USD', 'EUR', 'USDB')),
  amount_minor bigint not null check (amount_minor > 0),
  note text not null default '',
  status text not null default 'unpaid'
    check (status in ('unpaid', 'paid', 'void')),
  tx_id uuid references public.transactions (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index invoices_user_created_idx
  on public.invoices (user_id, created_at desc);

-- matching lookup used by the webhook (open, per user, per amount+currency)
create index invoices_open_match_idx
  on public.invoices (user_id, currency, amount_minor)
  where status = 'unpaid';

alter table public.invoices enable row level security;

create policy invoices_select_own ON public.invoices
  for select to public
  using (auth.uid() = user_id);

create policy invoices_insert_own ON public.invoices
  for insert to public
  with check (auth.uid() = user_id and status = 'unpaid');

create policy invoices_update_own ON public.invoices
  for update to public
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
