const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { notFound } = require('../utils/errors');
const v = require('../utils/validate');
const md = require('../services/masterData');

const LIST_SQL = `
  select m.*, c.name as category_name, sc.name as sub_category_name,
         coalesce((select json_agg(json_build_object('id', p.id, 'mpn_code', p.mpn_code, 'status', p.status) order by p.mpn_code)
                     from public.mpns p where p.material_id = m.id), '[]') as mpns,
         (select count(*) from public.vendor_materials vm where vm.material_id = m.id)::int as vendor_count
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
    select ve.id, ve.code, ve.name, ve.status from public.vendor_materials vm join public.vendors ve on ve.id = vm.vendor_id
     where vm.material_id = $1 order by ve.name`, [id])).rows;
  res.json({ ...m, mpns, vendors });
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
