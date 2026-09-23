const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { notFound } = require('../utils/errors');
const v = require('../utils/validate');

const CLASSES = ['RAW_MATERIAL', 'PACKAGING', 'CONSUMABLE', 'SEMI_FINISHED', 'FINISHED_GOOD'];

router.get('/', h(async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const produced = req.query.producible === 'true' ? true : null;
  const { clause, params } = where([
    ['(m.code ilike ? or m.name ilike ?)', q],
    ['m.classification = ?', req.query.classification],
    ['m.status = ?', req.query.status],
    [`m.classification in ('FINISHED_GOOD','SEMI_FINISHED') and ? = true`, produced],
  ]);
  const { rows } = await query(`
    select m.*,
           coalesce((select json_agg(json_build_object('id', p.id, 'mpn_code', p.mpn_code, 'status', p.status) order by p.mpn_code)
                       from public.mpns p where p.material_id = m.id), '[]') as mpns
      from public.materials m ${clause} order by m.classification, m.code`, params);
  res.json(rows);
}));

router.get('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const m = (await query('select * from public.materials where id = $1', [id])).rows[0];
  if (!m) throw notFound('Material not found');
  const mpns = (await query(`
    select p.*, coalesce(json_agg(json_build_object('vendor_id', ve.id, 'vendor_code', ve.code, 'vendor_name', ve.name,
             'is_preferred', mv.is_preferred) order by mv.is_preferred desc, ve.name) filter (where ve.id is not null), '[]') as vendors
      from public.mpns p
      left join public.mpn_vendors mv on mv.mpn_id = p.id
      left join public.vendors ve on ve.id = mv.vendor_id
     where p.material_id = $1 group by p.id order by p.mpn_code`, [id])).rows;
  res.json({ ...m, mpns });
}));

/**
 * Create a material. Optionally create its first MPN (and vendor mapping) in the same call.
 * Finished / semi-finished goods automatically get an MPN equal to their code.
 */
router.post('/', h(async (req, res) => {
  const b = req.body || {};
  const code = v.str(b.code, 'Material code', { required: true, max: 60 }).toUpperCase();
  const name = v.str(b.name, 'Material name', { required: true, max: 300 });
  const classification = v.oneOf(b.classification, 'Classification', CLASSES, { required: true });
  const uom = v.str(b.uom, 'UOM', { required: true, max: 20 });
  const shelfLife = v.num(b.shelf_life_days, 'Shelf life (days)', { min: 1 });
  const mpnCode = v.str(b.mpn_code, 'MPN', { max: 100 });
  const vendorId = v.uuid(b.vendor_id, 'Vendor');

  const row = await withTransaction(async (c) => {
    const mat = (await c.query(`insert into public.materials(code, name, classification, uom, shelf_life_days, created_by)
                                values ($1,$2,$3,$4,$5,$6) returning *`,
      [code, name, classification, uom, shelfLife, req.user.id])).rows[0];
    const autoMpn = mpnCode || (['FINISHED_GOOD', 'SEMI_FINISHED'].includes(classification) ? code : null);
    if (autoMpn) {
      const mpn = (await c.query(`insert into public.mpns(mpn_code, material_id, created_by) values ($1,$2,$3) returning id`,
        [autoMpn.toUpperCase(), mat.id, req.user.id])).rows[0];
      if (vendorId) {
        await c.query(`insert into public.mpn_vendors(mpn_id, vendor_id, is_preferred, created_by) values ($1,$2,true,$3)`,
          [mpn.id, vendorId, req.user.id]);
      }
    }
    return mat;
  });
  res.status(201).json(row);
}));

router.put('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  const { rows } = await query(`update public.materials
      set name = coalesce($2, name),
          classification = coalesce($3, classification),
          uom = coalesce($4, uom),
          shelf_life_days = case when $5::boolean then $6::int else shelf_life_days end,
          status = coalesce($7, status),
          updated_by = $8
    where id = $1 returning *`,
    [id, v.str(b.name, 'Name', { max: 300 }), v.oneOf(b.classification, 'Classification', CLASSES),
      v.str(b.uom, 'UOM', { max: 20 }), b.shelf_life_days !== undefined,
      v.num(b.shelf_life_days, 'Shelf life (days)', { min: 1 }),
      v.oneOf(b.status, 'status', ['ACTIVE', 'INACTIVE']), req.user.id]);
  if (!rows[0]) throw notFound('Material not found');
  res.json(rows[0]);
}));

module.exports = router;
