-- A BOM material that was planned but not consumed (actual = 0) has no lot.
alter table public.batch_inputs alter column mpn_id drop not null;
alter table public.batch_inputs alter column lot_no drop not null;
alter table public.batch_inputs alter column warehouse_id drop not null;
alter table public.batch_inputs add constraint batch_inputs_lot_required
  check (actual_input_qty = 0 or (mpn_id is not null and lot_no is not null and warehouse_id is not null));

-- Batch number sequence helper: BCH-YYMMDD-0001
create or replace function erp.next_batch_no() returns text
language sql set search_path = pg_catalog, public as $$
  select 'BCH-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.batch_no_seq')::text, 4, '0');
$$;
revoke all on function erp.next_batch_no() from public;
