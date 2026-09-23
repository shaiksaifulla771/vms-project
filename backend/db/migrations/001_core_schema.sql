-- =============================================================================
-- 001_core_schema.sql
-- Zoho-style ERP: Inventory, Planning, Manufacturing (spec-aligned core schema)
--
-- Layers
--   Master data  : companies, locations, warehouses, vendors, materials, mpns,
--                  mpn_vendors, boms, bom_lines, app_settings
--   Storage      : inventory (Centralized Inventory, single source of truth)
--                  stock_ledger (immutable Audit Ledger)
--   Transactions : stock_transfers, plans, batches, batch_inputs
--
-- Portable PostgreSQL (15+). No Supabase-specific objects except the optional
-- reuse of public.user_profiles (created here only if it does not exist).
-- =============================================================================

create schema if not exists erp;   -- internal functions (not exposed via PostgREST)

-- ---------------------------------------------------------------------------
-- Users (existing Supabase table is reused as-is; roles are NOT changed)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'user_role' and n.nspname = 'public') then
    create type public.user_role as enum ('admin', 'editor', 'viewer');
  end if;
end $$;

create table if not exists public.user_profiles (
  id          uuid primary key default gen_random_uuid(),
  full_name   varchar not null,
  email       varchar not null,
  role        public.user_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function erp.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Settings (global variance tolerance, scrap allowance default, ...)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.user_profiles(id)
);

insert into public.app_settings (key, value, description) values
  ('variance_tolerance_pct', '5.0', 'Max allowed |actual - plan| / plan % before a variance reason is mandatory'),
  ('apply_scrap_allowance', 'true', 'Default for new plans: include BOM scrap allowance % in material requirements'),
  ('default_shelf_life_days', '365', 'Used to suggest expiry date when a material has no shelf life');

-- ---------------------------------------------------------------------------
-- Company -> Locations -> Warehouses
-- ---------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id),
  code        text not null unique,
  name        text not null,
  address     text,
  is_active   boolean not null default true,
  created_by  uuid references public.user_profiles(id),
  updated_by  uuid references public.user_profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  code        text not null,
  name        text not null,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_by  uuid references public.user_profiles(id),
  updated_by  uuid references public.user_profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (location_id, code),
  unique (id, location_id)          -- target for composite FKs (WH must belong to Location)
);
create unique index warehouses_one_default_per_location on public.warehouses(location_id) where is_default;

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------
create table public.vendors (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  contact_email  text,
  phone          text,
  gstin          text,
  address        text,
  city           text,
  state          text,
  country        text,
  status         text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_by     uuid references public.user_profiles(id),
  updated_by     uuid references public.user_profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Material Master
-- ---------------------------------------------------------------------------
create table public.materials (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  classification   text not null check (classification in
                     ('RAW_MATERIAL', 'PACKAGING', 'CONSUMABLE', 'SEMI_FINISHED', 'FINISHED_GOOD')),
  uom              text not null,
  shelf_life_days  integer check (shelf_life_days is null or shelf_life_days > 0),
  status           text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_by       uuid references public.user_profiles(id),
  updated_by       uuid references public.user_profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- MPN (Manufacturer Part Number). A material can have several MPNs.
create table public.mpns (
  id            uuid primary key default gen_random_uuid(),
  mpn_code      text not null unique,
  material_id   uuid not null references public.materials(id),
  manufacturer  text,
  description   text,
  status        text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_by    uuid references public.user_profiles(id),
  updated_by    uuid references public.user_profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, material_id)          -- target for composite FKs (MPN must belong to material)
);
create index mpns_material_idx on public.mpns(material_id);

-- MPN <-> Vendor mapping
create table public.mpn_vendors (
  id             uuid primary key default gen_random_uuid(),
  mpn_id         uuid not null references public.mpns(id) on delete cascade,
  vendor_id      uuid not null references public.vendors(id),
  is_preferred   boolean not null default false,
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  created_by     uuid references public.user_profiles(id),
  created_at     timestamptz not null default now(),
  unique (mpn_id, vendor_id)
);
create unique index mpn_vendors_one_preferred on public.mpn_vendors(mpn_id) where is_preferred;
create index mpn_vendors_vendor_idx on public.mpn_vendors(vendor_id);

-- ---------------------------------------------------------------------------
-- BOM (Bill of Materials) - versioned, scoped to Location + WH
-- ---------------------------------------------------------------------------
create sequence public.bom_no_seq start 1001;

create table public.boms (
  id                   uuid primary key default gen_random_uuid(),
  bom_no               text not null unique default ('BOM-' || nextval('public.bom_no_seq')),
  product_id           uuid not null references public.materials(id),
  location_id          uuid not null references public.locations(id),
  warehouse_id         uuid not null,
  version              integer not null default 1 check (version > 0),
  status               text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'OBSOLETE')),
  batch_size           numeric(18,4) not null check (batch_size > 0),
  batch_uom            text not null,
  expected_output_qty  numeric(18,4) not null check (expected_output_qty > 0),
  output_uom           text not null,
  notes                text,
  created_by           uuid references public.user_profiles(id),
  updated_by           uuid references public.user_profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (warehouse_id, location_id) references public.warehouses(id, location_id),
  unique (product_id, location_id, version)
);
-- Only one ACTIVE BOM per Product + Location
create unique index boms_one_active on public.boms(product_id, location_id) where status = 'ACTIVE';

create table public.bom_lines (
  id                   uuid primary key default gen_random_uuid(),
  bom_id               uuid not null references public.boms(id) on delete cascade,
  line_no              integer not null,
  material_id          uuid not null references public.materials(id),
  mpn_id               uuid,                                 -- optional preferred MPN
  qty_per_batch        numeric(18,4) not null check (qty_per_batch > 0),
  uom                  text not null,
  scrap_allowance_pct  numeric(7,3) not null default 0 check (scrap_allowance_pct >= 0 and scrap_allowance_pct < 100),
  foreign key (mpn_id, material_id) references public.mpns(id, material_id),
  unique (bom_id, material_id),
  unique (bom_id, line_no)
);

-- ---------------------------------------------------------------------------
-- Centralized Inventory (single source of truth)
-- Unique: MPN + Location + WH + Lot. Only erp.post_stock() may change it.
-- ---------------------------------------------------------------------------
create table public.inventory (
  id            uuid primary key default gen_random_uuid(),
  mpn_id        uuid not null,
  material_id   uuid not null,
  vendor_id     uuid references public.vendors(id),
  location_id   uuid not null references public.locations(id),
  warehouse_id  uuid not null,
  lot_no        text not null check (length(trim(lot_no)) > 0),
  quantity      numeric(18,4) not null default 0 check (quantity >= 0),   -- negative inventory blocked
  uom           text not null,
  mfg_date      date,
  expiry_date   date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (mpn_id, material_id) references public.mpns(id, material_id),
  foreign key (warehouse_id, location_id) references public.warehouses(id, location_id),
  unique (mpn_id, location_id, warehouse_id, lot_no),
  check (expiry_date is null or mfg_date is null or expiry_date >= mfg_date)
);
create index inventory_scope_idx on public.inventory(location_id, warehouse_id);
create index inventory_material_idx on public.inventory(material_id);
create index inventory_expiry_idx on public.inventory(expiry_date);

-- ---------------------------------------------------------------------------
-- Audit Ledger (immutable)
-- ---------------------------------------------------------------------------
create table public.stock_ledger (
  id              uuid primary key default gen_random_uuid(),
  txn_no          bigint generated always as identity unique,
  txn_at          timestamptz not null default now(),
  user_id         uuid references public.user_profiles(id),
  txn_type        text not null check (txn_type in
                    ('OPENING', 'INWARD', 'OUTWARD', 'TRANSFER_OUT', 'TRANSFER_IN',
                     'ADJUSTMENT', 'MFG_CONSUMPTION', 'MFG_OUTPUT', 'MFG_CORRECTION')),
  inventory_id    uuid not null references public.inventory(id),
  mpn_id          uuid not null references public.mpns(id),
  material_id     uuid not null references public.materials(id),
  lot_no          text not null,
  location_id     uuid not null references public.locations(id),
  warehouse_id    uuid not null references public.warehouses(id),
  qty_change      numeric(18,4) not null check (qty_change <> 0),
  new_balance     numeric(18,4) not null check (new_balance >= 0),
  uom             text not null,
  reference_type  text,          -- BATCH | TRANSFER | ADJUSTMENT | INWARD | OUTWARD | MIGRATION
  reference_id    text,          -- e.g. batch no, transfer no
  reason          text
);
create index stock_ledger_at_idx on public.stock_ledger(txn_at desc);
create index stock_ledger_scope_idx on public.stock_ledger(location_id, warehouse_id, txn_at desc);
create index stock_ledger_mpn_idx on public.stock_ledger(mpn_id, lot_no);
create index stock_ledger_ref_idx on public.stock_ledger(reference_type, reference_id);

create or replace function erp.ledger_is_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'stock_ledger is immutable: create a reversing transaction instead'
    using errcode = '55000';
end $$;

create trigger stock_ledger_no_update before update or delete on public.stock_ledger
  for each row execute function erp.ledger_is_immutable();
create trigger stock_ledger_no_truncate before truncate on public.stock_ledger
  for each statement execute function erp.ledger_is_immutable();

-- Guard: inventory rows may only be changed from inside erp.post_stock()
create or replace function erp.inventory_write_guard() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('erp.ledger_write', true), '') <> 'on' then
    raise exception 'inventory can only be changed through system transactions (erp.post_stock)'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger inventory_write_guard before insert or update or delete on public.inventory
  for each row execute function erp.inventory_write_guard();

-- ---------------------------------------------------------------------------
-- Stock transfers: DRAFT -> IN_TRANSIT -> COMPLETED (stock moves on COMPLETED)
-- ---------------------------------------------------------------------------
create sequence public.transfer_no_seq start 1;

create table public.stock_transfers (
  id                  uuid primary key default gen_random_uuid(),
  transfer_no         text not null unique default ('TRF-' || lpad(nextval('public.transfer_no_seq')::text, 6, '0')),
  mpn_id              uuid not null references public.mpns(id),
  lot_no              text not null,
  qty                 numeric(18,4) not null check (qty > 0),
  from_location_id    uuid not null,
  from_warehouse_id   uuid not null,
  to_location_id      uuid not null,
  to_warehouse_id     uuid not null,
  status              text not null default 'DRAFT' check (status in ('DRAFT', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')),
  reason              text,
  created_by          uuid references public.user_profiles(id),
  dispatched_by       uuid references public.user_profiles(id),
  dispatched_at       timestamptz,
  completed_by        uuid references public.user_profiles(id),
  completed_at        timestamptz,
  cancelled_by        uuid references public.user_profiles(id),
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (from_warehouse_id, from_location_id) references public.warehouses(id, location_id),
  foreign key (to_warehouse_id, to_location_id) references public.warehouses(id, location_id),
  check (from_warehouse_id <> to_warehouse_id)
);
create index stock_transfers_status_idx on public.stock_transfers(status);

-- ---------------------------------------------------------------------------
-- Planning
-- ---------------------------------------------------------------------------
create sequence public.plan_no_seq start 1;

create table public.plans (
  id                     uuid primary key default gen_random_uuid(),
  plan_no                text not null unique default ('PLN-' || lpad(nextval('public.plan_no_seq')::text, 6, '0')),
  product_id             uuid not null references public.materials(id),
  location_id            uuid not null references public.locations(id),
  warehouse_id           uuid not null,
  bom_id                 uuid not null references public.boms(id),
  target_qty             numeric(18,4) not null check (target_qty > 0),
  executed_qty           numeric(18,4) not null default 0 check (executed_qty >= 0),
  remaining_qty          numeric(18,4) generated always as (greatest(target_qty - executed_qty, 0)) stored,
  apply_scrap_allowance  boolean not null default true,
  status                 text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  required_date          date,
  notes                  text,
  created_by             uuid references public.user_profiles(id),
  updated_by             uuid references public.user_profiles(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  foreign key (warehouse_id, location_id) references public.warehouses(id, location_id)
);
create index plans_scope_idx on public.plans(location_id, status);

-- Plan edit history (target changes etc.)
create table public.plan_events (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.plans(id) on delete cascade,
  event       text not null,
  old_value   jsonb,
  new_value   jsonb,
  user_id     uuid references public.user_profiles(id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Manufacturing execution
-- ---------------------------------------------------------------------------
create sequence public.batch_no_seq start 1;

create table public.batches (
  id                  uuid primary key default gen_random_uuid(),
  batch_no            text not null,
  source              text not null check (source in ('PLAN', 'AD_HOC')),
  plan_id             uuid references public.plans(id),
  product_id          uuid not null references public.materials(id),
  output_mpn_id       uuid not null,
  bom_id              uuid references public.boms(id),
  location_id         uuid not null references public.locations(id),
  warehouse_id        uuid not null,
  mfg_date            date not null,
  expiry_date         date,
  executed_by         text not null,
  plan_output_qty     numeric(18,4) not null default 0 check (plan_output_qty >= 0),
  actual_output_qty   numeric(18,4) not null check (actual_output_qty > 0),
  variance_qty        numeric(18,4) generated always as (actual_output_qty - plan_output_qty) stored,
  variance_pct        numeric(9,3) generated always as (
                        case when plan_output_qty > 0
                             then round((actual_output_qty - plan_output_qty) / plan_output_qty * 100, 3)
                             else 0 end) stored,
  variance_reason     text,
  output_uom          text not null,
  tolerance_override  boolean not null default false,
  status              text not null default 'COMPLETED' check (status in ('COMPLETED')),
  created_by          uuid references public.user_profiles(id),
  updated_by          uuid references public.user_profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (output_mpn_id, product_id) references public.mpns(id, material_id),
  foreign key (warehouse_id, location_id) references public.warehouses(id, location_id),
  unique (product_id, batch_no),
  check ((source = 'PLAN') = (plan_id is not null)),
  check (expiry_date is null or expiry_date >= mfg_date)
);
create index batches_plan_idx on public.batches(plan_id);
create index batches_scope_idx on public.batches(location_id, created_at desc);

create table public.batch_inputs (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references public.batches(id) on delete cascade,
  material_id       uuid not null references public.materials(id),
  mpn_id            uuid not null,
  lot_no            text not null,
  warehouse_id      uuid not null references public.warehouses(id),
  plan_input_qty    numeric(18,4) not null default 0 check (plan_input_qty >= 0),
  actual_input_qty  numeric(18,4) not null check (actual_input_qty >= 0),
  variance_qty      numeric(18,4) generated always as (actual_input_qty - plan_input_qty) stored,
  variance_pct      numeric(9,3) generated always as (
                      case when plan_input_qty > 0
                           then round((actual_input_qty - plan_input_qty) / plan_input_qty * 100, 3)
                           else 0 end) stored,
  variance_reason   text,
  uom               text not null,
  foreign key (mpn_id, material_id) references public.mpns(id, material_id),
  unique (batch_id, mpn_id, lot_no)
);
create index batch_inputs_lot_idx on public.batch_inputs(mpn_id, lot_no);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['companies','locations','warehouses','vendors','materials','mpns','boms',
                           'inventory','stock_transfers','plans','batches','app_settings']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function erp.touch_updated_at()',
                   t || '_touch_updated_at', t);
  end loop;
end $$;
