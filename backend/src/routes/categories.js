const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h } = require('../utils/http');
const { notFound, badRequest } = require('../utils/errors');
const v = require('../utils/validate');
const md = require('../services/masterData');

// Material categories as a tree: [{ ...category, children: [...sub-categories] }]
router.get('/', h(async (req, res) => {
  const { rows } = await query(`
    select c.*, (select count(*) from public.materials m where m.category_id = c.id or m.sub_category_id = c.id)::int as material_count
      from public.material_categories c
     where ($1::text is null or c.status = $1)
     order by lower(c.name)`, [req.query.status || null]);
  const top = rows.filter((r) => !r.parent_id).map((r) => ({ ...r, children: [] }));
  const byId = Object.fromEntries(top.map((r) => [r.id, r]));
  for (const r of rows) if (r.parent_id && byId[r.parent_id]) byId[r.parent_id].children.push(r);
  res.json(top);
}));

router.post('/', h(async (req, res) => {
  const b = req.body || {};
  const { rows } = await query(`insert into public.material_categories(name, parent_id, status, created_by)
                                values ($1,$2,$3,$4) returning *`,
  [v.str(b.name, 'Name', { required: true, max: 100 }), v.uuid(b.parent_id, 'Parent category'),
    v.oneOf(b.status, 'Status', md.STATUSES, { def: 'ACTIVE' }), req.user.id]);
  res.status(201).json(rows[0]);
}));

router.put('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  const name = v.str(b.name, 'Name', { max: 100 });
  if (b.name !== undefined && !name) throw badRequest('Name cannot be empty');
  const { rows } = await query(`update public.material_categories set name = coalesce($2, name), status = coalesce($3, status),
                                  updated_by = $4 where id = $1 returning *`,
  [id, name, v.oneOf(b.status, 'Status', md.STATUSES), req.user.id]);
  if (!rows[0]) throw notFound('Category not found');
  res.json(rows[0]);
}));

router.delete('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const out = await withTransaction((c) => md.deleteOrDeactivate(c, { table: 'material_categories', id, label: 'Category', userId: req.user.id }));
  res.json(out);
}));

module.exports = router;
