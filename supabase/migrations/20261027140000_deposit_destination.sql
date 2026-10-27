-- ============================================================
-- Deposit destination choice + balances hardening.
-- 1) user_profiles.deposit_destination — an optional Base address
--    the user's virtual accounts sweep converted USDC/EURC into.
--    NULL = default (the F&L custody wallet).
-- 2) balances view — first canonical definition in the repo; now
--    security_invoker (RLS on transactions applies to the caller)
--    and excluding deposits swept to a wallet outside F&L custody,
--    so unspendable money never shows as in-app balance.
-- ============================================================

alter table public.user_profiles
  add column if not exists deposit_destination text
  check (deposit_destination is null or deposit_destination ~ '^0x[a-fA-F0-9]{40}$');

create or replace view public.balances
with (security_invoker = true) as
select user_id,
       currency,
       sum(
         case
           when direction = 'in' then amount_minor
           else -amount_minor
         end
       ) as balance_minor
from transactions
where status in ('funds_received', 'settled')
  and category is distinct from 'external_sweep'
group by user_id, currency;

grant select on public.balances to authenticated;
