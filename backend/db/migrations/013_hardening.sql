-- ===========================================================================
-- 013  Hardening (v10 audit)
--   * batches.client_request_id: a double-clicked / retried "Submit Batch" posts only once
--   (stock quantities are rounded to 4 decimals once, in services/stock.js, before erp.post_stock)
-- Additive only.
-- ===========================================================================

alter table public.batches add column if not exists client_request_id text;
create unique index if not exists batches_client_request_uq on public.batches(client_request_id) where client_request_id is not null;
alter table public.batches drop constraint if exists batches_client_request_len;
alter table public.batches add constraint batches_client_request_len check (client_request_id is null or length(client_request_id) <= 64);
