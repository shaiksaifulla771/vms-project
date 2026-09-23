/**
 * Physical stock count.
 *   DRAFT (snapshot taken, sheet printable) -> COUNTING (counts being entered)
 *   -> SUBMITTED (locked, waiting for Admin) -> POSTED (adjustments posted)
 *   Admin can send a submitted count back to COUNTING. DRAFT/COUNTING/SUBMITTED can be cancelled.
 * Stock never changes before approval; approval posts every variance in one transaction.
 */
const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { badRequest, notFound, conflict } = require('../utils/errors');
const { requireAdmin, isAdmin } = require('../middleware/session');
const { postStock, lockInventory } = require('../services/stock');
const v = require('../utils/validate');

const REASONS = {
  DAMAGED: 'Damaged',
  EXPIRED: 'Expired / discarded',
  SPILLAGE: 'Spillage / wastage',
  COUNT_ERROR: 'Earlier counting / entry error',
  THEFT: 'Theft / loss',
  FOUND_EXTRA: 'Found extra stock',
  OTHER: 'Other',
};
const CLASSES = ['RAW_MATERIAL', 'PACKAGING', 'CONSUMABLE', 'SEMI_FINISHED', 'FINISHED_GOOD'];

const HEADER_SQL = `
  select sc.*, l.code as location_code, l.name as location_name, w.code as warehouse_code, w.name as warehouse_name,
         cat.name as category_name,
         cu.full_name as created_by_name, su.full_name as submitted_by_name, au.full_name as approved_by_name,
         (select count(*) from public.stock_count_lines x where x.count_id = sc.id)::int as line_count,
         (select count(*) from public.stock_count_lines x where x.count_id = sc.id and x.counted_qty is not null)::int as counted_count,
         (select count(*) from public.stock_count_lines x where x.count_id = sc.id and x.variance_qty <> 0)::int as variance_count,
         (select coalesce(sum(x.variance_qty) filter (where x.variance_qty > 0), 0) from public.stock_count_lines x where x.count_id = sc.id) as variance_plus,
         (select coalesce(sum(x.variance_qty) filter (where x.variance_qty < 0), 0) from public.stock_count_lines x where x.count_id = sc.id) as variance_minus
    from public.stock_counts sc
    join public.locations l on l.id = sc.location_id
    left join public.warehouses w on w.id = sc.warehouse_id
    left join public.material_categories cat on cat.id = sc.category_id
    left join public.user_profiles cu on cu.id = sc.created_by
    left join public.user_profiles su on su.id = sc.submitted_by
    left join public.user_profiles au on au.id = sc.approved_by`;

const missingReasons = (lines) => lines.filter((l) => l.counted_qty !== null && Number(l.variance_qty) !== 0
  && (!l.reason_code || (l.reason_code === 'OTHER' && !l.reason_note)));

/** Blind counts hide the system quantity from non-admins until the count is submitted. */
function hideSystemQty(count, user) {
  return count.blind && ['DRAFT', 'COUNTING'].includes(count.status) && !isAdmin(user);
}

async function loadCount(db, id, user) {
  const count = (await db.query(`${HEADER_SQL} where sc.id = $1`, [id])).rows[0];
  if (!count) throw notFound('Stock count not found');
  const lines = (await db.query(`
    select cl.*, s.mpn_code, s.material_code, s.material_name, s.classification, s.uom, s.lot_no, s.mfg_date, s.expiry_date,
           s.is_expired, s.location_code, s.warehouse_code, s.quantity as current_qty
      from public.stock_count_lines cl
      join public.v_stock s on s.id = cl.inventory_id
     where cl.count_id = $1 order by cl.line_no`, [id])).rows;
  const hide = hideSystemQty(count, user);
  count.system_qty_hidden = hide;
  if (hide) Object.assign(count, { variance_count: null, variance_plus: null, variance_minus: null });
  count.lines = lines.map((l) => {
    const moved = v.round4(Number(l.current_qty) - Number(l.snapshot_qty));
    const out = { ...l, moved_since_snapshot: moved, reason_label: l.reason_code ? REASONS[l.reason_code] : null };
    if (hide) { out.snapshot_qty = null; out.variance_qty = null; out.current_qty = null; out.moved_since_snapshot = null; }
    return out;
  });
  count.reasons = Object.entries(REASONS).map(([code, label]) => ({ code, label }));
  return count;
}

router.get('/reasons', (req, res) => res.json(Object.entries(REASONS).map(([code, label]) => ({ code, label }))));

router.get('/', h(async (req, res) => {
  const { clause, params } = where([
    ['sc.location_id = ?', req.scope.locationId],
    ['(sc.warehouse_id = ? or sc.warehouse_id is null)', req.scope.warehouseId],
    ['sc.status = ?', req.query.status],
  ]);
  const { rows } = await query(`${HEADER_SQL} ${clause} order by sc.created_at desc limit 500`, params);
  res.json(rows.map((r) => (hideSystemQty(r, req.user) ? { ...r, variance_count: null, variance_plus: null, variance_minus: null } : r)));
}));

router.get('/:id', h(async (req, res) => {
  res.json(await loadCount({ query }, v.uuid(req.params.id, 'id', { required: true }), req.user));
}));

/** Start a count: snapshot every lot with stock in the chosen scope. */
router.post('/', h(async (req, res) => {
  const b = req.body || {};
  const locationId = v.uuid(b.location_id || req.scope.locationId, 'Location', { required: true });
  const warehouseId = v.uuid(b.warehouse_id, 'Warehouse');
  const classification = v.oneOf(b.classification, 'Classification', CLASSES);
  const categoryId = v.uuid(b.category_id, 'Category');
  const id = await withTransaction(async (c) => {
    if (warehouseId) {
      const w = (await c.query('select 1 from public.warehouses where id = $1 and location_id = $2', [warehouseId, locationId])).rows[0];
      if (!w) throw badRequest('Warehouse does not belong to the selected location');
    }
    const sc = (await c.query(`insert into public.stock_counts(location_id, warehouse_id, classification, category_id, blind, notes,
                                 counted_by, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [locationId, warehouseId, classification, categoryId, v.bool(b.blind), v.str(b.notes, 'Notes', { max: 1000 }),
      v.str(b.counted_by, 'Counted by', { max: 200 }), req.user.id])).rows[0];
    const ins = await c.query(`
      insert into public.stock_count_lines(count_id, line_no, inventory_id, snapshot_qty)
      select $1, row_number() over (order by w.code, m.code, i.lot_no), i.id, i.quantity
        from public.inventory i
        join public.materials m on m.id = i.material_id
        join public.warehouses w on w.id = i.warehouse_id
       where i.location_id = $2 and i.quantity > 0
         and ($3::uuid is null or i.warehouse_id = $3)
         and ($4::text is null or m.classification = $4)
         and ($5::uuid is null or m.category_id = $5 or m.sub_category_id = $5)`,
    [sc.id, locationId, warehouseId, classification, categoryId]);
    if (ins.rowCount === 0) throw badRequest('No stock found for this location / warehouse / filter - nothing to count');
    return sc.id;
  });
  res.status(201).json(await loadCount({ query }, id, req.user));
}));

/** Save counted quantities / reasons (partial saves allowed). */
router.put('/:id/lines', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  if (!Array.isArray(b.lines)) throw badRequest('lines must be a list');
  await withTransaction(async (c) => {
    const sc = (await c.query('select * from public.stock_counts where id = $1 for update', [id])).rows[0];
    if (!sc) throw notFound('Stock count not found');
    // While submitted, only an Admin may add reasons (needed for blind counts); quantities are locked.
    const reasonsOnly = sc.status === 'SUBMITTED' && isAdmin(req.user);
    if (!['DRAFT', 'COUNTING'].includes(sc.status) && !reasonsOnly) {
      throw conflict(`Count is ${sc.status.toLowerCase()} - counts can no longer be changed`);
    }
    for (const [i, l] of b.lines.entries()) {
      const lineId = v.uuid(l.id, `Line ${i + 1}`, { required: true });
      const reason = v.oneOf(l.reason_code, `Line ${i + 1} reason`, Object.keys(REASONS));
      const note = v.str(l.reason_note, `Line ${i + 1} note`, { max: 500 });
      const r = reasonsOnly
        ? await c.query(`update public.stock_count_lines set reason_code = $3, reason_note = $4 where id = $1 and count_id = $2`,
          [lineId, id, reason, note])
        : await c.query(`update public.stock_count_lines set counted_qty = $3, reason_code = $4, reason_note = $5
                          where id = $1 and count_id = $2`,
        [lineId, id, v.num(l.counted_qty, `Line ${i + 1} counted qty`, { min: 0 }), reason, note]);
      if (!r.rowCount) throw badRequest(`Line ${i + 1} does not belong to this count`);
    }
    if (!reasonsOnly) {
      await c.query(`update public.stock_counts set status = 'COUNTING', counted_by = coalesce($2, counted_by), updated_by = $3
                      where id = $1`, [id, v.str(b.counted_by, 'Counted by', { max: 200 }), req.user.id]);
    }
  });
  res.json(await loadCount({ query }, id, req.user));
}));

/** Lock the count and send it for approval; every variance needs a reason. */
router.post('/:id/submit', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  await withTransaction(async (c) => {
    const sc = (await c.query('select * from public.stock_counts where id = $1 for update', [id])).rows[0];
    if (!sc) throw notFound('Stock count not found');
    if (!['DRAFT', 'COUNTING'].includes(sc.status)) throw conflict(`Count is ${sc.status.toLowerCase()}`);
    const lines = (await c.query('select * from public.stock_count_lines where count_id = $1 order by line_no', [id])).rows;
    const counted = lines.filter((l) => l.counted_qty !== null);
    if (!counted.length) throw badRequest('Enter at least one counted quantity before submitting');
    // Blind counts: counters can't see variances, so the Admin adds reasons before approving.
    const missing = sc.blind ? [] : missingReasons(counted);
    if (missing.length) {
      throw badRequest(`A reason is required for every line with a variance (lines ${missing.map((l) => l.line_no).join(', ')}). `
        + 'For "Other", add a note.', { lines: missing.map((l) => l.line_no) });
    }
    await c.query(`update public.stock_counts set status = 'SUBMITTED', submitted_by = $2, submitted_at = now(),
                     return_comment = null, updated_by = $2 where id = $1`, [id, req.user.id]);
  });
  res.json(await loadCount({ query }, id, req.user));
}));

router.post('/:id/return', requireAdmin, h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const comment = v.str((req.body || {}).comment, 'Comment', { required: true, max: 1000 });
  const r = await query(`update public.stock_counts set status = 'COUNTING', return_comment = $2, updated_by = $3
                          where id = $1 and status = 'SUBMITTED' returning id`, [id, comment, req.user.id]);
  if (!r.rowCount) throw conflict('Only a submitted count can be sent back');
  res.json(await loadCount({ query }, id, req.user));
}));

/**
 * Approve: post every counted variance as an ADJUSTMENT (reference STOCK_COUNT / count no).
 * The posted change is the counted variance (counted - snapshot), so stock movements made
 * after the snapshot are kept. If any lot moved, the caller must confirm with acknowledge_movements.
 */
router.post('/:id/approve', requireAdmin, h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const ack = v.bool((req.body || {}).acknowledge_movements);
  const out = await withTransaction(async (c) => {
    const sc = (await c.query('select * from public.stock_counts where id = $1 for update', [id])).rows[0];
    if (!sc) throw notFound('Stock count not found');
    if (sc.status !== 'SUBMITTED') throw conflict('Only a submitted count can be approved');
    const lines = (await c.query(`select * from public.stock_count_lines where count_id = $1 and counted_qty is not null
                                    order by line_no`, [id])).rows;
    const missing = missingReasons(lines);
    if (missing.length) {
      throw badRequest(`Add a reason for every line with a variance before approving (lines ${missing.map((l) => l.line_no).join(', ')})`,
        { lines: missing.map((l) => l.line_no) });
    }
    const moved = [];
    const invs = {};
    for (const l of lines) {
      const inv = await lockInventory(c, l.inventory_id);
      invs[l.id] = inv;
      if (v.round4(Number(inv.quantity) - Number(l.snapshot_qty)) !== 0) moved.push(l.line_no);
    }
    if (moved.length && !ack) {
      return { needsAck: true, moved };
    }
    let posted = 0;
    for (const l of lines) {
      const change = v.round4(Number(l.variance_qty));
      if (change === 0) continue;
      const inv = invs[l.id];
      if (Number(inv.quantity) + change < 0) {
        throw badRequest(`Line ${l.line_no} (${inv.lot_no}): stock is now ${inv.quantity}, the count variance ${change} would make it negative`);
      }
      const ledger = await postStock(c, {
        type: 'ADJUSTMENT', mpnId: inv.mpn_id, locationId: inv.location_id, warehouseId: inv.warehouse_id,
        lotNo: inv.lot_no, qtyChange: change, userId: req.user.id, allowExpired: true,
        referenceType: 'STOCK_COUNT', referenceId: sc.count_no,
        reason: `Stock count ${sc.count_no}: ${REASONS[l.reason_code] || 'Variance'}${l.reason_note ? ` - ${l.reason_note}` : ''}`,
      });
      await c.query('update public.stock_count_lines set posted_qty = $2, ledger_id = $3 where id = $1', [l.id, change, ledger.id]);
      posted += 1;
    }
    await c.query(`update public.stock_counts set status = 'POSTED', approved_by = $2, approved_at = now(), updated_by = $2
                    where id = $1`, [id, req.user.id]);
    return { posted };
  });
  if (out.needsAck) {
    return res.status(409).json({
      error: `Stock moved on ${out.moved.length} lot(s) after the count started (lines ${out.moved.join(', ')}). `
        + 'Only the counted variance will be posted on top of the current stock. Confirm to continue.',
      code: 'MOVED_SINCE_SNAPSHOT', lines: out.moved,
    });
  }
  const count = await loadCount({ query }, id, req.user);
  res.json({ ...count, posted_lines: out.posted });
}));

router.post('/:id/cancel', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const r = await query(`update public.stock_counts set status = 'CANCELLED', cancelled_by = $2, cancelled_at = now(), updated_by = $2
                          where id = $1 and status in ('DRAFT', 'COUNTING', 'SUBMITTED') returning id`, [id, req.user.id]);
  if (!r.rowCount) throw conflict('This count cannot be cancelled');
  res.json(await loadCount({ query }, id, req.user));
}));

module.exports = router;
module.exports.REASONS = REASONS;
