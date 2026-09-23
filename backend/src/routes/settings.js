const router = require('express').Router();
const { getPool, query } = require('../db/pool');
const { h } = require('../utils/http');
const { requireAdmin } = require('../middleware/session');
const { getSettings } = require('../services/settings');
const v = require('../utils/validate');

router.get('/', h(async (req, res) => {
  res.json(await getSettings(getPool()));
}));

// Admin only: global variance tolerance and scrap allowance default
router.put('/', requireAdmin, h(async (req, res) => {
  const b = req.body || {};
  const updates = [];
  if (b.variance_tolerance_pct !== undefined) {
    updates.push(['variance_tolerance_pct', v.num(b.variance_tolerance_pct, 'Variance tolerance %', { min: 0, max: 100 })]);
  }
  if (b.apply_scrap_allowance !== undefined) {
    updates.push(['apply_scrap_allowance', v.bool(b.apply_scrap_allowance)]);
  }
  if (b.default_shelf_life_days !== undefined) {
    updates.push(['default_shelf_life_days', v.num(b.default_shelf_life_days, 'Default shelf life', { min: 1 })]);
  }
  for (const [key, value] of updates) {
    await query(`insert into public.app_settings(key, value, updated_by) values ($1, $2::jsonb, $3)
                 on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`,
      [key, JSON.stringify(value), req.user.id]);
  }
  if (b.company_name) {
    await query('update public.companies set name = $1 where id = (select id from public.companies order by created_at limit 1)',
      [v.str(b.company_name, 'Company name', { max: 200 })]);
  }
  res.json(await getSettings(getPool()));
}));

module.exports = router;
