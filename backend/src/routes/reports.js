const router = require('express').Router();
const { query } = require('../db/pool');
const { h, where } = require('../utils/http');
const { badRequest } = require('../utils/errors');
const v = require('../utils/validate');

// Stock Balance Sheet: current inventory grouped by Location / WH (lot level)
router.get('/stock-balance', h(async (req, res) => {
  const { clause, params } = where([
    ['s.location_id = ?', req.scope.locationId],
    ['s.warehouse_id = ?', req.scope.warehouseId],
    ['s.classification = ?', req.query.classification],
    ['s.quantity > ?', req.query.include_zero === 'true' ? null : 0],
  ]);
  const { rows } = await query(`
    select s.location_code, s.location_name, s.warehouse_code, s.warehouse_name,
           case when s.classification = 'FINISHED_GOOD' then null else s.mpn_code end as mpn_code, s.material_code,
           s.material_name, s.classification, s.lot_no, s.quantity, s.uom, s.mfg_date, s.expiry_date, s.is_expired, s.vendor_name
      from public.v_stock s ${clause}
     order by s.location_code, s.warehouse_code, s.material_code, s.lot_no`, params);
  res.json(rows);
}));

/**
 * Reorder alerts: active materials with a reorder level whose usable stock (not expired) minus what open plans
 * still need is at or below that level. Location from the top selector, else all locations.
 */
router.get('/reorder', h(async (req, res) => {
  const loc = req.scope.locationId || null;
  const { rows } = await query(`
    with stock as (
      select material_id, sum(quantity) as qty from public.inventory
       where quantity > 0 and (expiry_date is null or expiry_date >= current_date) and ($1::uuid is null or location_id = $1)
       group by material_id),
    need as (
      select bl.material_id,
             sum(bl.qty_per_batch * x.batches
                 * case when p.apply_scrap_allowance then 1 + bl.scrap_allowance_pct / 100 else 1 end) as qty
        from public.plans p
        join public.boms b on b.id = p.bom_id
        join public.bom_lines bl on bl.bom_id = b.id
        cross join lateral (select case when p.plan_mode = 'BATCHES'
                                        then greatest(p.target_batches - (select count(*) from public.batches x
                                                                           where x.plan_id = p.id and x.status <> 'REVERSED'), 0)
                                        else ceil(round(p.remaining_qty / b.expected_output_qty, 4)) end as batches) x
       where p.status in ('OPEN', 'IN_PROGRESS') and ($1::uuid is null or p.location_id = $1)
       group by bl.material_id)
    select m.id as material_id, m.code as material_code, m.name as material_name, m.classification, m.uom,
           m.reorder_level::float as reorder_level, coalesce(s.qty, 0)::float as stock_qty, coalesce(n.qty, 0)::float as plan_need_qty,
           round(coalesce(s.qty, 0) - coalesce(n.qty, 0), 4)::float as free_qty,
           round(m.reorder_level - (coalesce(s.qty, 0) - coalesce(n.qty, 0)), 4)::float as to_order_qty,
           (select ve.name from public.mpns mp join public.mpn_vendors mv on mv.mpn_id = mp.id join public.vendors ve on ve.id = mv.vendor_id
             where mp.material_id = m.id order by mv.is_preferred desc, ve.name limit 1) as vendor_name
      from public.materials m
      left join stock s on s.material_id = m.id
      left join need n on n.material_id = m.id
     where m.status = 'ACTIVE' and m.reorder_level is not null
       and coalesce(s.qty, 0) - coalesce(n.qty, 0) <= m.reorder_level
     order by m.code`, [loc]);
  res.json(rows);
}));

// Physical Stock Sheet (printable): system qty per lot; physical qty is filled on paper
router.get('/physical-stock-sheet', h(async (req, res) => {
  const { clause, params } = where([
    ['s.location_id = ?', req.scope.locationId],
    ['s.warehouse_id = ?', req.scope.warehouseId],
    ['s.quantity > ?', req.query.include_zero === 'true' ? null : 0],
  ]);
  const { rows } = await query(`
    select s.id as inventory_id, s.location_code, s.warehouse_code,
           case when s.classification = 'FINISHED_GOOD' then null else s.mpn_code end as mpn_code, s.classification, s.material_code, s.material_name, s.lot_no,
           s.quantity as system_qty, s.uom, s.expiry_date
      from public.v_stock s ${clause}
     order by s.location_code, s.warehouse_code, s.mpn_code, s.lot_no`, params);
  res.json(rows);
}));

// Lot search for traceability
router.get('/lots', h(async (req, res) => {
  const q = v.str(req.query.q, 'Search', { required: true, max: 100 });
  const { rows } = await query(`
    select distinct on (s.mpn_id, s.lot_no) s.mpn_id, s.lot_no, p.mpn_code, m.code as material_code, m.name as material_name,
           m.classification
      from public.stock_ledger s
      join public.mpns p on p.id = s.mpn_id
      join public.materials m on m.id = s.material_id
     where s.lot_no ilike $1 or p.mpn_code ilike $1 or m.code ilike $1 or m.name ilike $1
     order by s.mpn_id, s.lot_no limit 100`, [`%${q}%`]);
  res.json(rows);
}));

async function lotInfo(mpnId, lotNo) {
  const r = await query(`
    select p.id as mpn_id, p.mpn_code, m.id as material_id, m.code as material_code, m.name as material_name, m.classification,
           $2::text as lot_no,
           (select sum(quantity) from public.inventory i where i.mpn_id = p.id and i.lot_no = $2) as on_hand
      from public.mpns p join public.materials m on m.id = p.material_id where p.id = $1`, [mpnId, lotNo]);
  return r.rows[0] || null;
}

/** Backward: FG lot -> batch -> RM lots consumed (recursive for semi-finished inputs). */
async function traceBackward(mpnId, lotNo, depth, seen) {
  const key = `${mpnId}|${lotNo}`;
  if (depth > 10 || seen.has(key)) return [];
  seen.add(key);
  const batches = (await query(`
    select b.id, b.batch_no, b.mfg_date, b.expiry_date, b.actual_output_qty, b.output_uom, b.source, pl.plan_no,
           l.code as location_code, w.code as warehouse_code
      from public.batches b
      join public.locations l on l.id = b.location_id join public.warehouses w on w.id = b.warehouse_id
      left join public.plans pl on pl.id = b.plan_id
     where b.output_mpn_id = $1 and b.batch_no = $2`, [mpnId, lotNo])).rows;
  for (const b of batches) {
    const inputs = (await query(`
      select bi.mpn_id, bi.lot_no, bi.actual_input_qty, bi.uom, p.mpn_code, m.code as material_code, m.name as material_name,
             w.code as warehouse_code
        from public.batch_inputs bi
        join public.materials m on m.id = bi.material_id
        left join public.mpns p on p.id = bi.mpn_id
        left join public.warehouses w on w.id = bi.warehouse_id
       where bi.batch_id = $1 and bi.actual_input_qty > 0 order by m.code`, [b.id])).rows;
    for (const i of inputs) {
      i.sources = await traceBackward(i.mpn_id, i.lot_no, depth + 1, seen);
    }
    b.inputs = inputs;
  }
  return batches;
}

/** Forward: RM lot -> batches that consumed it -> FG lots produced (recursive). */
async function traceForward(mpnId, lotNo, depth, seen) {
  const key = `${mpnId}|${lotNo}`;
  if (depth > 10 || seen.has(key)) return [];
  seen.add(key);
  const rows = (await query(`
    select b.id, b.batch_no, b.mfg_date, b.expiry_date, b.actual_output_qty, b.output_uom, b.output_mpn_id,
           sum(bi.actual_input_qty) as consumed_qty, min(bi.uom) as consumed_uom,
           p.mpn_code as output_mpn_code, m.code as product_code, m.name as product_name, l.code as location_code
      from public.batch_inputs bi
      join public.batches b on b.id = bi.batch_id
      join public.mpns p on p.id = b.output_mpn_id
      join public.materials m on m.id = b.product_id
      join public.locations l on l.id = b.location_id
     where bi.mpn_id = $1 and bi.lot_no = $2 and bi.actual_input_qty > 0
     group by b.id, p.mpn_code, m.code, m.name, l.code
     order by b.mfg_date`, [mpnId, lotNo])).rows;
  for (const r of rows) {
    r.used_in = await traceForward(r.output_mpn_id, r.batch_no, depth + 1, seen);
  }
  return rows;
}

router.get('/trace', h(async (req, res) => {
  const mpnId = v.uuid(req.query.mpn_id, 'MPN', { required: true });
  const lotNo = v.str(req.query.lot_no, 'Lot No', { required: true, max: 100 });
  const lot = await lotInfo(mpnId, lotNo);
  if (!lot) throw badRequest('MPN not found');
  const movements = (await query(`select * from public.v_ledger where mpn_id = $1 and lot_no = $2 order by txn_no`,
    [mpnId, lotNo])).rows;
  res.json({
    lot,
    backward: await traceBackward(mpnId, lotNo, 0, new Set()),
    forward: await traceForward(mpnId, lotNo, 0, new Set()),
    movements,
  });
}));

module.exports = router;
