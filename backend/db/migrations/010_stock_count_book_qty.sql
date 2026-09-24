-- ============================================================================
-- 010  Stock count: compare the physical count with the system stock AT THE
--      TIME OF COUNTING (not at the time the sheet was started).
--
--   snapshot_txn_no : last ledger txn included in the snapshot (exact boundary)
--   counted_at      : when the shelf was physically counted (per line)
--   book_qty        : system qty at counted_at =
--                     snapshot_qty + ledger movements after the snapshot up to counted_at
--   variance_qty    : counted_qty - book_qty   (was counted_qty - snapshot_qty)
--
-- Without this, stock received / issued between starting a count (e.g. yesterday)
-- and counting the shelf (today) showed up as a false + / - difference and was
-- posted a second time on approval.
-- Existing lines keep book_qty = snapshot_qty, so posted counts read exactly as before.
-- ============================================================================

alter table public.stock_counts add column snapshot_txn_no bigint;
update public.stock_counts sc
   set snapshot_txn_no = coalesce((select max(l.txn_no) from public.stock_ledger l where l.txn_at <= sc.snapshot_at), 0);
alter table public.stock_counts alter column snapshot_txn_no set not null;
alter table public.stock_counts alter column snapshot_txn_no set default 0;
alter table public.stock_counts add column include_zero boolean not null default false;

alter table public.stock_count_lines add column counted_at timestamptz;
alter table public.stock_count_lines add column book_qty numeric(18,4);
alter table public.stock_count_lines add column added_after_start boolean not null default false;
update public.stock_count_lines set book_qty = snapshot_qty;
update public.stock_count_lines set counted_at = updated_at where counted_qty is not null;
alter table public.stock_count_lines alter column book_qty set not null;

alter table public.stock_count_lines drop column variance_qty;
alter table public.stock_count_lines
  add column variance_qty numeric(18,4) generated always as (counted_qty - book_qty) stored;

create index if not exists stock_ledger_inventory_txn_idx on public.stock_ledger(inventory_id, txn_no);
