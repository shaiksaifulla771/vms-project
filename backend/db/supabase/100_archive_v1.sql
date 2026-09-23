-- =============================================================================
-- Supabase one-off: move the previous (v1) schema out of `public` into
-- `archive_v1`. Nothing is deleted - every old table, row, policy and enum is
-- kept and can be inspected or restored. public.user_profiles (and roles) stay.
-- =============================================================================
create schema if not exists archive_v1;

do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
       and c.relname <> 'user_profiles'
  loop
    execute format('alter table public.%I set schema archive_v1', r.relname);
  end loop;

  -- enum types that only the archived tables use
  for r in
    select t.typname
      from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typtype = 'e' and t.typname <> 'user_role'
  loop
    execute format('alter type public.%I set schema archive_v1', r.typname);
  end loop;

  -- free-standing sequences left in public
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('alter sequence public.%I set schema archive_v1', r.relname);
  end loop;
end $$;

-- v1 helper functions that only served archived tables
-- (post_inventory_transaction required a user JWT, so it could never be called from the backend)
drop function if exists internal.post_inventory_transaction(uuid, archive_v1.inventory_txn_type, numeric, character varying, uuid, text);
drop function if exists internal.record_audit cascade;
drop function if exists internal.next_appointment_number();
drop function if exists internal.next_batch_number();
drop function if exists internal.next_grn_number();
drop function if exists internal.next_mrp_run_number();
drop function if exists internal.next_plan_number();
drop function if exists internal.next_po_number();
drop function if exists internal.next_pr_number();
drop function if exists internal.next_prd_number();
drop function if exists internal.next_visitor_code();
drop trigger if exists trg_locations_after_insert on archive_v1.locations;
drop function if exists internal.trg_auto_create_default_warehouse();

-- archived data is not exposed through the Supabase API
revoke all on schema archive_v1 from anon, authenticated;
revoke all on all tables in schema archive_v1 from anon, authenticated;
