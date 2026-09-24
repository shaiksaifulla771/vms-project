-- ===========================================================================
-- 009  UOM is a fixed dropdown list (no separate settings screen)
--   * More units: packet, pouch, sachet, bottle, jar, can, tin, tray, case, ...
--   * Clearer message when a UOM is not in the list
-- Additive only.
-- ===========================================================================

insert into public.uoms (code, name, uom_type, sort_order) values
  ('quintal', 'Quintal (100 kg)', 'WEIGHT', 45),
  ('packet', 'Packet', 'COUNT', 72), ('pouch', 'Pouch', 'COUNT', 74), ('sachet', 'Sachet', 'COUNT', 76),
  ('bottle', 'Bottle', 'COUNT', 122), ('jar', 'Jar', 'COUNT', 124), ('can', 'Can', 'COUNT', 126), ('tin', 'Tin', 'COUNT', 128),
  ('tray', 'Tray', 'COUNT', 132), ('case', 'Case', 'COUNT', 134), ('bundle', 'Bundle', 'COUNT', 136),
  ('set', 'Set', 'COUNT', 142), ('pair', 'Pair', 'COUNT', 144), ('sheet', 'Sheet', 'COUNT', 146),
  ('mm', 'Millimetre', 'LENGTH', 170)
on conflict do nothing;

create or replace function erp.check_uom() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare col text; val text;
begin
  foreach col in array tg_argv loop
    val := to_jsonb(new) ->> col;
    if val is null then continue; end if;
    if tg_op = 'UPDATE' and val is not distinct from (to_jsonb(old) ->> col) then continue; end if;
    if not exists (select 1 from public.uoms where lower(code) = lower(trim(val))) then
      raise exception 'UOM "%" is not in the UOM list. Pick one from the dropdown.', val using errcode = 'P0001';
    end if;
  end loop;
  return new;
end $$;
revoke all on function erp.check_uom() from public;
