-- ============================================================================
-- 006  Master data v3 (additive only - nothing existing is dropped or renamed)
--   * Auto codes: Material M1001.., Vendor V1001.., MPN MPN1001.. (never reused)
--   * Codes are immutable once assigned
--   * Material categories / sub-categories, material description
--   * Vendor: FSSAI, addresses, contact directory, bank accounts, supplied materials
--   * MPN-vendor commercial terms (UOM, MOQ, price) + price history
--   * BOM header costs (packing, processing, overhead, freight), line price / notes
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Auto-numbering. Sequences never hand out a number twice, so a code is never
-- reused even after a delete or a rolled-back insert. Existing codes are kept;
-- sequences start after the highest code already in the new format.
-- ---------------------------------------------------------------------------
create sequence if not exists public.material_code_seq minvalue 1001 start 1001;
create sequence if not exists public.vendor_code_seq   minvalue 1001 start 1001;
create sequence if not exists public.mpn_code_seq      minvalue 1001 start 1001;

select setval('public.material_code_seq',
  greatest(1001, coalesce((select max(substring(code from 2)::bigint) + 1 from public.materials where code ~ '^M[0-9]{1,15}$'), 1001)), false);
select setval('public.vendor_code_seq',
  greatest(1001, coalesce((select max(substring(code from 2)::bigint) + 1 from public.vendors where code ~ '^V[0-9]{1,15}$'), 1001)), false);
select setval('public.mpn_code_seq',
  greatest(1001, coalesce((select max(substring(mpn_code from 4)::bigint) + 1 from public.mpns where mpn_code ~ '^MPN[0-9]{1,15}$'), 1001)), false);

-- Codes are assigned by a BEFORE INSERT trigger: leave the code empty and the next number is taken.
-- A hand-typed code in the auto format (e.g. M1234) is rejected, so numbers can never be reused or collide.
-- Legacy codes in other formats (RM-SUGAR, V-147297F8) are still accepted for imports and old data.
create or replace function erp.assign_auto_code() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  col    text := tg_argv[0];
  prefix text := tg_argv[1];
  seq    text := tg_argv[2];
  val    text;
  old_val text;
begin
  val := to_jsonb(new) ->> col;
  if tg_op = 'UPDATE' then
    old_val := to_jsonb(old) ->> col;
    if val is distinct from old_val then
      raise exception 'Code % cannot be changed once assigned', old_val using errcode = 'P0001';
    end if;
    return new;
  end if;
  if val is null or trim(val) = '' then
    val := prefix || nextval('public.' || seq);
  elsif upper(trim(val)) ~ ('^' || prefix || '[0-9]+$') then
    raise exception '% codes are assigned automatically; leave the code empty', prefix using errcode = 'P0001';
  end if;
  new := jsonb_populate_record(new, jsonb_build_object(col, val));
  return new;
end $$;

create trigger materials_code_guard before insert or update of code on public.materials
  for each row execute function erp.assign_auto_code('code', 'M', 'material_code_seq');
create trigger vendors_code_guard before insert or update of code on public.vendors
  for each row execute function erp.assign_auto_code('code', 'V', 'vendor_code_seq');
create trigger mpns_code_guard before insert or update of mpn_code on public.mpns
  for each row execute function erp.assign_auto_code('mpn_code', 'MPN', 'mpn_code_seq');

-- ---------------------------------------------------------------------------
-- Material categories (two levels: category -> sub-category)
-- ---------------------------------------------------------------------------
create table public.material_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  parent_id   uuid references public.material_categories(id),
  status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_by  uuid references public.user_profiles(id),
  updated_by  uuid references public.user_profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index material_categories_name_uq
  on public.material_categories (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)));
create index material_categories_parent_idx on public.material_categories(parent_id);

-- Only two levels
create or replace function erp.check_category_depth() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception 'A category cannot be its own parent' using errcode = 'P0001'; end if;
    if exists (select 1 from public.material_categories where id = new.parent_id and parent_id is not null) then
      raise exception 'Sub-categories cannot have their own sub-categories' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.material_categories where parent_id = new.id) then
      raise exception 'This category has sub-categories, so it cannot become a sub-category' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger material_categories_depth before insert or update of parent_id on public.material_categories
  for each row execute function erp.check_category_depth();

alter table public.materials
  add column category_id     uuid references public.material_categories(id),
  add column sub_category_id uuid references public.material_categories(id),
  add column description     text;
create index materials_category_idx on public.materials(category_id);
create index materials_sub_category_idx on public.materials(sub_category_id);

-- Sub-category must belong to the chosen category
create or replace function erp.check_material_category() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.category_id is not null and exists (select 1 from public.material_categories where id = new.category_id and parent_id is not null) then
    raise exception 'Category must be a top-level category' using errcode = 'P0001';
  end if;
  if new.sub_category_id is not null then
    if new.category_id is null then
      raise exception 'Choose a category before a sub-category' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.material_categories where id = new.sub_category_id and parent_id = new.category_id) then
      raise exception 'Sub-category does not belong to the selected category' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger materials_category_check before insert or update of category_id, sub_category_id on public.materials
  for each row execute function erp.check_material_category();

-- ---------------------------------------------------------------------------
-- Vendor details
-- ---------------------------------------------------------------------------
alter table public.vendors
  add column fssai_no     text,
  add column fssai_expiry date;

create table public.vendor_addresses (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors(id) on delete cascade,
  address_name  text not null check (length(trim(address_name)) > 0),
  address_type  text not null default 'PRIMARY' check (address_type in ('PRIMARY', 'SECONDARY')),
  is_default    boolean not null default false,
  line1         text,
  line2         text,
  city          text,
  state         text,
  pincode       text,
  country       text default 'India',
  gstin         text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index vendor_addresses_vendor_idx on public.vendor_addresses(vendor_id);
create unique index vendor_addresses_one_default on public.vendor_addresses(vendor_id) where is_default;

create table public.vendor_contacts (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references public.vendors(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  designation  text,
  phone        text,
  email        text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index vendor_contacts_vendor_idx on public.vendor_contacts(vendor_id);

create table public.vendor_bank_accounts (
  id               uuid primary key default gen_random_uuid(),
  vendor_id        uuid not null references public.vendors(id) on delete cascade,
  account_holder   text not null check (length(trim(account_holder)) > 0),
  account_number   text not null check (account_number ~ '^[0-9]{6,20}$'),
  ifsc             text not null check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name        text,
  branch           text,
  is_primary       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index vendor_bank_accounts_vendor_idx on public.vendor_bank_accounts(vendor_id);
create unique index vendor_bank_accounts_one_primary on public.vendor_bank_accounts(vendor_id) where is_primary;

-- Which materials a vendor supplies (sourcing link; MPNs carry price/MOQ)
create table public.vendor_materials (
  vendor_id    uuid not null references public.vendors(id) on delete cascade,
  material_id  uuid not null references public.materials(id) on delete cascade,
  created_by   uuid references public.user_profiles(id),
  created_at   timestamptz not null default now(),
  primary key (vendor_id, material_id)
);
create index vendor_materials_material_idx on public.vendor_materials(material_id);

-- Carry the single address that vendors had so far into the new address book
insert into public.vendor_addresses (vendor_id, address_name, address_type, is_default, line1, city, state, country, gstin)
select id, 'Head Office', 'PRIMARY', true, address, city, state, coalesce(country, 'India'), gstin
  from public.vendors
 where coalesce(address, city, state) is not null
   and not exists (select 1 from public.vendor_addresses a where a.vendor_id = vendors.id);

-- Existing MPN-vendor links imply the vendor supplies that material
insert into public.vendor_materials (vendor_id, material_id)
select distinct mv.vendor_id, p.material_id
  from public.mpn_vendors mv join public.mpns p on p.id = mv.mpn_id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- MPN-vendor commercial terms + price history
-- ---------------------------------------------------------------------------
alter table public.mpn_vendors
  add column uom               text,
  add column moq               numeric(18,4) check (moq is null or moq > 0),
  add column price             numeric(18,4) check (price is null or price >= 0),
  add column currency          text not null default 'INR',
  add column price_updated_at  timestamptz,
  add column updated_at        timestamptz not null default now();

create table public.mpn_price_history (
  id              uuid primary key default gen_random_uuid(),
  mpn_vendor_id   uuid not null references public.mpn_vendors(id) on delete cascade,
  old_price       numeric(18,4),
  new_price       numeric(18,4),
  old_moq         numeric(18,4),
  new_moq         numeric(18,4),
  changed_by      uuid references public.user_profiles(id),
  changed_at      timestamptz not null default now()
);
create index mpn_price_history_mv_idx on public.mpn_price_history(mpn_vendor_id, changed_at desc);

create or replace function erp.log_mpn_price() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if new.price is not null or new.moq is not null then
      new.price_updated_at := now();
    end if;
    return new;
  end if;
  if new.price is distinct from old.price or new.moq is distinct from old.moq then
    new.price_updated_at := now();
    insert into public.mpn_price_history (mpn_vendor_id, old_price, new_price, old_moq, new_moq, changed_by)
    values (new.id, old.price, new.price, old.moq, new.moq,
            nullif(current_setting('erp.user_id', true), '')::uuid);
  end if;
  return new;
end $$;
create trigger mpn_vendors_price_log before insert or update on public.mpn_vendors
  for each row execute function erp.log_mpn_price();

-- ---------------------------------------------------------------------------
-- BOM costing
-- ---------------------------------------------------------------------------
alter table public.boms
  add column packing_cost     numeric(18,2) not null default 0 check (packing_cost >= 0),
  add column processing_cost  numeric(18,2) not null default 0 check (processing_cost >= 0),
  add column overhead_cost    numeric(18,2) not null default 0 check (overhead_cost >= 0),
  add column freight_cost     numeric(18,2) not null default 0 check (freight_cost >= 0),
  add column scaled_from_bom_id uuid references public.boms(id);
create index boms_scaled_from_idx on public.boms(scaled_from_bom_id);

alter table public.bom_lines
  add column unit_price  numeric(18,4) check (unit_price is null or unit_price >= 0),  -- override; null = use MPN price
  add column notes       text;

-- ---------------------------------------------------------------------------
-- updated_at triggers, RLS, privileges for the new tables
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['material_categories','vendor_addresses','vendor_contacts','vendor_bank_accounts','mpn_vendors']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function erp.touch_updated_at()',
                   t || '_touch_updated_at', t);
  end loop;
  foreach t in array array['material_categories','vendor_addresses','vendor_contacts','vendor_bank_accounts',
                           'vendor_materials','mpn_price_history']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.material_categories, public.vendor_addresses, public.vendor_contacts,
             public.vendor_bank_accounts, public.vendor_materials, public.mpn_price_history from anon';
    execute 'revoke all on sequence public.material_code_seq, public.vendor_code_seq, public.mpn_code_seq from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.material_categories, public.vendor_addresses, public.vendor_contacts,
             public.vendor_bank_accounts, public.vendor_materials, public.mpn_price_history from authenticated';
    execute 'revoke all on sequence public.material_code_seq, public.vendor_code_seq, public.mpn_code_seq from authenticated';
  end if;
end $$;

revoke all on function erp.assign_auto_code(), erp.check_category_depth(), erp.check_material_category(),
                       erp.log_mpn_price() from public;
