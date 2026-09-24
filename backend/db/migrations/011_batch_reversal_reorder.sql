-- ============================================================================
-- 011  Batch reversal + reorder level (additive only)
--   * A wrong batch can be reversed (Admin): its stock postings are undone with
--     MFG_CORRECTION rows and the batch stays on record with status REVERSED.
--   * materials.reorder_level: minimum stock; the Reorder report lists materials below it.
-- ============================================================================

alter table public.batches drop constraint if exists batches_status_check;
alter table public.batches add constraint batches_status_check check (status in ('COMPLETED', 'REVERSED'));
alter table public.batches
  add column reversed_by     uuid references public.user_profiles(id),
  add column reversed_at     timestamptz,
  add column reversal_reason text;
create index if not exists batches_reversed_by_idx on public.batches(reversed_by);

alter table public.materials
  add column reorder_level numeric(18,4) check (reorder_level is null or reorder_level >= 0);
