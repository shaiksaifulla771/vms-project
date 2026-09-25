const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { badRequest, notFound, forbidden } = require('../utils/errors');
const { requireAdmin, isAdmin } = require('../middleware/session');
const { postStock, lockInventory, outputMpn } = require('../services/stock');
const v = require('../utils/validate');

// Centralized Inventory (lots) for the selected Location / WH
router.get('/stock', h(async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const { clause, params } = where([
    ['s.location_id = ?', req.scope.locationId],
    ['s.warehouse_id = ?', req.scope.warehouseId],
    ['s.material_id = ?', req.query.material_id],
    ['s.mpn_id = ?', req.query.mpn_id],
    ['s.classification = ?', req.query.classification],
    ['(s.mpn_code ilike ? or s.material_code ilike ? or s.material_name ilike ? or s.lot_no ilike ?)', q],
    ['s.quantity > ?', req.query.include_zero === 'true' ? null : 0],
    ['s.is_expired = ?', req.query.expired === 'true' ? true : (req.query.expired === 'false' ? false : null)],
  ]);
  const { rows } = await query(`select * from public.v_stock s ${clause}
                                 order by s.location_code, s.warehouse_code, s.material_code, s.expiry_date nulls last, s.lot_no`,
  params);
  res.json(rows);
}));

// Available lots for issue/consumption, FEFO (first-expiry-first-out), expired excluded by default
router.get('/lots', h(async (req, res) => {
  if (!req.query.mpn_id && !req.query.material_id) throw badRequest('mpn_id or material_id is required');
  const { clause, params } = where([
    ['s.mpn_id = ?', req.query.mpn_id],
    ['s.material_id = ?', req.query.material_id],
    ['s.location_id = ?', req.query.location_id || req.scope.locationId],
    ['s.warehouse_id = ?', req.query.warehouse_id || null],
    ['s.quantity > ?', 0],
    ['s.is_expired = ?', req.query.include_expired === 'true' ? null : false],
  ]);
  const { rows } = await query(`select * from public.v_stock s ${clause}
                                 order by s.expiry_date nulls last, s.mfg_date nulls last, s.lot_no`, params);
  res.json(rows);
}));

/**
 * Suggestions for the Inward form of a material:
 *   location / WH where it was last received (inside ?location_id when given), else where it is stocked now;
 *   next lot number <material code>-<YYMMDD>-<n>.
 */
router.get('/inward-defaults', h(async (req, res) => {
  const materialId = v.uuid(req.query.material_id, 'Material', { required: true });
  const locationId = v.uuid(req.query.location_id || req.scope.locationId, 'Location');
  const mat = (await query('select code from public.materials where id = $1', [materialId])).rows[0];
  if (!mat) throw notFound('Material not found');
  const last = (await query(`
    select location_id, warehouse_id from (
      select l.location_id, l.warehouse_id, l.txn_at as at, 1 as pri from public.stock_ledger l
       where l.material_id = $1 and l.txn_type in ('INWARD', 'OPENING') and ($2::uuid is null or l.location_id = $2)
      union all
      select i.location_id, i.warehouse_id, i.updated_at, 2 from public.inventory i
       where i.material_id = $1 and i.quantity > 0 and ($2::uuid is null or i.location_id = $2)
    ) x order by pri, at desc limit 1`, [materialId, locationId || null])).rows[0] || null;
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const prefix = `${mat.code}-${ymd}-`;
  const used = (await query(`select lot_no from public.inventory where upper(lot_no) like upper($1) || '%'`, [prefix])).rows
    .map((r) => Number(r.lot_no.slice(prefix.length))).filter((n) => Number.isInteger(n));
  res.json({ last_location_id: last?.location_id || null, last_warehouse_id: last?.warehouse_id || null,
    suggested_lot_no: `${prefix}${used.length ? Math.max(...used) + 1 : 1}` });
}));

// Inward (add stock): creates the lot or increases MPN + Location + WH + Lot.
// Entry type:  PURCHASE (default)  needs an MPN                            -> ledger INWARD, ref PURCHASE
//              OPENING             go-live / first balances                -> ledger OPENING
//              ADJUSTMENT          Admin only, reason required             -> ledger ADJUSTMENT
//
// Finished goods can NEVER be entered here, whatever the entry type: their stock comes only from a
// manufacturing batch, so that what the system holds always matches what was actually produced.
// They still leave through Outward, move by Transfer, and are corrected by an Admin adjustment on an
// existing lot (Stock > Adjust) or an approved physical stock count.
const ENTRY_TYPES = { PURCHASE: 'INWARD', OPENING: 'OPENING', ADJUSTMENT: 'ADJUSTMENT' };

router.post('/inward', h(async (req, res) => {
  const b = req.body || {};
  const entryType = v.oneOf(b.entry_type, 'Entry type', Object.keys(ENTRY_TYPES), { def: 'PURCHASE' });
  if (entryType === 'ADJUSTMENT' && !isAdmin(req.user)) throw forbidden('Only Admins can add stock as an Adjustment');
  const reason = v.str(b.reason, 'Reason', { required: entryType === 'ADJUSTMENT', max: 500 });
  const p = {
    type: ENTRY_TYPES[entryType],
    mpnId: v.uuid(b.mpn_id, 'MPN'),
    locationId: v.uuid(b.location_id, 'Location', { required: true }),
    warehouseId: v.uuid(b.warehouse_id, 'Warehouse', { required: true }),
    lotNo: v.str(b.lot_no, 'Lot No', { required: true, max: 100 }),
    qtyChange: v.num(b.qty, 'Quantity', { required: true, gt: 0 }),
    mfgDate: v.date(b.mfg_date, 'Mfg date'),
    expiryDate: v.date(b.expiry_date, 'Expiry date'),
    vendorId: v.uuid(b.vendor_id, 'Vendor'),
    reason: reason || { PURCHASE: 'Purchase', OPENING: 'Opening stock', ADJUSTMENT: 'Adjustment' }[entryType],
    referenceType: entryType === 'PURCHASE' ? 'PURCHASE' : entryType,
    referenceId: v.str(b.reference, 'Reference', { max: 100 }),
    userId: req.user.id,
  };
  const materialId = v.uuid(b.material_id, 'Material');
  if (!p.mpnId && !materialId) throw badRequest('MPN is required');
  if (p.mfgDate && p.expiryDate && p.expiryDate < p.mfgDate) throw badRequest('Expiry date must be after Mfg date');
  if (p.mfgDate && p.mfgDate > v.today()) throw badRequest('Mfg date cannot be in the future');
  // A goods receipt must be traceable to its purchase document.
  if (/^goods receipt/i.test(p.reason) && !p.referenceId) throw badRequest('Enter the GRN / invoice no for a goods receipt');
  const uom = v.str(b.uom, 'UOM', { max: 20 });
  const ledger = await withTransaction(async (c) => {
    let mat;
    if (p.mpnId) {
      mat = (await c.query(`select m.id, m.uom, m.classification from public.mpns p join public.materials m on m.id = p.material_id
                             where p.id = $1`, [p.mpnId])).rows[0];
      if (!mat) throw badRequest('MPN not found');
      if (materialId && materialId !== mat.id) throw badRequest('MPN does not belong to the selected material');
    } else {
      mat = (await c.query('select id, uom, classification from public.materials where id = $1', [materialId])).rows[0];
      if (!mat) throw badRequest('Material not found');
      if (mat.classification !== 'FINISHED_GOOD') throw badRequest('MPN is required');
      p.mpnId = await outputMpn(c, mat.id, req.user.id); // hidden internal stock code of the finished good
    }
    if (mat.classification === 'FINISHED_GOOD') {
      // Finished goods are made, not bought: they come in as Opening Stock or an Adjustment (or from a batch).
      if (entryType === 'PURCHASE') {
        throw badRequest('Finished goods cannot be purchased. Use Opening Stock or Adjustment, or record a production batch.');
      }
      p.vendorId = null;
    }
    // A production batch lot is changed from the batch (Edit IP / OP), never topped up by Inward.
    const batchLot = (await c.query('select 1 from public.batches where output_mpn_id = $1 and upper(batch_no) = upper($2) limit 1',
      [p.mpnId, p.lotNo])).rows[0];
    if (batchLot) throw badRequest(`Lot ${p.lotNo} is a production batch; change its output from the batch (Edit IP / OP), not by Inward`);
    if (uom && mat.uom.toLowerCase() !== uom.toLowerCase()) throw badRequest(`UOM must be the material's base UOM (${mat.uom})`);
    return postStock(c, p);
  });
  res.status(201).json(ledger);
}));

// Outward (remove stock) from a specific lot. Expired lots are blocked.
router.post('/outward', h(async (req, res) => {
  const b = req.body || {};
  const inventoryId = v.uuid(b.inventory_id, 'Lot', { required: true });
  const qty = v.num(b.qty, 'Quantity', { required: true, gt: 0 });
  const reason = v.str(b.reason, 'Reason', { required: true, max: 500 });
  const reference = v.str(b.reference, 'Reference', { max: 100 });
  // A sale / dispatch must be traceable to its invoice or delivery challan.
  if (/^sale/i.test(reason) && !reference) throw badRequest('Enter the invoice / delivery challan no for a sale or dispatch');
  const ledger = await withTransaction(async (c) => {
    const inv = await lockInventory(c, inventoryId);
    if (!inv) throw notFound('Lot not found');
    return postStock(c, {
      type: 'OUTWARD', mpnId: inv.mpn_id, locationId: inv.location_id, warehouseId: inv.warehouse_id,
      lotNo: inv.lot_no, qtyChange: -qty, userId: req.user.id, reason,
      referenceType: 'OUTWARD', referenceId: reference,
    });
  });
  res.status(201).json(ledger);
}));

// Stock adjustment (Admin only): Adjustment = New Physical Qty - System Qty
router.post('/adjustments', requireAdmin, h(async (req, res) => {
  const b = req.body || {};
  const inventoryId = v.uuid(b.inventory_id, 'Lot', { required: true });
  const physical = v.num(b.new_physical_qty, 'New physical qty', { required: true, min: 0 });
  const reason = v.str(b.reason, 'Reason', { required: true, max: 500 });
  const result = await withTransaction(async (c) => {
    const inv = await lockInventory(c, inventoryId);
    if (!inv) throw notFound('Lot not found');
    const diff = v.round4(physical - Number(inv.quantity));
    if (diff === 0) throw badRequest('Physical quantity equals system quantity - nothing to adjust');
    const ledger = await postStock(c, {
      type: 'ADJUSTMENT', mpnId: inv.mpn_id, locationId: inv.location_id, warehouseId: inv.warehouse_id,
      lotNo: inv.lot_no, qtyChange: diff, userId: req.user.id, reason,
      referenceType: 'ADJUSTMENT', referenceId: `ADJ-${Date.now()}`, allowExpired: true,
    });
    return { system_qty: Number(inv.quantity), new_physical_qty: physical, adjustment_qty: diff, ledger };
  });
  res.status(201).json(result);
}));

// Audit ledger / transaction report
router.get('/ledger', h(async (req, res) => {
  const { clause, params } = where([
    ['l.location_id = ?', req.scope.locationId],
    ['l.warehouse_id = ?', req.scope.warehouseId],
    ['l.mpn_id = ?', v.uuid(req.query.mpn_id, 'MPN')],
    ['l.material_id = ?', v.uuid(req.query.material_id, 'Material')],
    ['l.txn_type = ?', req.query.type],
    ['l.lot_no = ?', req.query.lot_no],
    ['l.reference_id = ?', req.query.reference_id],
    ['l.txn_at >= ?::date', v.date(req.query.from, 'From')],
    [`l.txn_at < (?::date + interval '1 day')`, v.date(req.query.to, 'To')],
    ['(l.mpn_code ilike ? or l.material_code ilike ? or l.material_name ilike ? or l.lot_no ilike ? or l.reference_id ilike ?)',
      req.query.q ? `%${req.query.q}%` : null],
  ]);
  // ?page=N[&page_size=M] returns { rows, total, page, page_size }; without it the plain list (max 5000) as before.
  if (req.query.page !== undefined) {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const size = Math.min(Math.max(parseInt(req.query.page_size || '100', 10) || 100, 10), 1000);
    const [list, total] = await Promise.all([
      query(`select l.*, (select x.classification from public.materials x where x.id = l.material_id) as classification from public.v_ledger l ${clause} order by l.txn_no desc limit ${size} offset ${(page - 1) * size}`, params),
      query(`select count(*)::int as n from public.v_ledger l ${clause}`, params),
    ]);
    return res.json({ rows: list.rows, total: total.rows[0].n, page, page_size: size });
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit || '1000', 10) || 1000, 1), 5000);
  const { rows } = await query(`select l.*, (select x.classification from public.materials x where x.id = l.material_id) as classification from public.v_ledger l ${clause} order by l.txn_no desc limit ${limit}`, params);
  res.json(rows);
}));

module.exports = router;
