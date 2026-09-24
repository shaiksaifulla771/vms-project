const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h } = require('../utils/http');
const { notFound, badRequest } = require('../utils/errors');
const v = require('../utils/validate');
const md = require('../services/masterData');

const TYPES = ['WEIGHT', 'VOLUME', 'COUNT', 'LENGTH', 'OTHER'];

// UOM list with how many records use each one
router.get('/', h(async (req, res) => {
  const { rows } = await query(`
    select u.*,
           ((select count(*) from public.materials m where lower(m.uom) = lower(u.code))
          + (select count(*) from public.mpn_vendors x where lower(x.uom) = lower(u.code))
          + (select count(*) from public.boms b where lower(b.batch_uom) = lower(u.code) or lower(b.output_uom) = lower(u.code))
          + (select count(*) from public.bom_lines l where lower(l.uom) = lower(u.code)))::int as use_count
      from public.uoms u
     where ($1::text is null or u.status = $1)
     order by u.sort_order, lower(u.code)`, [req.query.status || null]);
  res.json(rows);
}));

function parse(b, { partial = false } = {}) {
  const code = v.str(b.code, 'Code', { required: !partial, max: 20 });
  if (code && !/^[A-Za-z0-9./%-]+$/.test(code)) throw badRequest('Code can use letters, numbers and . / % - only (no spaces)');
  return {
    code,
    name: v.str(b.name, 'Name', { required: !partial, max: 60 }),
    uom_type: v.oneOf(b.uom_type, 'Type', TYPES, { def: partial ? null : 'OTHER' }),
    status: v.oneOf(b.status, 'Status', md.STATUSES, { def: partial ? null : 'ACTIVE' }),
    sort_order: v.num(b.sort_order, 'Sort order', { min: 0, max: 100000 }),
  };
}

router.post('/', h(async (req, res) => {
  const d = parse(req.body || {});
  const { rows } = await query(`insert into public.uoms(code, name, uom_type, status, sort_order, created_by)
                                values ($1,$2,$3,$4,coalesce($5, 500),$6) returning *`,
  [d.code, d.name, d.uom_type, d.status, d.sort_order, req.user.id]);
  res.status(201).json(rows[0]);
}));

router.put('/:code', h(async (req, res) => {
  const d = parse(req.body || {}, { partial: true });
  const { rows } = await query(`update public.uoms set code = coalesce($2, code), name = coalesce($3, name),
                                  uom_type = coalesce($4, uom_type), status = coalesce($5, status),
                                  sort_order = coalesce($6, sort_order), updated_by = $7
                                where code = $1 returning *`,
  [req.params.code, d.code, d.name, d.uom_type, d.status, d.sort_order, req.user.id]);
  if (!rows[0]) throw notFound('UOM not found');
  res.json(rows[0]);
}));

// Delete when unused; otherwise set Inactive (old records keep it, new records cannot pick it)
router.delete('/:code', h(async (req, res) => {
  const out = await withTransaction(async (c) => {
    const u = (await c.query('select code from public.uoms where code = $1', [req.params.code])).rows[0];
    if (!u) throw notFound('UOM not found');
    await c.query('savepoint del');
    try {
      await c.query('delete from public.uoms where code = $1', [u.code]);
      return { action: 'deleted' };
    } catch (err) {
      await c.query('rollback to savepoint del');
      if (err.code !== '23503') throw err;
      await c.query(`update public.uoms set status = 'INACTIVE', updated_by = $2 where code = $1`, [u.code, req.user.id]);
      return { action: 'deactivated', reason: 'This UOM is used by other records, so it was set to Inactive instead of deleted.' };
    }
  });
  res.json(out);
}));

module.exports = router;
