-- =============================================================================
-- 002_stock_functions.sql
-- erp.post_stock(): the ONLY way to change Centralized Inventory.
-- Locks the lot row, blocks negative stock and expired consumption, and writes
-- the immutable Audit Ledger row with the new balance - all in the caller's
-- transaction (so multi-line operations are atomic).
-- =============================================================================

create or replace function erp.post_stock(
  p_txn_type      text,
  p_mpn_id        uuid,
  p_location_id   uuid,
  p_warehouse_id  uuid,
  p_lot_no        text,
  p_qty_change    numeric,          -- signed: + adds stock, - removes stock
  p_user_id       uuid,
  p_reference_type text default null,
  p_reference_id  text default null,
  p_reason        text default null,
  p_mfg_date      date default null,
  p_expiry_date   date default null,
  p_vendor_id     uuid default null,
  p_allow_expired boolean default false
) returns public.stock_ledger
language plpgsql
set search_path = public
as $$
declare
  v_mpn        public.mpns%rowtype;
  v_material   public.materials%rowtype;
  v_inv        public.inventory%rowtype;
  v_new        numeric(18,4);
  v_ledger     public.stock_ledger%rowtype;
  v_lot        text := trim(coalesce(p_lot_no, ''));
begin
  if p_qty_change is null or p_qty_change = 0 then
    raise exception 'Quantity must be non-zero' using errcode = '22023';
  end if;
  if v_lot = '' then
    raise exception 'Lot No is required' using errcode = '22023';
  end if;
  if p_txn_type not in ('OPENING','INWARD','OUTWARD','TRANSFER_OUT','TRANSFER_IN',
                        'ADJUSTMENT','MFG_CONSUMPTION','MFG_OUTPUT','MFG_CORRECTION') then
    raise exception 'Unknown transaction type %', p_txn_type using errcode = '22023';
  end if;

  select * into v_mpn from public.mpns where id = p_mpn_id;
  if not found then
    raise exception 'MPN not found' using errcode = 'P0002';
  end if;
  select * into v_material from public.materials where id = v_mpn.material_id;

  if not exists (select 1 from public.warehouses w
                 where w.id = p_warehouse_id and w.location_id = p_location_id) then
    raise exception 'Warehouse does not belong to the selected Location' using errcode = '22023';
  end if;

  perform set_config('erp.ledger_write', 'on', true);

  select * into v_inv from public.inventory
   where mpn_id = p_mpn_id and location_id = p_location_id
     and warehouse_id = p_warehouse_id and lot_no = v_lot
   for update;

  if not found then
    if p_qty_change < 0 then
      raise exception 'Lot % of % not found in the selected warehouse', v_lot, v_mpn.mpn_code
        using errcode = 'P0002';
    end if;
    insert into public.inventory (mpn_id, material_id, vendor_id, location_id, warehouse_id,
                                  lot_no, quantity, uom, mfg_date, expiry_date)
    values (p_mpn_id, v_mpn.material_id, p_vendor_id, p_location_id, p_warehouse_id,
            v_lot, 0, v_material.uom, p_mfg_date, p_expiry_date)
    returning * into v_inv;
  else
    -- An existing lot keeps its identity: dates must match when supplied
    if p_qty_change > 0 and p_mfg_date is not null and v_inv.mfg_date is not null
       and p_mfg_date <> v_inv.mfg_date then
      raise exception 'Lot % already exists with Mfg Date %', v_lot, v_inv.mfg_date using errcode = '22023';
    end if;
    if p_qty_change > 0 and p_expiry_date is not null and v_inv.expiry_date is not null
       and p_expiry_date <> v_inv.expiry_date then
      raise exception 'Lot % already exists with Expiry Date %', v_lot, v_inv.expiry_date using errcode = '22023';
    end if;
  end if;

  -- Expired lots cannot be issued or consumed (adjustments/transfers may still move them)
  if p_qty_change < 0 and not p_allow_expired
     and p_txn_type in ('OUTWARD', 'MFG_CONSUMPTION')
     and v_inv.expiry_date is not null and v_inv.expiry_date < current_date then
    raise exception 'Lot % expired on %', v_lot, v_inv.expiry_date using errcode = '22023';
  end if;

  v_new := v_inv.quantity + p_qty_change;
  if v_new < 0 then
    raise exception 'Insufficient stock in lot % of %: available %, requested %',
      v_lot, v_mpn.mpn_code, v_inv.quantity, abs(p_qty_change) using errcode = '23514';
  end if;

  update public.inventory
     set quantity = v_new,
         mfg_date = coalesce(mfg_date, p_mfg_date),
         expiry_date = coalesce(expiry_date, p_expiry_date),
         vendor_id = coalesce(vendor_id, p_vendor_id)
   where id = v_inv.id;

  insert into public.stock_ledger (user_id, txn_type, inventory_id, mpn_id, material_id, lot_no,
                                   location_id, warehouse_id, qty_change, new_balance, uom,
                                   reference_type, reference_id, reason)
  values (p_user_id, p_txn_type, v_inv.id, p_mpn_id, v_mpn.material_id, v_lot,
          p_location_id, p_warehouse_id, p_qty_change, v_new, v_inv.uom,
          p_reference_type, p_reference_id, p_reason)
  returning * into v_ledger;

  perform set_config('erp.ledger_write', 'off', true);
  return v_ledger;
end $$;

-- ---------------------------------------------------------------------------
-- Reporting views
-- ---------------------------------------------------------------------------
create or replace view public.v_stock as
select i.id, i.lot_no, i.quantity, i.uom, i.mfg_date, i.expiry_date,
       (i.expiry_date is not null and i.expiry_date < current_date) as is_expired,
       i.mpn_id, p.mpn_code, i.material_id, m.code as material_code, m.name as material_name,
       m.classification, i.vendor_id, v.name as vendor_name,
       i.location_id, l.code as location_code, l.name as location_name,
       i.warehouse_id, w.code as warehouse_code, w.name as warehouse_name,
       i.updated_at
  from public.inventory i
  join public.mpns p on p.id = i.mpn_id
  join public.materials m on m.id = i.material_id
  join public.locations l on l.id = i.location_id
  join public.warehouses w on w.id = i.warehouse_id
  left join public.vendors v on v.id = i.vendor_id;

create or replace view public.v_ledger as
select s.id, s.txn_no, s.txn_at, s.txn_type, s.qty_change, s.new_balance, s.uom,
       s.reference_type, s.reference_id, s.reason, s.lot_no,
       s.user_id, u.full_name as user_name,
       s.mpn_id, p.mpn_code, s.material_id, m.code as material_code, m.name as material_name,
       s.location_id, l.code as location_code, l.name as location_name,
       s.warehouse_id, w.code as warehouse_code, w.name as warehouse_name
  from public.stock_ledger s
  join public.mpns p on p.id = s.mpn_id
  join public.materials m on m.id = s.material_id
  join public.locations l on l.id = s.location_id
  join public.warehouses w on w.id = s.warehouse_id
  left join public.user_profiles u on u.id = s.user_id;

-- ---------------------------------------------------------------------------
-- Security: backend (service connection) is the only client.
-- Enable RLS without policies so Supabase anon/authenticated API keys see nothing.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['app_settings','companies','locations','warehouses','vendors','materials','mpns',
                           'mpn_vendors','boms','bom_lines','inventory','stock_ledger','stock_transfers',
                           'plans','plan_events','batches','batch_inputs']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.app_settings, public.companies, public.locations, public.warehouses, public.vendors,
             public.materials, public.mpns, public.mpn_vendors, public.boms, public.bom_lines, public.inventory,
             public.stock_ledger, public.stock_transfers, public.plans, public.plan_events, public.batches,
             public.batch_inputs, public.v_stock, public.v_ledger from authenticated';
  end if;
end $$;

-- Views run with the caller's rights (so RLS on base tables applies to API roles)
alter view public.v_stock set (security_invoker = true);
alter view public.v_ledger set (security_invoker = true);

revoke all on function erp.post_stock(text, uuid, uuid, uuid, text, numeric, uuid, text, text, text, date, date, uuid, boolean) from public;
revoke all on schema erp from public;
