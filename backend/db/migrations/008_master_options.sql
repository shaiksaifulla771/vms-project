-- ===========================================================================
-- 008  Master data option lists (v5)
--   * Categories belong to a classification (sub-categories follow their parent)
--   * UOM master list; UOM columns must use a listed UOM
--   * Starter categories and UOMs (added only when missing)
-- Additive only: existing rows keep their values.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- UOM master
-- ---------------------------------------------------------------------------
create table public.uoms (
  code        text primary key check (length(trim(code)) > 0 and code = trim(code)),
  name        text not null check (length(trim(name)) > 0),
  uom_type    text not null default 'OTHER' check (uom_type in ('WEIGHT', 'VOLUME', 'COUNT', 'LENGTH', 'OTHER')),
  status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  sort_order  integer not null default 1000,
  created_by  uuid references public.user_profiles(id),
  updated_by  uuid references public.user_profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index uoms_code_ci_uq on public.uoms (lower(code));

insert into public.uoms (code, name, uom_type, sort_order) values
  ('kg', 'Kilogram', 'WEIGHT', 10), ('g', 'Gram', 'WEIGHT', 20), ('mg', 'Milligram', 'WEIGHT', 30), ('ton', 'Tonne', 'WEIGHT', 40),
  ('ltr', 'Litre', 'VOLUME', 50), ('ml', 'Millilitre', 'VOLUME', 60),
  ('pcs', 'Pieces', 'COUNT', 70), ('nos', 'Numbers', 'COUNT', 80), ('box', 'Box', 'COUNT', 90), ('carton', 'Carton', 'COUNT', 100),
  ('pack', 'Pack', 'COUNT', 110), ('bag', 'Bag', 'COUNT', 120), ('roll', 'Roll', 'COUNT', 130), ('dozen', 'Dozen', 'COUNT', 140),
  ('m', 'Metre', 'LENGTH', 150), ('cm', 'Centimetre', 'LENGTH', 160)
on conflict do nothing;

-- Keep every UOM already used, exactly as written, so no existing record breaks.
insert into public.uoms (code, name, uom_type, sort_order)
select distinct on (lower(u)) u, u, 'OTHER', 900
  from (
    select trim(uom) u from public.materials
    union all select trim(uom) from public.mpn_vendors where uom is not null
    union all select trim(batch_uom) from public.boms
    union all select trim(output_uom) from public.boms
    union all select trim(uom) from public.bom_lines
  ) x
 where u is not null and u <> ''
   and not exists (select 1 from public.uoms k where lower(k.code) = lower(x.u))
 order by lower(u), u;

-- A UOM column may only hold a listed UOM (case-insensitive). Unchanged values are not re-checked.
create or replace function erp.check_uom() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare col text; val text;
begin
  foreach col in array tg_argv loop
    val := to_jsonb(new) ->> col;
    if val is null then continue; end if;
    if tg_op = 'UPDATE' and val is not distinct from (to_jsonb(old) ->> col) then continue; end if;
    if not exists (select 1 from public.uoms where lower(code) = lower(trim(val))) then
      raise exception 'Unknown UOM "%". Add it under Settings > UOMs first.', val using errcode = 'P0001';
    end if;
  end loop;
  return new;
end $$;

create trigger materials_uom_check before insert or update of uom on public.materials
  for each row execute function erp.check_uom('uom');
create trigger mpn_vendors_uom_check before insert or update of uom on public.mpn_vendors
  for each row execute function erp.check_uom('uom');
create trigger boms_uom_check before insert or update of batch_uom, output_uom on public.boms
  for each row execute function erp.check_uom('batch_uom', 'output_uom');
create trigger bom_lines_uom_check before insert or update of uom on public.bom_lines
  for each row execute function erp.check_uom('uom');

-- A UOM that is in use cannot be deleted (it can be set Inactive).
create or replace function erp.guard_uom_delete() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare in_use boolean;
begin
  if tg_op = 'UPDATE' and new.code = old.code then return new; end if;
  in_use := exists (select 1 from public.materials where lower(uom) = lower(old.code))
     or exists (select 1 from public.mpn_vendors where lower(uom) = lower(old.code))
     or exists (select 1 from public.boms where lower(batch_uom) = lower(old.code) or lower(output_uom) = lower(old.code))
     or exists (select 1 from public.bom_lines where lower(uom) = lower(old.code));
  if in_use and tg_op = 'DELETE' then
    raise exception 'UOM "%" is in use', old.code using errcode = '23503';
  end if;
  if in_use then
    raise exception 'UOM "%" is in use, so its code cannot be changed', old.code using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger uoms_guard before delete or update of code on public.uoms
  for each row execute function erp.guard_uom_delete();
create trigger uoms_touch_updated_at before update on public.uoms
  for each row execute function erp.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Categories per classification
-- ---------------------------------------------------------------------------
alter table public.material_categories
  add column classification text check (classification is null or classification in
    ('RAW_MATERIAL', 'PACKAGING', 'CONSUMABLE', 'SEMI_FINISHED', 'FINISHED_GOOD'));
create index material_categories_class_idx on public.material_categories(classification);

-- Sub-categories always carry their parent's classification.
create or replace function erp.sync_category_classification() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.parent_id is not null then
    select classification into new.classification from public.material_categories where id = new.parent_id;
  elsif new.classification is not null and exists (
      select 1 from public.materials m
       where (m.category_id = new.id or m.sub_category_id in (select id from public.material_categories where parent_id = new.id))
         and m.classification <> new.classification) then
    raise exception 'Materials of another classification use this category. Change them first.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger material_categories_class before insert or update of parent_id, classification on public.material_categories
  for each row execute function erp.sync_category_classification();

create or replace function erp.cascade_category_classification() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.parent_id is null and new.classification is distinct from old.classification then
    update public.material_categories set classification = new.classification where parent_id = new.id;
  end if;
  return null;
end $$;
create trigger material_categories_class_cascade after update of classification on public.material_categories
  for each row execute function erp.cascade_category_classification();

-- Material: category must be top-level, match the material's classification; sub-category under the category.
create or replace function erp.check_material_category() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare cat record;
begin
  if new.category_id is not null then
    select parent_id, classification, name into cat from public.material_categories where id = new.category_id;
    if cat.parent_id is not null then
      raise exception 'Category must be a top-level category' using errcode = 'P0001';
    end if;
    if cat.classification is not null and cat.classification <> new.classification then
      raise exception 'Category "%" is not for %', cat.name, lower(replace(new.classification, '_', ' ')) using errcode = 'P0001';
    end if;
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
drop trigger materials_category_check on public.materials;
create trigger materials_category_check before insert or update of category_id, sub_category_id, classification on public.materials
  for each row execute function erp.check_material_category();

-- Existing categories: take the classification of the materials that use them, when they all agree.
with used as (
  select coalesce(c.parent_id, c.id) as top_id, m.classification
    from public.materials m
    join public.material_categories c on c.id in (m.category_id, m.sub_category_id)
), one as (
  select top_id, min(classification) cls from used group by top_id having count(distinct classification) = 1
)
update public.material_categories t set classification = one.cls
  from one where t.id = one.top_id and t.parent_id is null and t.classification is null;

-- Starter categories (only names that do not exist yet; existing ones are never renamed).
create temporary table starter_categories (cls text, cat text, subs text[]) on commit drop;
insert into starter_categories values
  ('RAW_MATERIAL',  'Grains & Pulses',      array['Rice', 'Lentils & Dals', 'Millets', 'Flours']),
  ('RAW_MATERIAL',  'Spices & Seasoning',   array['Whole Spices', 'Ground Spices', 'Salt', 'Spice Blends']),
  ('RAW_MATERIAL',  'Oils & Fats',          array['Edible Oils', 'Ghee & Butter']),
  ('RAW_MATERIAL',  'Dairy',                array['Milk Powder', 'Milk Solids']),
  ('RAW_MATERIAL',  'Sweeteners',           array['Sugar', 'Jaggery']),
  ('RAW_MATERIAL',  'Food Additives',       array['Preservatives', 'Colours', 'Flavours']),
  ('PACKAGING',     'Primary Packaging',    array['Pouches', 'Laminate Film', 'Bottles & Jars', 'Labels']),
  ('PACKAGING',     'Secondary Packaging',  array['Cartons', 'Shrink Wrap']),
  ('PACKAGING',     'Tertiary Packaging',   array['Pallets', 'Stretch Film']),
  ('CONSUMABLE',    'Packing Consumables',  array['Tapes', 'Strapping']),
  ('CONSUMABLE',    'Cleaning & Hygiene',   array['Detergents', 'Sanitizers']),
  ('CONSUMABLE',    'Lab & QC',             array['Reagents', 'Test Kits']),
  ('CONSUMABLE',    'Maintenance',          array['Spares', 'Lubricants']),
  ('SEMI_FINISHED', 'Premixes',             array['Dry Premix', 'Wet Premix']),
  ('SEMI_FINISHED', 'Intermediates',        array['Blends', 'Slurries']),
  ('FINISHED_GOOD', 'Ready-to-Cook Mixes',  array['Rice Mixes', 'Breakfast Mixes']),
  ('FINISHED_GOOD', 'Ready-to-Eat',         array['Snacks', 'Meals']),
  ('FINISHED_GOOD', 'Spices & Masalas',     array['Blended Masalas', 'Pure Spices']);

insert into public.material_categories (name, classification)
select s.cat, s.cls from starter_categories s
 where not exists (select 1 from public.material_categories c where c.parent_id is null and lower(trim(c.name)) = lower(s.cat));

-- Sub-categories only under the starter categories just added (existing categories are left as they are).
insert into public.material_categories (name, parent_id)
select sub, c.id
  from starter_categories s
  join public.material_categories c on c.parent_id is null and c.name = s.cat and c.classification = s.cls
  cross join lateral unnest(s.subs) sub
 where not exists (select 1 from public.material_categories x where x.parent_id = c.id)
   and c.created_at = now();

-- ---------------------------------------------------------------------------
-- RLS / privileges (the API connects as the table owner; client roles get nothing)
-- ---------------------------------------------------------------------------
alter table public.uoms enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on public.uoms from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on public.uoms from authenticated'; end if;
end $$;
revoke all on function erp.check_uom(), erp.guard_uom_delete(), erp.sync_category_classification(),
                       erp.cascade_category_classification() from public;
