-- =============================================================================
-- Supabase one-off: copy real master data + stock from archive_v1 into the new
-- schema. Run AFTER 100_archive_v1.sql and migrations 001/002.
--
-- Migrated : company, locations, warehouses, vendors, materials (+ v1 products
--            as materials), MPNs, MPN-vendor mapping, BOMs (+ lines), stock lots
--            (as OPENING ledger entries).
-- Not migrated (test data, still available in archive_v1): plans, batches,
--            production orders, purchase orders, audit_log.
-- =============================================================================

-- Company (edit the name in Settings / SQL as needed)
insert into public.companies (id, name)
values ('00000000-0000-0000-0000-000000000c01', 'Default Company')
on conflict do nothing;

-- Locations & warehouses (same ids)
insert into public.locations (id, company_id, code, name, address, created_by, created_at)
select id, '00000000-0000-0000-0000-000000000c01', code, name, address, created_by, created_at
  from archive_v1.locations;

insert into public.warehouses (id, location_id, code, name, is_default, created_by, created_at)
select id, location_id, code, name, is_default, created_by, created_at
  from archive_v1.warehouses;

-- Vendors
insert into public.vendors (id, code, name, contact_email, phone, gstin, address, city, state, country,
                            status, created_by, created_at)
select id, code, name, contact_email, phone, gstin,
       nullif(concat_ws(', ', address_line1, address_line2, postal_code), ''),
       city, state, country,
       case when deleted_at is null and status::text in ('ACTIVE', 'APPROVED') then 'ACTIVE' else 'INACTIVE' end,
       created_by, created_at
  from archive_v1.vendors;

-- Materials (v1 materials)
insert into public.materials (id, code, name, classification, uom, status, created_by, created_at)
select id, code, name,
       case classification::text
         when 'PACKAGING' then 'PACKAGING'
         when 'CONSUMABLE' then 'CONSUMABLE'
         when 'FINISHED_GOOD' then 'FINISHED_GOOD'
         else 'RAW_MATERIAL' end,
       uom,
       case when deleted_at is null and status::text = 'ACTIVE' then 'ACTIVE' else 'INACTIVE' end,
       created_by, created_at
  from archive_v1.materials;

-- v1 "products" become materials (single Material Master per spec)
insert into public.materials (id, code, name, classification, uom, status, created_by, created_at)
select id, sku, name,
       case when sku like 'FG-%' then 'FINISHED_GOOD'
            when sku ilike 'RM-RETORTABLE%' then 'PACKAGING'
            else 'RAW_MATERIAL' end,
       uom,
       case when deleted_at is null and status::text = 'ACTIVE' then 'ACTIVE' else 'INACTIVE' end,
       created_by, created_at
  from archive_v1.products;

-- MPNs + MPN-vendor mapping from v1 material_vendors
insert into public.mpns (id, mpn_code, material_id, status, created_by, created_at)
select id, mpn_code, material_id,
       case when deleted_at is null and status::text = 'ACTIVE' then 'ACTIVE' else 'INACTIVE' end,
       created_by, created_at
  from archive_v1.material_vendors;

insert into public.mpn_vendors (mpn_id, vendor_id, is_preferred, lead_time_days, created_by, created_at)
select id, vendor_id, true, lead_time_days, created_by, created_at
  from archive_v1.material_vendors;

-- Every material without an MPN gets one = its code (in-house / finished goods)
insert into public.mpns (mpn_code, material_id, description)
select m.code, m.id, 'Auto-created during v1 migration'
  from public.materials m
 where not exists (select 1 from public.mpns p where p.material_id = m.id)
   and not exists (select 1 from public.mpns p where p.mpn_code = m.code);

-- BOMs: scoped to the location/warehouse where the product is stocked (else first location's default WH)
with bom_src as (
  select b.*,
         row_number() over (partition by b.product_id order by b.is_active desc, b.version desc, b.created_at desc) as rank_active,
         row_number() over (partition by b.product_id order by b.version, b.created_at, b.id) as new_version
    from archive_v1.boms b
   where b.deleted_at is null
),
scope as (
  select distinct on (il.product_id) il.product_id, il.location_id, il.warehouse_id
    from archive_v1.inventory_lots il where il.product_id is not null
   order by il.product_id, il.created_at
),
fallback as (
  select w.location_id, w.id as warehouse_id
    from public.warehouses w join public.locations l on l.id = w.location_id
   where w.is_default order by l.created_at, l.code limit 1
),
totals as (
  select bom_id, sum(standard_qty) as batch_size, min(uom) as batch_uom
    from archive_v1.bom_items group by bom_id
)
insert into public.boms (id, product_id, location_id, warehouse_id, version, status, batch_size, batch_uom,
                         expected_output_qty, output_uom, notes, created_by, created_at)
select s.id, s.product_id,
       coalesce(sc.location_id, f.location_id),
       coalesce(sc.warehouse_id, f.warehouse_id),
       s.new_version,
       case when s.rank_active = 1 and s.is_active then 'ACTIVE' else 'OBSOLETE' end,
       t.batch_size, t.batch_uom,
       t.batch_size, m.uom,
       'Migrated from v1: expected output copied from batch size - please review.',
       s.created_by, s.created_at
  from bom_src s
  join totals t on t.bom_id = s.id
  join public.materials m on m.id = s.product_id
  left join scope sc on sc.product_id = s.product_id
  cross join fallback f;

insert into public.bom_lines (bom_id, line_no, material_id, mpn_id, qty_per_batch, uom, scrap_allowance_pct)
select bi.bom_id,
       row_number() over (partition by bi.bom_id order by bi.formula_percentage desc, m.code),
       bi.material_id,
       (select p.id from public.mpns p where p.material_id = bi.material_id order by p.created_at limit 1),
       bi.standard_qty, m.uom, 0
  from archive_v1.bom_items bi
  join public.boms b on b.id = bi.bom_id
  join public.materials m on m.id = bi.material_id
 where bi.standard_qty > 0;

-- Stock: each v1 lot becomes an OPENING ledger entry through erp.post_stock
do $$
declare r record;
begin
  for r in
    select il.id, coalesce(il.material_id, il.product_id) as material_id, il.location_id, il.warehouse_id,
           il.lot_number, il.quantity_on_hand, il.mfg_date, il.expiry_date, il.created_by,
           (select p.id from public.mpns p where p.material_id = coalesce(il.material_id, il.product_id)
             order by p.created_at limit 1) as mpn_id
      from archive_v1.inventory_lots il
     where il.quantity_on_hand > 0
     order by il.created_at, il.lot_number
  loop
    perform erp.post_stock(
      'OPENING', r.mpn_id, r.location_id, r.warehouse_id, r.lot_number, r.quantity_on_hand,
      r.created_by, 'MIGRATION', r.id::text, 'Opening balance migrated from v1',
      r.mfg_date, r.expiry_date,
      (select mv.vendor_id from public.mpn_vendors mv where mv.mpn_id = r.mpn_id and mv.is_preferred limit 1),
      true);
  end loop;
end $$;
