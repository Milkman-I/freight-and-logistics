-- ============================================================
-- harden_rls_and_indexes  (20261022093512)
-- RECONSTRUCTED from the live F&L project schema (original was
-- applied out-of-band via the dashboard on 2026-10-22).
--
-- RLS principle: users can only ever read their own rows; the
-- Bridge webhook writes through the service role, which bypasses
-- RLS on purpose. No client INSERT except outgoing/pending tx.
-- ============================================================

alter table public.user_profiles enable row level security;
alter table public.money_accounts enable row level security;
alter table public.transactions enable row level security;

 CREATE POLICY profiles_select_own ON public.user_profiles
  FOR select to public
  using (auth.uid() = id);

 create policy profiles_update_own on public.user_profiles
  for update to public
  using (auth.uid() = id)
  with check (auth.uid() = id);

 create policy accounts_select_own on public.money_accounts
  for select to public
  using (auth.uid() = user_id);

 create policy transactions_select_own on public.transactions
  for select to public
  using (auth.uid() = user_id);

 -- insert own outgoing, pending|failed only: the webhook (service role)
 -- becomes the owner of every state transition from there on.
 create policy transactions_insert_own_out on public.transactions
  for insert to public
  with check (
    auth.uid() = user_id
    and direction = 'out'
    and status in ('pending', 'failed')
  );

create index money_accounts_user_id_idx
  on public.money_accounts (user_id);

create index transactions_account_id_idx
  on public.transactions (account_id);

create index transactions_user_feed
  on public.transactions (user_id, created_at desc);

-- users can flip a row pending ↔ failed (resubmit), but never touch
-- kyc_status / bridge_customer_id / google_email — those are managed
-- exclusively by the webhook (service role path).
create or replace function public.guard_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    if (new.bridge_customer_id is distinct from old.bridge_customer_id)
       or (new.kyc_status is distinct from old.kyc_status)
       or (new.google_email is distinct from old.google_email) then
      raise exception 'kyc_status, bridge_customer_id and google_email are service-managed';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger guard_user_profile
  before update on public.user_profiles
  for each row execute function public.guard_profile_columns();
