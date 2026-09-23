-- Covering indexes for foreign keys used in lookups / joins (Supabase performance advisor 0001).
-- Audit columns (created_by / updated_by) are intentionally left unindexed.
create index if not exists batch_inputs_material_idx on public.batch_inputs(material_id);
create index if not exists batch_inputs_warehouse_idx on public.batch_inputs(warehouse_id);
create index if not exists bom_lines_material_idx on public.bom_lines(material_id);
create index if not exists inventory_warehouse_idx on public.inventory(warehouse_id);
create index if not exists stock_transfers_mpn_idx on public.stock_transfers(mpn_id);
create index if not exists plans_product_idx on public.plans(product_id);
create index if not exists plans_bom_idx on public.plans(bom_id);
create index if not exists batches_bom_idx on public.batches(bom_id);
create index if not exists stock_ledger_inventory_idx on public.stock_ledger(inventory_id);
create index if not exists stock_ledger_material_idx on public.stock_ledger(material_id);
create index if not exists boms_warehouse_idx on public.boms(warehouse_id);
