-- ============================================================
-- create_user_profiles  (20261022093423)
-- RECONSTRUCTED from the live F&L project schema (original was
-- applied out-of-band via the dashboard on 2026-10-22). This file
-- is now the canonical definition — match live DB against it.
-- ============================================================

create table public.user_profiles (
  id uuid primary key
    references auth.users (id) on delete cascade,
  google_email text not null default '',
  full_name text not null default '',
  avatar_url text,
  bridge_customer_id text,
  kyc_status text not null default 'not_started'
    check (kyc_status in ('not_started', 'under_review', 'incomplete', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create the profile on every new auth user (Google sign-in).
-- Security definer so the insert runs regardless of RLS.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, google_email, full_name, avatar_url)
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
