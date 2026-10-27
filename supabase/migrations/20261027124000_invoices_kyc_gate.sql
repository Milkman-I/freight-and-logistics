-- ============================================================
-- Invoices KYC gate — only KYC-approved customers may create
-- invoices. Enforced in-database (trigger), so it holds even
-- against direct API/Supabase writes, not just the UI.
-- ============================================================

create or replace function public.enforce_kyc_for_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_profiles
    where id = new.user_id and kyc_status = 'approved'
  ) then
    raise exception 'kyc_not_approved';
  end if;
  return new;
end
$$;

create trigger invoices_kyc_gate
  before insert on public.invoices
  for each row execute function public.enforce_kyc_for_invoice();
