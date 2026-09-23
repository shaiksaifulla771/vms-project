const DEFAULTS = {
  variance_tolerance_pct: 5.0,
  apply_scrap_allowance: true,
  default_shelf_life_days: 365,
};

async function getSettings(db) {
  const { rows } = await db.query('select key, value from public.app_settings');
  const out = { ...DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  out.variance_tolerance_pct = Number(out.variance_tolerance_pct);
  out.apply_scrap_allowance = out.apply_scrap_allowance === true || out.apply_scrap_allowance === 'true';
  out.default_shelf_life_days = Number(out.default_shelf_life_days);
  return out;
}

module.exports = { getSettings, DEFAULTS };
