-- Pin search_path on trigger functions (Supabase security advisor 0011)
alter function erp.touch_updated_at() set search_path = pg_catalog;
alter function erp.ledger_is_immutable() set search_path = pg_catalog;
alter function erp.inventory_write_guard() set search_path = pg_catalog;
