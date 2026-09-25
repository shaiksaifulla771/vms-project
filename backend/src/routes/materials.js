const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { notFound } = require('../utils/errors');
const v = require('../utils/validate');
const md = require('../services/masterData');

const LIST_SQL = `
  select m.*, c.name as category_name, sc.name as sub_category_name,
         coalesce((select json_agg(json_build_object('id', p.id, 'mpn_code', p.mpn_code, 'status', p.status) order by p.mpn_code)
                     from public.mpns p where p.material_id = m.id and m.classification <> 'FINISHED_GOOD'), '[]') as mpns,
         (select count(distinct mv.vendor_id) from public.mpn_vendors mv join public.mpns p on p.id = mv.mpn_id
           where p.material_id = m.id and m.classification <> 'FINISHED_GOOD')::int as vendor_count
    from public.materials m
    left join public.material_categories c on c.id = m.category_id
    left join public.material_categories sc on sc.id = m.sub_category_id`;

router.get('/', h(async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const produced = req.query.producible === 'true' ? true : null;
  const { clause, params } = where([
    ['(m.code ilike ? or m.name ilike ?)', q],
    ['m.classification = ?', req.query.classification],
    ['m.status = ?', req.query.status],
    ['m.category_id = ?', req.query.category_id],
    ['m.sub_category_id = ?', req.query.sub_category_id],
    [`m.classification in ('FINISHED_GOOD','SEMI_FINISHED') and ? = true`, produced],
  ]);
  const { rows } = await query(`${LIST_SQL} ${clause} order by m.classification, m.code`, params);
  res.json(rows);
}));

router.get('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const m = (await query(`${LIST_SQL} where m.id = $1`, [id])).rows[0];
  if (!m) throw notFound('Material not found');
  const mpns = (await query(`
    select p.*, coalesce(json_agg(json_build_object('vendor_id', ve.id, 'vendor_code', ve.code, 'vendor_name', ve.name,
             'is_preferred', mv.is_preferred, 'uom', mv.uom, 'moq', mv.moq, 'price', mv.price)
             order by mv.is_preferred desc, ve.name) filter (where ve.id is not null), '[]') as vendors
      from public.mpns p
      left join public.mpn_vendors mv on mv.mpn_id = p.id
      left join public.vendors ve on ve.id = mv.vendor_id
     where p.material_id = $1 group by p.id order by p.mpn_code`, [id])).rows;
  const vendors = (await query(`
    select distinct ve.id, ve.code, ve.name, ve.status from public.mpn_vendors mv join public.mpns p on p.id = mv.mpn_id
      join public.vendors ve on ve.id = mv.vendor_id
     where p.material_id = $1 order by ve.name`, [id])).rows;
  // Finished goods are made, not bought: no MPNs or vendors (their internal stock code stays hidden).
  if (m.classification === 'FINISHED_GOOD') return res.json({ ...m, mpns: [], vendors: [] });
  res.json({ ...m, mpns, vendors });
}));

/**
 * Full-page view: everything about one material on one screen - stock by lot, recent transactions,
 * BOMs it is used in, its own BOMs (finished / semi-finished), open plans and recent batches.
 * Stock and transactions follow the top-bar location / warehouse.
 */
router.get('/:id/overview', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const loc = req.scope.locationId || null;
  const wh = req.scope.warehouseId || null;
  const exists = (await query('select classification from public.materials where id = $1', [id])).rows[0];
  if (!exists) throw notFound('Material not found');
  const fg = exists.classification === 'FINISHED_GOOD';
  const [stock, txns, usedIn, ownBoms, plans, batches] = await Promise.all([
    query(`select id, location_code, warehouse_code, lot_no, quantity, uom, mfg_date, expiry_date, is_expired, vendor_name,
                  case when classification = 'FINISHED_GOOD' then null else mpn_code end as mpn_code
             from public.v_stock where material_id = $1 and quantity > 0
              and ($2::uuid is null or location_id = $2) and ($3::uuid is null or warehouse_id = $3)
            order by location_code, warehouse_code, expiry_date nulls last, lot_no`, [id, loc, wh]),
    query(`select txn_no, txn_at, txn_type, qty_change, new_balance, uom, lot_no, reference_type, reference_id, reason,
                  location_code, warehouse_code, user_name
             from public.v_ledger where material_id = $1
              and ($2::uuid is null or location_id = $2) and ($3::uuid is null or warehouse_id = $3)
            order by txn_no desc limit 20`, [id, loc, wh]),
    query(`select distinct b.id, b.bom_no, b.version, b.name, b.status, b.is_default, pm.code as product_code, pm.name as product_name,
                  l.code as location_code, bl.qty_per_batch, bl.uom
             from public.bom_lines bl join public.boms b on b.id = bl.bom_id
             join public.materials pm on pm.id = b.product_id join public.locations l on l.id = b.location_id
            where bl.material_id = $1 and b.status <> 'OBSOLETE' order by pm.code, l.code, b.version desc`, [id]),
    query(`select b.id, b.bom_no, b.version, b.name, b.status, b.is_default, l.code as location_code,
                  b.expected_output_qty, b.output_uom
             from public.boms b join public.locations l on l.id = b.location_id
            where b.product_id = $1 order by l.code, (b.status = 'ACTIVE') desc, b.is_default desc, b.version desc`, [id]),
    query(`select id, plan_no, status, target_qty, executed_qty, remaining_qty, required_date from public.plans
            where product_id = $1 and status in ('OPEN', 'IN_PROGRESS') and ($2::uuid is null or location_id = $2)
            order by created_at desc limit 20`, [id, loc]),
    query(`select id, batch_no, mfg_date, expiry_date, actual_output_qty, output_uom, status from public.batches
            where product_id = $1 and ($2::uuid is null or location_id = $2) order by created_at desc limit 20`, [id, loc]),
  ]);
  const total = stock.rows.reduce((a, r) => a + Number(r.quantity), 0);
  res.json({
    stock: stock.rows, stock_total: Math.round(total * 10000) / 10000, transactions: txns.rows, used_in_boms: usedIn.rows,
    boms: ownBoms.rows, open_plans: plans.rows, recent_batches: batches.rows, made_in_house: fg,
  });
}));

/**
 * Create a material. The code is assigned automatically (M1001, M1002, ...).
 * Optionally create its first MPN (and vendor mapping) in the same call.
 * Finished / semi-finished goods automatically get an MPN.
 */
router.post('/', h(async (req, res) => {
  const b = req.body || {};
  const d = md.parseMaterial(b);
  const opts = {
    legacyCode: v.str(b.code, 'Material code', { max: 60 })?.toUpperCase(),
    mpnCode: v.str(b.mpn_code, 'MPN', { max: 100 })?.toUpperCase(),
    vendorId: v.uuid(b.vendor_id, 'Vendor'),
  };
  const row = await withTransaction(async (c) => {
    await md.actAs(c, req.user.id);
    return md.createMaterial(c, d, req.user.id, opts);
  });
  res.status(201).json(row);
}));

router.put('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const d = md.parseMaterial(req.body || {}, { partial: true });
  const row = await withTransaction((c) => md.updateMaterial(c, id, d, req.user.id));
  res.json(row);
}));

router.delete('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const out = await withTransaction((c) => md.deleteOrDeactivate(c, {
    table: 'materials', id, label: 'Material', userId: req.user.id,
    // An FG's auto-created MPN is removed with it when nothing else uses it.
    before: ['delete from public.mpns where material_id = $1'],
  }));
  res.json(out);
}));

module.exports = router;
