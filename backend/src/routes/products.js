/**
 * Products = Finished Goods and Semi-Finished materials, with their BOMs, cost, stock and open plans.
 * A read view over Material Master (no separate table), so it can never go out of sync.
 * Stock and plans follow the selected Location / WH.
 */
const router = require('express').Router();
const { query } = require('../db/pool');
const { h } = require('../utils/http');
const { notFound } = require('../utils/errors');
const v = require('../utils/validate');
const { loadBom } = require('../services/boms');

const PRODUCT_SQL = `
  select m.id, m.code, m.name, m.classification, m.uom, m.shelf_life_days, m.status, m.description, m.created_at,
         m.category_id, m.sub_category_id, c.name as category_name, sc.name as sub_category_name,
         (select p.mpn_code from public.mpns p where p.material_id = m.id order by p.created_at limit 1) as mpn_code,
         (select count(*) from public.boms b where b.product_id = m.id)::int as bom_versions,
         coalesce((select json_agg(json_build_object('id', b.id, 'bom_no', b.bom_no, 'version', b.version,
                    'location_id', b.location_id, 'location_code', l.code, 'warehouse_code', w.code,
                    'batch_size', b.batch_size, 'batch_uom', b.batch_uom,
                    'expected_output_qty', b.expected_output_qty, 'output_uom', b.output_uom) order by l.code)
                     from public.boms b join public.locations l on l.id = b.location_id join public.warehouses w on w.id = b.warehouse_id
                    where b.product_id = m.id and b.status = 'ACTIVE'), '[]') as active_boms,
         (select coalesce(sum(i.quantity), 0) from public.inventory i
           where i.material_id = m.id and ($1::uuid is null or i.location_id = $1) and ($2::uuid is null or i.warehouse_id = $2)) as stock_qty,
         (select count(*) from public.plans pl
           where pl.product_id = m.id and pl.status in ('OPEN', 'IN_PROGRESS') and ($1::uuid is null or pl.location_id = $1))::int as open_plans
    from public.materials m
    left join public.material_categories c on c.id = m.category_id
    left join public.material_categories sc on sc.id = m.sub_category_id
   where m.classification in ('FINISHED_GOOD', 'SEMI_FINISHED')`;

/** Cost per output unit of the active BOM in the selected location (or the first active BOM). */
async function withCost(p, locationId) {
  const bom = p.active_boms.find((b) => b.location_id === locationId) || (locationId ? null : p.active_boms[0]);
  if (!bom) return { ...p, bom_in_scope: null, cost_per_unit: null };
  const full = await loadBom({ query }, bom.id);
  return { ...p, bom_in_scope: bom, cost_per_unit: full.costing.cost_per_output_unit, unpriced_lines: full.costing.unpriced_lines };
}

router.get('/', h(async (req, res) => {
  const { locationId, warehouseId } = req.scope;
  const q = req.query.q ? `%${req.query.q}%` : null;
  const { rows } = await query(`${PRODUCT_SQL}
       and ($3::text is null or m.code ilike $3 or m.name ilike $3)
       and ($4::text is null or m.classification = $4)
       and ($5::text is null or m.status = $5)
     order by m.classification desc, m.code`,
  [locationId || null, warehouseId || null, q, req.query.classification || null, req.query.status || null]);
  res.json(await Promise.all(rows.map((p) => withCost(p, locationId || null))));
}));

router.get('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const { locationId, warehouseId } = req.scope;
  const p = (await query(`${PRODUCT_SQL} and m.id = $3`, [locationId || null, warehouseId || null, id])).rows[0];
  if (!p) throw notFound('Product not found');
  const [boms, stock, plans] = await Promise.all([
    query(`select b.id, b.bom_no, b.version, b.status, b.batch_size, b.batch_uom, b.expected_output_qty, b.output_uom,
                  l.code as location_code, w.code as warehouse_code, b.updated_at
             from public.boms b join public.locations l on l.id = b.location_id join public.warehouses w on w.id = b.warehouse_id
            where b.product_id = $1 order by l.code, b.version desc`, [id]),
    query(`select l.code as location_code, w.code as warehouse_code, i.lot_no, i.quantity, i.uom, i.mfg_date, i.expiry_date
             from public.inventory i join public.locations l on l.id = i.location_id join public.warehouses w on w.id = i.warehouse_id
            where i.material_id = $1 and i.quantity > 0 and ($2::uuid is null or i.location_id = $2) and ($3::uuid is null or i.warehouse_id = $3)
            order by i.expiry_date nulls last, i.lot_no`, [id, locationId || null, warehouseId || null]),
    query(`select pl.id, pl.plan_no, pl.status, pl.target_qty, pl.executed_qty, pl.remaining_qty, l.code as location_code
             from public.plans pl join public.locations l on l.id = pl.location_id
            where pl.product_id = $1 and ($2::uuid is null or pl.location_id = $2)
            order by pl.created_at desc limit 20`, [id, locationId || null]),
  ]);
  res.json({ ...(await withCost(p, locationId || null)), boms: boms.rows, stock: stock.rows, plans: plans.rows });
}));

module.exports = router;
