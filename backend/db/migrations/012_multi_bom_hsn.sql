-- ===========================================================================
-- 012  v10: multiple active BOMs per product + location, HSN code on MPN
--   * boms.name, boms.is_default, boms.revised_from_bom_id
--   * several ACTIVE BOMs may exist side by side; at most one is the Default
--   * mpns.hsn_code (4, 6 or 8 digits, optional)
-- Additive only: existing BOMs, plans and batches are unchanged.
-- ===========================================================================

alter table public.boms add column if not exists name text;
alter table public.boms add column if not exists is_default boolean not null default false;
alter table public.boms add column if not exists revised_from_bom_id uuid references public.boms(id);

-- Every BOM that is active today becomes the Default of its product + location.
update public.boms set is_default = true where status = 'ACTIVE';

drop index if exists public.boms_one_active;
create unique index if not exists boms_one_default
  on public.boms(product_id, location_id) where is_default and status = 'ACTIVE';
create index if not exists boms_location_status_idx on public.boms(location_id, status);

alter table public.boms drop constraint if exists boms_default_is_active;
alter table public.boms add constraint boms_default_is_active check (not is_default or status = 'ACTIVE');
alter table public.boms drop constraint if exists boms_name_len;
alter table public.boms add constraint boms_name_len check (name is null or length(name) <= 100);

alter table public.mpns add column if not exists hsn_code text;
alter table public.mpns drop constraint if exists mpns_hsn_format;
alter table public.mpns add constraint mpns_hsn_format check (hsn_code is null or hsn_code ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})$');
