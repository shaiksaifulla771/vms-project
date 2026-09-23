const router = require('express').Router();
const { query } = require('../db/pool');
const { h, where } = require('../utils/http');
const { notFound } = require('../utils/errors');
const v = require('../utils/validate');

const FIELDS = ['name', 'contact_email', 'phone', 'gstin', 'address', 'city', 'state', 'country'];

router.get('/', h(async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const { clause, params } = where([
    ['(v.code ilike ? or v.name ilike ?)', q],
    ['v.status = ?', req.query.status],
  ]);
  const { rows } = await query(`
    select v.*, (select count(*) from public.mpn_vendors mv where mv.vendor_id = v.id)::int as mpn_count
      from public.vendors v ${clause} order by v.code`, params);
  res.json(rows);
}));

router.get('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const vendor = (await query('select * from public.vendors where id = $1', [id])).rows[0];
  if (!vendor) throw notFound('Vendor not found');
  const mpns = (await query(`
    select p.id, p.mpn_code, m.code as material_code, m.name as material_name, mv.is_preferred, mv.lead_time_days
      from public.mpn_vendors mv join public.mpns p on p.id = mv.mpn_id join public.materials m on m.id = p.material_id
     where mv.vendor_id = $1 order by p.mpn_code`, [id])).rows;
  res.json({ ...vendor, mpns });
}));

router.post('/', h(async (req, res) => {
  const b = req.body || {};
  let code = v.str(b.code, 'Vendor code', { max: 40 });
  if (!code) {
    const next = await query(`select 'V' || lpad((coalesce(max(nullif(regexp_replace(code, '\\D', '', 'g'), '')::bigint), 1000) + 1)::text, 4, '0') as code
                                from public.vendors where code ~ '^V\\d+$'`);
    code = next.rows[0].code;
  }
  const vals = FIELDS.map((f) => v.str(b[f], f, { required: f === 'name', max: f === 'address' ? 1000 : 200 }));
  const { rows } = await query(`insert into public.vendors(code, ${FIELDS.join(', ')}, created_by)
                                values ($1, ${FIELDS.map((_, i) => `$${i + 2}`).join(', ')}, $${FIELDS.length + 2}) returning *`,
    [code.toUpperCase(), ...vals, req.user.id]);
  res.status(201).json(rows[0]);
}));

router.put('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  const sets = [];
  const params = [id];
  for (const f of FIELDS) {
    if (b[f] !== undefined) {
      params.push(v.str(b[f], f, { required: f === 'name', max: f === 'address' ? 1000 : 200 }));
      sets.push(`${f} = $${params.length}`);
    }
  }
  if (b.status !== undefined) {
    params.push(v.oneOf(b.status, 'status', ['ACTIVE', 'INACTIVE']));
    sets.push(`status = $${params.length}`);
  }
  params.push(req.user.id);
  sets.push(`updated_by = $${params.length}`);
  const { rows } = await query(`update public.vendors set ${sets.join(', ')} where id = $1 returning *`, params);
  if (!rows[0]) throw notFound('Vendor not found');
  res.json(rows[0]);
}));

module.exports = router;
