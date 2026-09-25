const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { notFound, badRequest } = require('../utils/errors');
const v = require('../utils/validate');
const md = require('../services/masterData');

// MPN list with material and mapped vendors (price, MOQ, UOM per vendor).
// Finished goods have no MPN (they are made, not bought), so they are never listed.
router.get('/', h(async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const { clause, params } = where([
    [`m.classification <> 'FINISHED_GOOD' and ?::int = 1`, 1],
    ['p.material_id = ?', req.query.material_id],
    ['(p.mpn_code ilike ? or m.code ilike ? or m.name ilike ? or p.manufacturer ilike ? or p.hsn_code ilike ?)', q],
    ['p.status = ?', req.query.status],
    ['(p.hsn_code is null and ?::int = 1)', req.query.hsn_missing === 'true' ? 1 : null],
    ['exists (select 1 from public.mpn_vendors x where x.mpn_id = p.id and x.vendor_id = ?)', req.query.vendor_id],
  ]);
  const { rows } = await query(`
    select p.*, m.code as material_code, m.name as material_name, m.classification, m.uom,
           coalesce(json_agg(json_build_object('vendor_id', ve.id, 'vendor_code', ve.code, 'vendor_name', ve.name,
                    'is_preferred', mv.is_preferred, 'lead_time_days', mv.lead_time_days, 'uom', mv.uom, 'moq', mv.moq,
                    'price', mv.price, 'currency', mv.currency, 'price_updated_at', mv.price_updated_at)
                    order by mv.is_preferred desc, ve.name)
                    filter (where ve.id is not null), '[]') as vendors
      from public.mpns p
      join public.materials m on m.id = p.material_id
      left join public.mpn_vendors mv on mv.mpn_id = p.id
      left join public.vendors ve on ve.id = mv.vendor_id
      ${clause}
     group by p.id, m.id
     order by p.mpn_code`, params);
  res.json(rows);
}));

router.get('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const mpn = (await query(`select p.*, m.code as material_code, m.name as material_name, m.uom as material_uom, m.classification
                              from public.mpns p join public.materials m on m.id = p.material_id where p.id = $1`, [id])).rows[0];
  if (!mpn) throw notFound('MPN not found');
  if (mpn.classification === 'FINISHED_GOOD') throw notFound('Finished goods are made, not bought: they have no MPN');
  const vendors = (await query(`
    select mv.*, ve.code as vendor_code, ve.name as vendor_name from public.mpn_vendors mv
      join public.vendors ve on ve.id = mv.vendor_id where mv.mpn_id = $1 order by mv.is_preferred desc, ve.name`, [id])).rows;
  const history = (await query(`
    select h.*, ve.name as vendor_name, u.full_name as changed_by_name from public.mpn_price_history h
      join public.mpn_vendors mv on mv.id = h.mpn_vendor_id join public.vendors ve on ve.id = mv.vendor_id
      left join public.user_profiles u on u.id = h.changed_by
     where mv.mpn_id = $1 order by h.changed_at desc limit 50`, [id])).rows;
  res.json({ ...mpn, vendors, price_history: history });
}));

router.post('/', h(async (req, res) => {
  const b = req.body || {};
  const materialId = v.uuid(b.material_id, 'Material', { required: true });
  const vendors = md.parseMpnVendors(b.vendors) || [];
  const row = await withTransaction(async (c) => {
    await md.actAs(c, req.user.id);
    return md.createMpn(c, {
      materialId,
      legacyCode: v.str(b.mpn_code, 'MPN', { max: 100 })?.toUpperCase(),
      manufacturer: v.str(b.manufacturer, 'Manufacturer', { max: 200 }),
      description: v.str(b.description, 'Description', { max: 1000 }),
      hsnCode: v.hsn(b.hsn_code),
      vendors,
    }, req.user.id);
  });
  res.status(201).json(row);
}));

/**
 * Bulk MPN create from the grid: each row = material + vendor + UOM + MOQ + price.
 * All rows are saved together or none are.
 */
router.post('/bulk', h(async (req, res) => {
  const rows = (req.body || {}).rows;
  if (!Array.isArray(rows) || rows.length === 0) throw badRequest('Add at least one row');
  if (rows.length > 1000) throw badRequest('At most 1000 rows per upload');
  const { validateMpnRows, commitMpnRows } = require('../services/bulk');
  const checked = await validateMpnRows(rows);
  if (checked.some((r) => r.errors.length)) {
    return res.status(400).json({ error: 'Some rows have errors. Nothing was saved.', rows: checked });
  }
  const created = await withTransaction((c) => commitMpnRows(c, checked, req.user.id));
  res.status(201).json({ created: created.length, rows: created });
}));

router.put('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  const vendors = md.parseMpnVendors(b.vendors);
  const row = await withTransaction(async (c) => {
    await md.actAs(c, req.user.id);
    await md.assertNotFinishedGoodMpn(c, id);
    const r = (await c.query(`update public.mpns
         set manufacturer = case when $6 then $2 else manufacturer end,
             description = case when $7 then $3 else description end,
             hsn_code = case when $9 then $8 else hsn_code end,
             status = coalesce($4, status), updated_by = $5
       where id = $1 returning *`,
    [id, v.str(b.manufacturer, 'Manufacturer', { max: 200 }), v.str(b.description, 'Description', { max: 1000 }),
      v.oneOf(b.status, 'status', md.STATUSES), req.user.id, b.manufacturer !== undefined, b.description !== undefined,
      v.hsn(b.hsn_code), b.hsn_code !== undefined])).rows[0];
    if (!r) throw notFound('MPN not found');
    if (vendors) await md.writeMpnVendors(c, id, vendors, req.user.id);
    return r;
  });
  res.json(row);
}));

router.delete('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const out = await withTransaction((c) => md.deleteOrDeactivate(c, { table: 'mpns', id, label: 'MPN', userId: req.user.id }));
  res.json(out);
}));

module.exports = router;
