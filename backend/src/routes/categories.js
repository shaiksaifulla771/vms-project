const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h } = require('../utils/http');
const { notFound, badRequest } = require('../utils/errors');
const v = require('../utils/validate');
const md = require('../services/masterData');

// Material categories as a tree: [{ ...category, children: [...sub-categories] }]
// ?classification=RAW_MATERIAL returns that classification's categories plus unassigned ones.
router.get('/', h(async (req, res) => {
  const cls = v.oneOf(req.query.classification || null, 'Classification', md.CLASSES);
  const { rows } = await query(`
    select c.*, (select count(*) from public.materials m where m.category_id = c.id or m.sub_category_id = c.id)::int as material_count
      from public.material_categories c
     where ($1::text is null or c.status = $1)
       and ($2::text is null or c.classification is null or c.classification = $2)
     order by lower(c.name)`, [req.query.status || null, cls]);
  const top = rows.filter((r) => !r.parent_id).map((r) => ({ ...r, children: [] }));
  const byId = Object.fromEntries(top.map((r) => [r.id, r]));
  for (const r of rows) if (r.parent_id && byId[r.parent_id]) byId[r.parent_id].children.push(r);
  res.json(top);
}));

router.post('/', h(async (req, res) => {
  const b = req.body || {};
  const { rows } = await query(`insert into public.material_categories(name, parent_id, status, classification, created_by)
                                values ($1,$2,$3,$4,$5) returning *`,
  [v.str(b.name, 'Name', { required: true, max: 100 }), v.uuid(b.parent_id, 'Parent category'),
    v.oneOf(b.status, 'Status', md.STATUSES, { def: 'ACTIVE' }), v.oneOf(b.classification, 'Classification', md.CLASSES), req.user.id]);
  res.status(201).json(rows[0]);
}));

/**
 * Create several categories / sub-categories at once (the "Create missing categories" button in Bulk Entry,
 * and "+ Add new" in the Material form). Existing names are reused (case-insensitive); all or nothing.
 * body: { items: [{ classification, category, sub_categories: [..] }] }
 */
router.post('/bulk-create', h(async (req, res) => {
  const items = req.body?.items;
  v.objList(items, 'Items', { max: 200 });
  if (!items || !items.length) throw badRequest('Nothing to create');
  if (items.length > 200) throw badRequest('At most 200 categories at a time');
  const out = await withTransaction(async (c) => {
    const created = { categories: [], sub_categories: [] };
    for (const [i, it] of items.entries()) {
      const cls = v.oneOf(it.classification, `Item ${i + 1} classification`, md.CLASSES, { required: true });
      const name = v.str(it.category, `Item ${i + 1} category`, { required: true, max: 100 });
      let top = (await c.query(`select * from public.material_categories where parent_id is null and lower(trim(name)) = lower(trim($1))`, [name])).rows[0];
      if (top && top.classification && top.classification !== cls) {
        throw badRequest(`Category "${top.name}" already belongs to another classification`);
      }
      if (!top) {
        top = (await c.query(`insert into public.material_categories(name, classification, created_by) values ($1,$2,$3) returning *`,
          [name, cls, req.user.id])).rows[0];
        created.categories.push({ id: top.id, name: top.name, classification: cls });
      } else if (top.status !== 'ACTIVE') {
        await c.query(`update public.material_categories set status = 'ACTIVE', updated_by = $2 where id = $1`, [top.id, req.user.id]);
      }
      if (it.sub_categories !== undefined && it.sub_categories !== null && !Array.isArray(it.sub_categories)) {
        throw badRequest(`Item ${i + 1}: sub-categories must be a list`);
      }
      for (const raw of it.sub_categories || []) {
        const sub = v.str(raw, `Sub-category of ${name}`, { max: 100 });
        if (!sub) continue;
        const ex = (await c.query(`select id, status from public.material_categories where parent_id = $1 and lower(trim(name)) = lower(trim($2))`,
          [top.id, sub])).rows[0];
        if (ex) {
          if (ex.status !== 'ACTIVE') await c.query(`update public.material_categories set status = 'ACTIVE', updated_by = $2 where id = $1`, [ex.id, req.user.id]);
          continue;
        }
        const row = (await c.query(`insert into public.material_categories(name, parent_id, created_by) values ($1,$2,$3) returning *`,
          [sub, top.id, req.user.id])).rows[0];
        created.sub_categories.push({ id: row.id, name: row.name, parent_id: top.id, category: top.name });
      }
    }
    return created;
  });
  res.status(201).json(out);
}));

router.put('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  const name = v.str(b.name, 'Name', { max: 100 });
  if (b.name !== undefined && !name) throw badRequest('Name cannot be empty');
  // classification: only for top-level categories (sub-categories follow their parent); '' clears it.
  const setCls = b.classification !== undefined;
  const { rows } = await query(`update public.material_categories set name = coalesce($2, name), status = coalesce($3, status),
                                  classification = case when $5 and parent_id is null then $6 else classification end,
                                  updated_by = $4 where id = $1 returning *`,
  [id, name, v.oneOf(b.status, 'Status', md.STATUSES), req.user.id, setCls, v.oneOf(b.classification || null, 'Classification', md.CLASSES)]);
  if (!rows[0]) throw notFound('Category not found');
  res.json(rows[0]);
}));

router.delete('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const out = await withTransaction((c) => md.deleteOrDeactivate(c, { table: 'material_categories', id, label: 'Category', userId: req.user.id }));
  res.json(out);
}));

module.exports = router;
