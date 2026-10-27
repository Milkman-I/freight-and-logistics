-- ============================================================
-- bridge_config  (20261027103000)
-- Operator-free bridge webhook wiring: bridge-accounts registers the
-- endpoint with Bridge and stores its RSA public key here; bridge-webhook
-- reads it for X-Webhook-Signature verification. No RLS: only the
-- service role touches this table.
-- ============================================================

create table public.bridge_config (
  id int primary key default 1,
  webhook_public_key text,
  webhook_endpoint_id text,
  webhook_url text,
  updated_at timestamptz not null default now()
);

insert into public.bridge_config (id) values (1)
  on conflict (id) do nothing;
