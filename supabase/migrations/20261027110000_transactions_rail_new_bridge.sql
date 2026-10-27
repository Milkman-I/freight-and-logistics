-- ============================================================
-- transactions_rail_new_bridge  (20261027110000)
-- Rail names resynced to the current Bridge API: 'ach' no longer
-- exists (→ 'ach_push'), and wallet-sourced transfers / deposit
-- memos record 'bridge_wallet' / 'static_memo'.
-- ============================================================

alter table public.transactions drop constraint transactions_rail_check;
alter table public.transactions add constraint transactions_rail_check
  check (rail in ('ach_push', 'fednow', 'wire', 'sepa', 'base', 'bridge_wallet', 'static_memo'));
