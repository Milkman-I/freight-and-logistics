-- ============================================================
-- Deep cleanup after the receive-only rework. Three fixes:
-- 1) transactions.account_id — dead column (always NULL since the
--    client could never write account-scoped rows; the webhook
--    never sets it). Dropped with its index and FK.
-- 2) user_profiles.google_email → email — honest column name; it
--    carries the auth email for every provider. The two trigger
--    functions referencing it are rebuilt on the new name.
-- 3) bridge_config — was RLS-off with default anon/authenticated
--    write grants (anyone with the publishable key could rewrite
--    the webhook RSA key / URL). Locked to the service role.
-- ============================================================

-- 1) dead column
drop index if exists public.transactions_account_id_idx;
alter table public.transactions
  drop column if exists account_id cascade;
drop index if exists public.transactions_account_id_idx;

-- 2) legacy column name
alter table public.user_profiles
  rename column google_email to email;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

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
       or (new.email is distinct from old.email) then
      raise exception 'kyc_status, bridge_customer_id and email are service-managed';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

-- 3) service-role-only config table
alter table public.bridge_config enable row level security;
revoke all on public.bridge_config from anon;
revoke all on public.bridge_config from authenticated;
