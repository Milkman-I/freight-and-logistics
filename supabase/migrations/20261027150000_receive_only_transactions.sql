-- ============================================================
-- Receive-only tightening: the Send feature was removed, so the
-- client never inserts outgoing transaction rows anymore. Drop
-- the insert-own 'out' policy — from now on ONLY the Bridge
-- webhook (service role) creates transactions, both directions.
-- Reads stay untouched (select-own), balances/history/invoice
-- matching keep using this table as the incoming-ledger.
-- ============================================================

drop policy if exists transactions_insert_own_out on public.transactions;
