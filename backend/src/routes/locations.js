const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h } = require('../utils/http');
const { notFound } = require('../utils/errors');
const v = require('../utils/validate');

// Locations with their warehouses (Company -> Location -> WH)
router.get('/', h(async (req, res) => {
  const { rows } = await query(`
    select l.*, coalesce(json_agg(json_build_object(
             'id', w.id, 'code', w.code, 'name', w.name, 'is_default', w.is_default, 'is_active', w.is_active, 'created_at', w.created_at)
             order by w.is_default desc, w.code) filter (where w.id is not null), '[]') as warehouses
      from public.locations l
      left join public.warehouses w on w.location_id = l.id
     group by l.id
     order by l.code`);
  res.json(rows);
}));

router.post('/', h(async (req, res) => {
  const b = req.body || {};
  const code = v.str(b.code, 'Location code', { required: true, max: 40 }).toUpperCase();
  const name = v.str(b.name, 'Location name', { required: true, max: 200 });
  const address = v.str(b.address, 'Address', { max: 1000 });
  const whCode = (v.str(b.warehouse_code, 'Warehouse code', { max: 40 }) || 'WH-01').toUpperCase();
  const whName = v.str(b.warehouse_name, 'Warehouse name', { max: 200 }) || `${name} - Main Warehouse`;

  const result = await withTransaction(async (c) => {
    const company = await c.query('select id from public.companies order by created_at limit 1');
    let companyId = company.rows[0]?.id;
    if (!companyId) {
      companyId = (await c.query(`insert into public.companies(name) values ('Default Company') returning id`)).rows[0].id;
    }
    const loc = (await c.query(`insert into public.locations(company_id, code, name, address, created_by)
                                values ($1,$2,$3,$4,$5) returning *`,
      [companyId, code, name, address, req.user.id])).rows[0];
    // Every location starts with one default warehouse
    await c.query(`insert into public.warehouses(location_id, code, name, is_default, created_by)
                   values ($1,$2,$3,true,$4)`, [loc.id, whCode, whName, req.user.id]);
    return loc;
  });
  res.status(201).json(result);
}));

router.put('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  const { rows } = await query(`update public.locations
       set name = coalesce($2, name), address = coalesce($3, address),
           is_active = coalesce($4, is_active), updated_by = $5
     where id = $1 returning *`,
    [id, v.str(b.name, 'Name', { max: 200 }), v.str(b.address, 'Address', { max: 1000 }),
      b.is_active === undefined ? null : v.bool(b.is_active), req.user.id]);
  if (!rows[0]) throw notFound('Location not found');
  res.json(rows[0]);
}));

// Add a warehouse (sub-location) under a location
router.post('/:id/warehouses', h(async (req, res) => {
  const locationId = v.uuid(req.params.id, 'Location', { required: true });
  const b = req.body || {};
  const code = v.str(b.code, 'Warehouse code', { required: true, max: 40 }).toUpperCase();
  const name = v.str(b.name, 'Warehouse name', { required: true, max: 200 });
  const makeDefault = v.bool(b.is_default);
  const row = await withTransaction(async (c) => {
    if (makeDefault) {
      await c.query('update public.warehouses set is_default = false where location_id = $1', [locationId]);
    }
    return (await c.query(`insert into public.warehouses(location_id, code, name, is_default, created_by)
                           values ($1,$2,$3,$4,$5) returning *`,
      [locationId, code, name, makeDefault, req.user.id])).rows[0];
  });
  res.status(201).json(row);
}));

module.exports = router;
