-- ============================================================
-- Money-account mirroring repairs.
-- Both bridge-accounts and bridge-webhook upsert mirror rows with
-- onConflict: "bridge_account_id", but no unique index existed on
-- that column — every mirror insert failed on "no unique or
-- exclusion constraint matching the ON CONFLICT specification"
-- and, with supabase-js resolving errors instead of throwing,
-- every account row was silently discarded (Bridge held real
-- accounts; the platform showed none). The unique index makes
-- the upserts land.
-- ============================================================

create unique index if not exists money_accounts_bridge_account_id_key
  on public.money_accounts (bridge_account_id);
