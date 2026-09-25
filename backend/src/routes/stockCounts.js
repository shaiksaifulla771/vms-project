/**
 * Physical stock count.
 *   DRAFT (snapshot taken, sheet printable) -> COUNTING (counts being entered)
 *   -> SUBMITTED (locked, waiting for Admin) -> POSTED (adjustments posted)
 *   Admin can send a submitted count back to COUNTING. DRAFT/COUNTING/SUBMITTED can be cancelled.
 * Stock never changes before approval; approval posts every variance in one transaction.
 *
 * The difference of a line is measured against the system stock AT THE TIME THE SHELF WAS COUNTED
 * (book_qty = snapshot qty + ledger movements after the snapshot up to counted_at). Stock received or
 * issued between starting the sheet and counting is therefore not reported as a +/- difference,
 * and movements after counting are kept when the difference is posted.
 * A lot can be on only one open count at a time, so a difference can never be posted twice.
 */
const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { badRequest, notFound, conflict, forbidden } = require('../utils/errors');
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
         (select coalesce(json_agg(json_build_object('uom', t.uom, 'plus', t.plus, 'minus', t.minus) order by t.uom), '[]')
            from (select i.uom, coalesce(sum(x.variance_qty) filter (where x.variance_qty > 0), 0)::float as plus,
                         coalesce(sum(x.variance_qty) filter (where x.variance_qty < 0), 0)::float as minus
                    from public.stock_count_lines x join public.inventory i on i.id = x.inventory_id
                   where x.count_id = sc.id and x.variance_qty <> 0 group by i.uom) t) as variance_by_uom
    from public.stock_counts sc
    join public.locations l on l.id = sc.location_id
    left join public.warehouses w on w.id = sc.warehouse_id
    left join public.material_categories cat on cat.id = sc.category_id
    left join public.user_profiles cu on cu.id = sc.created_by
    left join public.user_profiles su on su.id = sc.submitted_by
    left join public.user_profiles au on au.id = sc.approved_by`;

/** Recompute book_qty (system qty at the time each line was counted) for every line of a count. */
async function refreshBook(c, countId) {
  await c.query(`
    update public.stock_count_lines cl
       set book_qty = case when cl.counted_at is null then cl.snapshot_qty
                           else cl.snapshot_qty + coalesce((
                             select sum(l.qty_change) from public.stock_ledger l
                              where l.inventory_id = cl.inventory_id and l.txn_no > sc.snapshot_txn_no
                                and l.txn_at <= cl.counted_at
                                and not (l.reference_type = 'STOCK_COUNT' and l.reference_id = sc.count_no)), 0) end
      from public.stock_counts sc
     where sc.id = cl.count_id and cl.count_id = $1`, [countId]);
}

/** Lots in a count's scope (location / WH / classification / category); $1..$5 = location, WH, class, category, include zero. */
const SCOPE_SQL = `
  from public.inventory i
  join public.materials m on m.id = i.material_id
  join public.warehouses w on w.id = i.warehouse_id
 where i.location_id = $1 and (i.quantity > 0 or $5::boolean)
   and ($2::uuid is null or i.warehouse_id = $2)
   and ($3::text is null or m.classification = $3)
   and ($4::uuid is null or m.category_id = $4 or m.sub_category_id = $4)`;

/** A lot may be on only one open count; otherwise its difference could be posted twice. */
async function assertNoOverlap(c, countId) {
  const r = await c.query(`
    select distinct o.count_no from public.stock_count_lines cl
      join public.stock_count_lines ol on ol.inventory_id = cl.inventory_id and ol.count_id <> cl.count_id
      join public.stock_counts o on o.id = ol.count_id
     where cl.count_id = $1 and o.status in ('DRAFT', 'COUNTING', 'SUBMITTED') order by o.count_no`, [countId]);
  if (r.rows.length) {
    throw conflict(`Some of these lots are already on open count ${r.rows.map((x) => x.count_no).join(', ')}. `
      + 'Finish (approve) or cancel that count first, so no difference is posted twice.');
  }
}

/** Optional "counted at" time (ISO); must be after the count started and not in the future. */
function countedAt(value, sc) {
  const s = v.str(value, 'Counted at', { max: 40 });
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw badRequest('Counted at must be a date and time');
  if (d < new Date(sc.snapshot_at)) throw badRequest('Counted at cannot be before the count was started');
  if (d.getTime() > Date.now() + 5 * 60 * 1000) throw badRequest('Counted at cannot be in the future');
  return d.toISOString();
}

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
  if (hide) Object.assign(count, { variance_count: null, variance_by_uom: null });
  count.lines = lines.map((l) => {
    const out = {
      ...l,
      moved_since_snapshot: v.round4(Number(l.current_qty) - Number(l.snapshot_qty) - Number(l.posted_qty || 0)),
      moved_before_count: v.round4(Number(l.book_qty) - Number(l.snapshot_qty)),
      moved_after_count: l.counted_at ? v.round4(Number(l.current_qty) - Number(l.book_qty) - Number(l.posted_qty || 0)) : null,
      reason_label: l.reason_code ? REASONS[l.reason_code] : null,
    };
    if (hide) {
      Object.assign(out, { snapshot_qty: null, book_qty: null, variance_qty: null, current_qty: null,
        moved_since_snapshot: null, moved_before_count: null, moved_after_count: null });
    }
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
  res.json(rows.map((r) => (hideSystemQty(r, req.user) ? { ...r, variance_count: null, variance_by_uom: null } : r)));
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
  const includeZero = v.bool(b.include_zero);
  const id = await withTransaction(async (c) => {
    // Wait for in-flight stock postings, so the snapshot and snapshot_txn_no describe the same moment.
    await c.query('lock table public.stock_ledger in share mode');
    if (warehouseId) {
      const w = (await c.query('select 1 from public.warehouses where id = $1 and location_id = $2', [warehouseId, locationId])).rows[0];
      if (!w) throw badRequest('Warehouse does not belong to the selected location');
    }
    const sc = (await c.query(`insert into public.stock_counts(location_id, warehouse_id, classification, category_id, blind, notes,
                                 counted_by, created_by, include_zero, snapshot_at, snapshot_txn_no)
                               values ($1,$2,$3,$4,$5,$6,$7,$8,$9, clock_timestamp(),
                                       (select coalesce(max(txn_no), 0) from public.stock_ledger)) returning id`,
    [locationId, warehouseId, classification, categoryId, v.bool(b.blind), v.str(b.notes, 'Notes', { max: 1000 }),
      v.str(b.counted_by, 'Counted by', { max: 200 }), req.user.id, includeZero])).rows[0];
    const ins = await c.query(`
      insert into public.stock_count_lines(count_id, line_no, inventory_id, snapshot_qty, book_qty)
      select $6, row_number() over (order by w.code, m.code, i.lot_no), i.id, i.quantity, i.quantity ${SCOPE_SQL}`,
    [locationId, warehouseId, classification, categoryId, includeZero, sc.id]);
    if (ins.rowCount === 0) throw badRequest('No stock found for this location / warehouse / filter - nothing to count');
    await assertNoOverlap(c, sc.id);
    return sc.id;
  });
  res.status(201).json(await loadCount({ query }, id, req.user));
}));

/**
 * Add lots that are in the count's scope but not on the sheet (received after the count started).
 * Their start qty is the stock they had at the snapshot (normally 0), so the receipt itself is not a difference.
 */
router.post('/:id/add-lots', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const added = await withTransaction(async (c) => {
    await c.query('lock table public.stock_ledger in share mode');
    const sc = (await c.query('select * from public.stock_counts where id = $1 for update', [id])).rows[0];
    if (!sc) throw notFound('Stock count not found');
    if (!['DRAFT', 'COUNTING'].includes(sc.status)) throw conflict(`Count is ${sc.status.toLowerCase()} - lots can no longer be added`);
    const ins = await c.query(`
      insert into public.stock_count_lines(count_id, line_no, inventory_id, snapshot_qty, book_qty, added_after_start)
      select $6, (select coalesce(max(line_no), 0) from public.stock_count_lines where count_id = $6)
                 + row_number() over (order by w.code, m.code, i.lot_no),
             i.id, x.at_snapshot, x.at_snapshot, true
        ${SCOPE_SQL.replace('from public.inventory i', `from public.inventory i
        cross join lateral (select i.quantity - coalesce((select sum(l.qty_change) from public.stock_ledger l
                             where l.inventory_id = i.id and l.txn_no > $7), 0) as at_snapshot) x`)}
         and not exists (select 1 from public.stock_count_lines cl where cl.count_id = $6 and cl.inventory_id = i.id)`,
    [sc.location_id, sc.warehouse_id, sc.classification, sc.category_id, sc.include_zero, id, sc.snapshot_txn_no]);
    if (ins.rowCount) await assertNoOverlap(c, id);
    return ins.rowCount;
  });
  res.json({ ...(await loadCount({ query }, id, req.user)), added_lines: added });
}));

/** Save counted quantities / reasons (partial saves allowed). */
router.put('/:id/lines', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  v.objList(b.lines, 'Lines', { required: true, max: 5000 });
  await withTransaction(async (c) => {
    const sc = (await c.query('select * from public.stock_counts where id = $1 for update', [id])).rows[0];
    if (!sc) throw notFound('Stock count not found');
    // While submitted, only an Admin may add reasons (needed for blind counts); quantities are locked.
    const reasonsOnly = sc.status === 'SUBMITTED' && isAdmin(req.user);
    if (!['DRAFT', 'COUNTING'].includes(sc.status) && !reasonsOnly) {
      throw conflict(`Count is ${sc.status.toLowerCase()} - counts can no longer be changed`);
    }
    // When the shelf was counted (e.g. a paper sheet typed in later); default = now.
    const at = reasonsOnly ? null : countedAt(b.counted_at, sc);
    for (const [i, l] of b.lines.entries()) {
      const lineId = v.uuid(l.id, `Line ${i + 1}`, { required: true });
      const reason = v.oneOf(l.reason_code, `Line ${i + 1} reason`, Object.keys(REASONS));
      const note = v.str(l.reason_note, `Line ${i + 1} note`, { max: 500 });
      const r = reasonsOnly
        ? await c.query(`update public.stock_count_lines set reason_code = $3, reason_note = $4 where id = $1 and count_id = $2`,
          [lineId, id, reason, note])
        : await c.query(`update public.stock_count_lines
                            set counted_at = case when $3::numeric is null then null
                                                  when $6::timestamptz is not null then $6::timestamptz
                                                  when counted_qty is distinct from $3::numeric or counted_at is null then now()
                                                  else counted_at end,
                                counted_qty = $3, reason_code = $4, reason_note = $5
                          where id = $1 and count_id = $2`,
        [lineId, id, v.num(l.counted_qty, `Line ${i + 1} counted qty`, { min: 0 }), reason, note, at]);
      if (!r.rowCount) throw badRequest(`Line ${i + 1} does not belong to this count`);
    }
    if (!reasonsOnly) {
      await refreshBook(c, id);
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
    await refreshBook(c, id);
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
 * Approve: post every counted variance (counted - system qty at the time of counting) as an ADJUSTMENT
 * (reference STOCK_COUNT / count no). Movements before the count are already in book_qty and movements
 * after it stay untouched, so nothing is lost or counted twice.
 */
router.post('/:id/approve', requireAdmin, h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const out = await withTransaction(async (c) => {
    const sc = (await c.query('select * from public.stock_counts where id = $1 for update', [id])).rows[0];
    if (!sc) throw notFound('Stock count not found');
    if (sc.status !== 'SUBMITTED') throw conflict('Only a submitted count can be approved');
    await refreshBook(c, id);
    const lines = (await c.query(`select * from public.stock_count_lines where count_id = $1 and counted_qty is not null
                                    order by line_no`, [id])).rows;
    const missing = missingReasons(lines);
    if (missing.length) {
      throw badRequest(`Add a reason for every line with a variance before approving (lines ${missing.map((l) => l.line_no).join(', ')})`,
        { lines: missing.map((l) => l.line_no) });
    }
    // Another count adjusted a lot after this one counted it: posting both would double the correction.
    const clash = (await c.query(`
      select distinct cl.line_no, l.reference_id from public.stock_count_lines cl
        join public.stock_ledger l on l.inventory_id = cl.inventory_id and l.reference_type = 'STOCK_COUNT'
                                   and l.reference_id <> $2 and l.txn_no > $3 and l.txn_at > cl.counted_at
       where cl.count_id = $1 and cl.counted_qty is not null and cl.variance_qty <> 0 order by cl.line_no`,
    [id, sc.count_no, sc.snapshot_txn_no])).rows;
    if (clash.length) {
      throw conflict(`Lines ${clash.map((x) => x.line_no).join(', ')} were already corrected by count `
        + `${[...new Set(clash.map((x) => x.reference_id))].join(', ')} after they were counted here. Send this count back for a recount.`);
    }
    let posted = 0;
    for (const l of lines) {
      const change = v.round4(Number(l.variance_qty));
      if (change === 0) continue;
      const inv = await lockInventory(c, l.inventory_id);
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
  const count = await loadCount({ query }, id, req.user);
  res.json({ ...count, posted_lines: out.posted });
}));

router.post('/:id/cancel', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  // A count waiting for Admin approval can only be cancelled by an Admin.
  const statuses = isAdmin(req.user) ? ['DRAFT', 'COUNTING', 'SUBMITTED'] : ['DRAFT', 'COUNTING'];
  const r = await query(`update public.stock_counts set status = 'CANCELLED', cancelled_by = $2, cancelled_at = now(), updated_by = $2
                          where id = $1 and status = any($3) returning id`, [id, req.user.id, statuses]);
  if (!r.rowCount && !isAdmin(req.user)) {
    const st = (await query('select status from public.stock_counts where id = $1', [id])).rows[0]?.status;
    if (st === 'SUBMITTED') throw forbidden('This count is waiting for Admin approval: only an Admin can cancel it');
  }
  if (!r.rowCount) throw conflict('This count cannot be cancelled');
  res.json(await loadCount({ query }, id, req.user));
}));

module.exports = router;
module.exports.REASONS = REASONS;
