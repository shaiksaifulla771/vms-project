const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { badRequest, notFound } = require('../utils/errors');
const { requireAdmin } = require('../middleware/session');
const { postStock, lockInventory } = require('../services/stock');
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

// Inward (add stock): creates the lot or increases MPN + Location + WH + Lot
router.post('/inward', h(async (req, res) => {
  const b = req.body || {};
  const p = {
    type: 'INWARD',
    mpnId: v.uuid(b.mpn_id, 'MPN', { required: true }),
    locationId: v.uuid(b.location_id, 'Location', { required: true }),
    warehouseId: v.uuid(b.warehouse_id, 'Warehouse', { required: true }),
    lotNo: v.str(b.lot_no, 'Lot No', { required: true, max: 100 }),
    qtyChange: v.num(b.qty, 'Quantity', { required: true, gt: 0 }),
    mfgDate: v.date(b.mfg_date, 'Mfg date'),
    expiryDate: v.date(b.expiry_date, 'Expiry date'),
    vendorId: v.uuid(b.vendor_id, 'Vendor'),
    reason: v.str(b.reason, 'Reason', { max: 500 }) || 'Stock inward',
    referenceType: 'INWARD',
    referenceId: v.str(b.reference, 'Reference', { max: 100 }),
    userId: req.user.id,
  };
  if (p.mfgDate && p.expiryDate && p.expiryDate < p.mfgDate) throw badRequest('Expiry date must be after Mfg date');
  const uom = v.str(b.uom, 'UOM', { max: 20 });
  const ledger = await withTransaction(async (c) => {
    if (uom) {
      const m = (await c.query('select m.uom from public.mpns p join public.materials m on m.id = p.material_id where p.id = $1', [p.mpnId])).rows[0];
      if (m && m.uom.toLowerCase() !== uom.toLowerCase()) {
        throw badRequest(`UOM must be the material's base UOM (${m.uom})`);
      }
    }
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
  const ledger = await withTransaction(async (c) => {
    const inv = await lockInventory(c, inventoryId);
    if (!inv) throw notFound('Lot not found');
    return postStock(c, {
      type: 'OUTWARD', mpnId: inv.mpn_id, locationId: inv.location_id, warehouseId: inv.warehouse_id,
      lotNo: inv.lot_no, qtyChange: -qty, userId: req.user.id, reason,
      referenceType: 'OUTWARD', referenceId: v.str(b.reference, 'Reference', { max: 100 }),
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
    ['l.mpn_id = ?', req.query.mpn_id],
    ['l.material_id = ?', req.query.material_id],
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
      query(`select * from public.v_ledger l ${clause} order by l.txn_no desc limit ${size} offset ${(page - 1) * size}`, params),
      query(`select count(*)::int as n from public.v_ledger l ${clause}`, params),
    ]);
    return res.json({ rows: list.rows, total: total.rows[0].n, page, page_size: size });
  }
  const limit = Math.min(parseInt(req.query.limit || '1000', 10) || 1000, 5000);
  const { rows } = await query(`select * from public.v_ledger l ${clause} order by l.txn_no desc limit ${limit}`, params);
  res.json(rows);
}));

module.exports = router;
