/**
 * Option lists shared by forms, APIs and bulk upload: UOMs and classification-aware categories.
 */
const { badRequest } = require('../utils/errors');

const CLASS_LABEL = {
  RAW_MATERIAL: 'Raw Material', PACKAGING: 'Packaging', CONSUMABLE: 'Consumable',
  SEMI_FINISHED: 'Semi-Finished', FINISHED_GOOD: 'Finished Good',
};

// Indian states and union territories (vendor addresses)
const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

const lc = (x) => String(x ?? '').trim().toLowerCase();

async function loadUoms(db) {
  const { rows } = await db.query('select code, name, uom_type, status from public.uoms order by sort_order, lower(code)');
  return { list: rows, byLower: new Map(rows.map((u) => [lc(u.code), u])) };
}

/**
 * Match a UOM to the UOM list (case-insensitive) and return its code.
 * Returns an error message instead of throwing when `errors` is given (bulk validation).
 * `current` lets an existing record keep a UOM that has since been made inactive.
 */
function matchUom(uoms, value, label, { required = false, current = null, errors = null } = {}) {
  const fail = (msg) => { if (errors) { errors.push(msg); return undefined; } throw badRequest(msg); };
  if (value === undefined || value === null || String(value).trim() === '') {
    return required ? fail(`${label} is required`) : null;
  }
  const u = uoms.byLower.get(lc(value));
  const active = uoms.list.filter((x) => x.status === 'ACTIVE').map((x) => x.code);
  if (!u) return fail(`${label} "${String(value).trim()}" is not in the UOM list. Use one of: ${active.join(', ')} (or add it under Settings > UOMs)`);
  if (u.status !== 'ACTIVE' && lc(current) !== lc(u.code)) return fail(`UOM "${u.code}" is inactive`);
  return u.code;
}

async function canonUom(db, value, label, opts) {
  return matchUom(await loadUoms(db), value, label, opts);
}

module.exports = { CLASS_LABEL, STATES, loadUoms, matchUom, canonUom };
