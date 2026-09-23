const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { badRequest, notFound, conflict } = require('../utils/errors');
const { postStock } = require('../services/stock');
const v = require('../utils/validate');

const SELECT = `
  select t.*, p.mpn_code, m.code as material_code, m.name as material_name, m.uom,
         fl.code as from_location_code, fw.code as from_warehouse_code,
         tl.code as to_location_code, tw.code as to_warehouse_code,
         cu.full_name as created_by_name
    from public.stock_transfers t
    join public.mpns p on p.id = t.mpn_id
    join public.materials m on m.id = p.material_id
    join public.locations fl on fl.id = t.from_location_id
    join public.warehouses fw on fw.id = t.from_warehouse_id
    join public.locations tl on tl.id = t.to_location_id
    join public.warehouses tw on tw.id = t.to_warehouse_id
    left join public.user_profiles cu on cu.id = t.created_by`;

async function load(db, id) {
  const r = (await db.query(`${SELECT} where t.id = $1`, [id])).rows[0];
  if (!r) throw notFound('Transfer not found');
  return r;
}

router.get('/', h(async (req, res) => {
  const loc = req.scope.locationId;
  const { clause, params } = where([
    ['(t.from_location_id = ? or t.to_location_id = ?)', loc],
    ['t.status = ?', req.query.status],
  ]);
  const { rows } = await query(`${SELECT} ${clause} order by t.created_at desc limit 1000`, params);
  res.json(rows);
}));

router.get('/:id', h(async (req, res) => res.json(await load({ query }, v.uuid(req.params.id, 'id', { required: true })))));

async function availableInLot(c, t) {
  const r = await c.query(`select quantity, expiry_date from public.inventory
                            where mpn_id = $1 and location_id = $2 and warehouse_id = $3 and lot_no = $4`,
  [t.mpn_id, t.from_location_id, t.from_warehouse_id, t.lot_no]);
  return r.rows[0] || null;
}

// Create (DRAFT). Source lot must exist with enough stock; no stock moves yet.
router.post('/', h(async (req, res) => {
  const b = req.body || {};
  const t = {
    mpn_id: v.uuid(b.mpn_id, 'MPN', { required: true }),
    lot_no: v.str(b.lot_no, 'Lot No', { required: true, max: 100 }),
    qty: v.num(b.qty, 'Quantity', { required: true, gt: 0 }),
    from_location_id: v.uuid(b.from_location_id, 'Source location', { required: true }),
    from_warehouse_id: v.uuid(b.from_warehouse_id, 'Source warehouse', { required: true }),
    to_location_id: v.uuid(b.to_location_id, 'Destination location', { required: true }),
    to_warehouse_id: v.uuid(b.to_warehouse_id, 'Destination warehouse', { required: true }),
  };
  if (t.from_warehouse_id === t.to_warehouse_id) throw badRequest('Source and destination warehouse must be different');
  const id = await withTransaction(async (c) => {
    const lot = await availableInLot(c, t);
    if (!lot) throw badRequest(`Lot ${t.lot_no} not found in the source warehouse`);
    if (Number(lot.quantity) < t.qty) throw badRequest(`Insufficient stock in lot ${t.lot_no}: available ${lot.quantity}`);
    const r = await c.query(`insert into public.stock_transfers(mpn_id, lot_no, qty, from_location_id, from_warehouse_id,
                               to_location_id, to_warehouse_id, reason, created_by)
                             values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [t.mpn_id, t.lot_no, t.qty, t.from_location_id, t.from_warehouse_id, t.to_location_id, t.to_warehouse_id,
      v.str(b.reason, 'Reason', { max: 500 }), req.user.id]);
    return r.rows[0].id;
  });
  res.status(201).json(await load({ query }, id));
}));

async function lockTransfer(c, id) {
  const t = (await c.query('select * from public.stock_transfers where id = $1 for update', [id])).rows[0];
  if (!t) throw notFound('Transfer not found');
  return t;
}

// DRAFT -> IN_TRANSIT (validates availability, stock still at source)
router.post('/:id/dispatch', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  await withTransaction(async (c) => {
    const t = await lockTransfer(c, id);
    if (t.status !== 'DRAFT') throw conflict(`Transfer is ${t.status}; only DRAFT can be dispatched`);
    const lot = await availableInLot(c, t);
    if (!lot || Number(lot.quantity) < Number(t.qty)) throw badRequest('Insufficient stock in source lot');
    await c.query(`update public.stock_transfers set status = 'IN_TRANSIT', dispatched_by = $2, dispatched_at = now() where id = $1`,
      [id, req.user.id]);
  });
  res.json(await load({ query }, id));
}));

// IN_TRANSIT -> COMPLETED: stock moves now (two ledger entries, atomic)
router.post('/:id/complete', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  await withTransaction(async (c) => {
    const t = await lockTransfer(c, id);
    if (t.status !== 'IN_TRANSIT') throw conflict(`Transfer is ${t.status}; only IN_TRANSIT can be completed`);
    const src = (await c.query(`select * from public.inventory where mpn_id = $1 and location_id = $2 and warehouse_id = $3 and lot_no = $4`,
      [t.mpn_id, t.from_location_id, t.from_warehouse_id, t.lot_no])).rows[0];
    if (!src) throw badRequest('Source lot no longer exists');
    const common = { mpnId: t.mpn_id, lotNo: t.lot_no, userId: req.user.id, referenceType: 'TRANSFER', referenceId: t.transfer_no };
    await postStock(c, { ...common, type: 'TRANSFER_OUT', locationId: t.from_location_id, warehouseId: t.from_warehouse_id,
      qtyChange: -Number(t.qty), reason: t.reason || 'Stock transfer out', allowExpired: true });
    await postStock(c, { ...common, type: 'TRANSFER_IN', locationId: t.to_location_id, warehouseId: t.to_warehouse_id,
      qtyChange: Number(t.qty), reason: t.reason || 'Stock transfer in', mfgDate: src.mfg_date,
      expiryDate: src.expiry_date, vendorId: src.vendor_id });
    await c.query(`update public.stock_transfers set status = 'COMPLETED', completed_by = $2, completed_at = now() where id = $1`,
      [id, req.user.id]);
  });
  res.json(await load({ query }, id));
}));

router.post('/:id/cancel', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  await withTransaction(async (c) => {
    const t = await lockTransfer(c, id);
    if (!['DRAFT', 'IN_TRANSIT'].includes(t.status)) throw conflict(`Transfer is ${t.status}; it cannot be cancelled`);
    await c.query(`update public.stock_transfers set status = 'CANCELLED', cancelled_by = $2, cancelled_at = now() where id = $1`,
      [id, req.user.id]);
  });
  res.json(await load({ query }, id));
}));

module.exports = router;
