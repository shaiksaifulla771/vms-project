const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { notFound, badRequest } = require('../utils/errors');
const v = require('../utils/validate');

// MPN list with material and mapped vendors (MPN-Vendor Mapping screen)
router.get('/', h(async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const { clause, params } = where([
    ['p.material_id = ?', req.query.material_id],
    ['(p.mpn_code ilike ? or m.code ilike ? or m.name ilike ?)', q],
    ['p.status = ?', req.query.status],
    ['exists (select 1 from public.mpn_vendors x where x.mpn_id = p.id and x.vendor_id = ?)', req.query.vendor_id],
  ]);
  const { rows } = await query(`
    select p.*, m.code as material_code, m.name as material_name, m.classification, m.uom,
           coalesce(json_agg(json_build_object('vendor_id', ve.id, 'vendor_code', ve.code, 'vendor_name', ve.name,
                    'is_preferred', mv.is_preferred) order by mv.is_preferred desc, ve.name)
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

function parseVendors(list) {
  if (list === undefined) return undefined;
  if (!Array.isArray(list)) throw badRequest('vendors must be a list');
  const seen = new Set();
  const out = list.map((x, i) => {
    const vendorId = v.uuid(x.vendor_id, `vendors[${i}].vendor_id`, { required: true });
    if (seen.has(vendorId)) throw badRequest('A vendor is listed twice');
    seen.add(vendorId);
    return { vendorId, preferred: v.bool(x.is_preferred), lead: v.num(x.lead_time_days, 'Lead time', { min: 0 }) };
  });
  if (out.filter((x) => x.preferred).length > 1) throw badRequest('Only one preferred vendor per MPN');
  if (out.length && !out.some((x) => x.preferred)) out[0].preferred = true;
  return out;
}

async function replaceVendors(c, mpnId, vendors, userId) {
  await c.query('delete from public.mpn_vendors where mpn_id = $1', [mpnId]);
  for (const x of vendors) {
    await c.query(`insert into public.mpn_vendors(mpn_id, vendor_id, is_preferred, lead_time_days, created_by)
                   values ($1,$2,$3,$4,$5)`, [mpnId, x.vendorId, x.preferred, x.lead, userId]);
  }
}

router.post('/', h(async (req, res) => {
  const b = req.body || {};
  const mpnCode = v.str(b.mpn_code, 'MPN', { required: true, max: 100 }).toUpperCase();
  const materialId = v.uuid(b.material_id, 'Material', { required: true });
  const vendors = parseVendors(b.vendors) || [];
  const row = await withTransaction(async (c) => {
    const mpn = (await c.query(`insert into public.mpns(mpn_code, material_id, manufacturer, description, created_by)
                                values ($1,$2,$3,$4,$5) returning *`,
      [mpnCode, materialId, v.str(b.manufacturer, 'Manufacturer', { max: 200 }),
        v.str(b.description, 'Description', { max: 1000 }), req.user.id])).rows[0];
    await replaceVendors(c, mpn.id, vendors, req.user.id);
    return mpn;
  });
  res.status(201).json(row);
}));

router.put('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  const vendors = parseVendors(b.vendors);
  const row = await withTransaction(async (c) => {
    const r = (await c.query(`update public.mpns
         set manufacturer = coalesce($2, manufacturer), description = coalesce($3, description),
             status = coalesce($4, status), updated_by = $5
       where id = $1 returning *`,
      [id, v.str(b.manufacturer, 'Manufacturer', { max: 200 }), v.str(b.description, 'Description', { max: 1000 }),
        v.oneOf(b.status, 'status', ['ACTIVE', 'INACTIVE']), req.user.id])).rows[0];
    if (!r) throw notFound('MPN not found');
    if (vendors) await replaceVendors(c, id, vendors, req.user.id);
    return r;
  });
  res.json(row);
}));

module.exports = router;
