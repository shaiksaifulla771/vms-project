/**
 * Thin wrapper around erp.post_stock() - the only way stock changes.
 * Always call inside withTransaction() so multi-line operations are atomic.
 */
async function postStock(c, p) {
  // Inventory and ledger are both numeric(18,4): round the change once here, so they can never
  // round differently and drift apart. A change that rounds to nothing is refused.
  const qty = Math.round(Number(p.qtyChange) * 10000) / 10000;
  if (!Number.isFinite(qty) || qty === 0) {
    const { badRequest } = require('../utils/errors');
    throw badRequest('Quantity is too small: use at most 4 decimal places');
  }
  p = { ...p, qtyChange: qty };
  const { rows } = await c.query(
    `select * from erp.post_stock($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [p.type, p.mpnId, p.locationId, p.warehouseId, p.lotNo, p.qtyChange, p.userId,
      p.referenceType || null, p.referenceId || null, p.reason || null,
      p.mfgDate || null, p.expiryDate || null, p.vendorId || null, p.allowExpired === true]);
  return rows[0];
}

/** Lock and return an inventory row by id. */
async function lockInventory(c, inventoryId) {
  const { rows } = await c.query('select * from public.inventory where id = $1 for update', [inventoryId]);
  return rows[0] || null;
}

/** Output MPN of a produced material (auto-created = material code if missing). */
async function outputMpn(c, materialId, userId) {
  const r = await c.query(`select id from public.mpns where material_id = $1 and status = 'ACTIVE'
                            order by (mpn_code = (select code from public.materials where id = $1)) desc, created_at limit 1`,
  [materialId]);
  if (r.rows[0]) return r.rows[0].id;
  // An inactive stock code of this material is switched back on rather than failing.
  const inactive = (await c.query(`update public.mpns set status = 'ACTIVE' where id = (
                                     select id from public.mpns where material_id = $1 order by created_at limit 1) returning id`,
  [materialId])).rows[0];
  if (inactive) return inactive.id;
  const m = (await c.query('select code from public.materials where id = $1', [materialId])).rows[0];
  const ins = await c.query(`insert into public.mpns(mpn_code, material_id, description, created_by)
                             values ($1,$2,'Auto-created for production output',$3)
                             on conflict (mpn_code) do nothing returning id`, [m.code, materialId, userId]);
  if (ins.rows[0]) return ins.rows[0].id;
  // Created at the same moment by another request: use that one.
  const again = (await c.query('select id from public.mpns where material_id = $1 order by created_at limit 1', [materialId])).rows[0];
  if (again) return again.id;
  const { conflict } = require('../utils/errors');
  throw conflict(`Material ${m.code} has no usable stock code: its code is already used by another material's MPN`);
}

module.exports = { postStock, lockInventory, outputMpn };
