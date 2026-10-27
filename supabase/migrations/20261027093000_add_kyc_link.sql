-- ============================================================
-- add_kyc_link  (20261027093000)
-- Current Bridge flow: POST /kyc_links (full_name+email) creates the
-- customer on approval. We persist the link id to resume & poll status.
-- ============================================================

alter table public.user_profiles
  add column bridge_kyc_link_id text;
