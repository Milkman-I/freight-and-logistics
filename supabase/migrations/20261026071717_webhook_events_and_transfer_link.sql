-- ============================================================
-- webhook_events_and_transfer_link  (20261026071717)
-- Applied via the Supabase MCP on 2026-10-26 by agent, matching
-- the version in the remote migration history.
--
-- 1) webhook_events — raw audit trail for EVERY Bridge webhook:
--    replay + forensics never rely on Edge Function logs.
--    RLS enabled with zero policies = service-role only.
-- 2) unique index on transactions.bridge_transfer_id — the bridge
--    webhook upserts with onConflict:'bridge_transfer_id'; without
--    this index every inbound transfer event silently failed.
-- ============================================================

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  bridge_event_id text unique,
  payload jsonb not null,
  processed boolean not null default false,
  processing_error text,
  created_at timestamptz not null default now()
);

create index webhook_events_created_idx
  on public.webhook_events (created_at desc);

create index webhook_events_unprocessed_idx
  on public.webhook_events (created_at desc)
  where not processed;

alter table public.webhook_events enable row level security;
-- (intentionally no policies: service role bypasses RLS, everyone else denied)

create unique index transactions_bridge_transfer_id_key
  on public.transactions (bridge_transfer_id);
