-- ============================================================================
-- 007  Physical stock counts + plans by number of batches (additive only)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Plans: plan by quantity (existing) or by number of batches (new)
-- ---------------------------------------------------------------------------
alter table public.plans
  add column plan_mode      text not null default 'QTY' check (plan_mode in ('QTY', 'BATCHES')),
  add column target_batches integer check (target_batches is null or target_batches > 0),
  add constraint plans_batches_mode_chk check (plan_mode = 'QTY' or target_batches is not null);

-- ---------------------------------------------------------------------------
-- Physical stock count: snapshot -> count -> submit -> admin approval -> post
-- Stock changes only on approval, through erp.post_stock (reference STOCK_COUNT).
-- ---------------------------------------------------------------------------
create sequence public.stock_count_no_seq start 1;

create table public.stock_counts (
  id               uuid primary key default gen_random_uuid(),
  count_no         text not null unique default ('CNT-' || lpad(nextval('public.stock_count_no_seq')::text, 6, '0')),
  location_id      uuid not null references public.locations(id),
  warehouse_id     uuid,                                   -- null = every warehouse of the location
  classification   text check (classification is null or classification in
                     ('RAW_MATERIAL', 'PACKAGING', 'CONSUMABLE', 'SEMI_FINISHED', 'FINISHED_GOOD')),
  category_id      uuid references public.material_categories(id),
  blind            boolean not null default false,        -- hide system qty from counters
  status           text not null default 'DRAFT'
                     check (status in ('DRAFT', 'COUNTING', 'SUBMITTED', 'POSTED', 'CANCELLED')),
  notes            text,
  counted_by       text,
  return_comment   text,
  snapshot_at      timestamptz not null default now(),
  submitted_by     uuid references public.user_profiles(id),
  submitted_at     timestamptz,
  approved_by      uuid references public.user_profiles(id),
  approved_at      timestamptz,
  cancelled_by     uuid references public.user_profiles(id),
  cancelled_at     timestamptz,
  created_by       uuid references public.user_profiles(id),
  updated_by       uuid references public.user_profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (warehouse_id, location_id) references public.warehouses(id, location_id)
);
create index stock_counts_scope_idx on public.stock_counts(location_id, status);

create table public.stock_count_lines (
  id               uuid primary key default gen_random_uuid(),
  count_id         uuid not null references public.stock_counts(id) on delete cascade,
  line_no          integer not null,
  inventory_id     uuid not null references public.inventory(id),
  snapshot_qty     numeric(18,4) not null,
  counted_qty      numeric(18,4) check (counted_qty is null or counted_qty >= 0),
  variance_qty     numeric(18,4) generated always as (counted_qty - snapshot_qty) stored,
  reason_code      text check (reason_code is null or reason_code in
                     ('DAMAGED', 'EXPIRED', 'SPILLAGE', 'COUNT_ERROR', 'THEFT', 'FOUND_EXTRA', 'OTHER')),
  reason_note      text,
  posted_qty       numeric(18,4),                          -- qty change posted on approval
  ledger_id        uuid,
  updated_at       timestamptz not null default now(),
  unique (count_id, inventory_id),
  unique (count_id, line_no)
);
create index stock_count_lines_inventory_idx on public.stock_count_lines(inventory_id);
create index stock_counts_category_idx on public.stock_counts(category_id);
create index stock_counts_created_by_idx on public.stock_counts(created_by);
create index stock_counts_submitted_by_idx on public.stock_counts(submitted_by);
create index stock_counts_approved_by_idx on public.stock_counts(approved_by);
create index stock_counts_cancelled_by_idx on public.stock_counts(cancelled_by);
create index stock_counts_updated_by_idx on public.stock_counts(updated_by);
create index stock_counts_wh_idx on public.stock_counts(warehouse_id, location_id);

-- A posted count is a permanent record
create or replace function erp.guard_posted_count() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'POSTED' then raise exception 'A posted stock count cannot be deleted' using errcode = 'P0001'; end if;
    return old;
  end if;
  if old.status in ('POSTED', 'CANCELLED') and new.status is distinct from old.status then
    raise exception 'Stock count % is % and cannot change', old.count_no, lower(old.status) using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger stock_counts_guard before update or delete on public.stock_counts
  for each row execute function erp.guard_posted_count();

create trigger stock_counts_touch_updated_at before update on public.stock_counts
  for each row execute function erp.touch_updated_at();
create trigger stock_count_lines_touch_updated_at before update on public.stock_count_lines
  for each row execute function erp.touch_updated_at();

alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.stock_counts, public.stock_count_lines from anon';
    execute 'revoke all on sequence public.stock_count_no_seq from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.stock_counts, public.stock_count_lines from authenticated';
    execute 'revoke all on sequence public.stock_count_no_seq from authenticated';
  end if;
end $$;
revoke all on function erp.guard_posted_count() from public;
