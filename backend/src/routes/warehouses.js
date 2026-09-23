const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { notFound, badRequest } = require('../utils/errors');
const v = require('../utils/validate');

router.get('/', h(async (req, res) => {
  const { clause, params } = where([['w.location_id = ?', req.query.location_id]]);
  const { rows } = await query(`select w.*, l.code as location_code, l.name as location_name
                                  from public.warehouses w join public.locations l on l.id = w.location_id
                                  ${clause} order by l.code, w.is_default desc, w.code`, params);
  res.json(rows);
}));

router.put('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  const row = await withTransaction(async (c) => {
    const cur = (await c.query('select * from public.warehouses where id = $1 for update', [id])).rows[0];
    if (!cur) throw notFound('Warehouse not found');
    if (b.is_default === true || b.is_default === 'true') {
      await c.query('update public.warehouses set is_default = false where location_id = $1 and id <> $2', [cur.location_id, id]);
    }
    if (b.is_active === false && cur.is_default) throw badRequest('The default warehouse cannot be deactivated');
    return (await c.query(`update public.warehouses
          set name = coalesce($2, name),
              is_default = coalesce($3, is_default),
              is_active = coalesce($4, is_active),
              updated_by = $5
        where id = $1 returning *`,
      [id, v.str(b.name, 'Name', { max: 200 }),
        b.is_default === undefined ? null : v.bool(b.is_default),
        b.is_active === undefined ? null : v.bool(b.is_active), req.user.id])).rows[0];
  });
  res.json(row);
}));

module.exports = router;
