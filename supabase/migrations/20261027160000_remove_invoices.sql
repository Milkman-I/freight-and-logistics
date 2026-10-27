-- ============================================================
-- Remove invoices completely (feature retired): the "get paid"
-- billing feature and the webhook's invoice auto-match are gone.
-- Drops the table (+sequence +RLS) and the KYC-gate trigger and
-- function. Fresh installs never create them (the two original
-- invoice migrations were removed from the repo); this drop
-- converges any database where they existed.
-- ============================================================

drop trigger if exists invoices_kyc_gate on public.invoices;
drop table if exists public.invoices cascade;
drop sequence if exists public.invoices_seq;
drop function if exists public.enforce_kyc_for_invoice() cascade;
