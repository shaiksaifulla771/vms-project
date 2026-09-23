const router = require('express').Router();
const { query, withTransaction, getPool } = require('../db/pool');
const { h, where } = require('../utils/http');
const { badRequest, notFound, conflict, forbidden } = require('../utils/errors');
const { isAdmin } = require('../middleware/session');
const { loadBom } = require('./boms');
const { getSettings } = require('../services/settings');
const { postStock, outputMpn } = require('../services/stock');
const v = require('../utils/validate');
const planning = require('../services/planning');

const BATCH_SELECT = `
  select b.*, m.code as product_code, m.name as product_name, p.mpn_code as output_mpn_code,
         l.code as location_code, l.name as location_name, w.code as warehouse_code,
         pl.plan_no, bm.bom_no, bm.version as bom_version
    from public.batches b
    join public.materials m on m.id = b.product_id
    join public.mpns p on p.id = b.output_mpn_id
    join public.locations l on l.id = b.location_id
    join public.warehouses w on w.id = b.warehouse_id
    left join public.plans pl on pl.id = b.plan_id
    left join public.boms bm on bm.id = b.bom_id`;

async function loadBatch(db, id) {
  const batch = (await db.query(`${BATCH_SELECT} where b.id = $1`, [id])).rows[0];
  if (!batch) throw notFound('Batch not found');
  batch.inputs = (await db.query(`
    select bi.*, m.code as material_code, m.name as material_name, p.mpn_code, w.code as warehouse_code,
           i.id as inventory_id, i.expiry_date as lot_expiry_date, i.quantity as lot_balance
      from public.batch_inputs bi
      join public.materials m on m.id = bi.material_id
      left join public.mpns p on p.id = bi.mpn_id
      left join public.warehouses w on w.id = bi.warehouse_id
      left join public.inventory i on i.mpn_id = bi.mpn_id and i.warehouse_id = bi.warehouse_id
                                  and i.lot_no = bi.lot_no and i.location_id = $2
     where bi.batch_id = $1 order by m.code, bi.lot_no`, [id, batch.location_id])).rows;
  return batch;
}

const pct = (actual, plan) => (plan > 0 ? ((actual - plan) / plan) * 100 : 0);

function checkVariance(label, actual, plan, reason, tolerance, override) {
  const p = pct(actual, plan);
  if (plan > 0 && Math.abs(p) > tolerance && !override && !(reason && reason.trim())) {
    throw badRequest(`${label}: variance ${p.toFixed(2)}% exceeds the ${tolerance}% tolerance - enter a reason`);
  }
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

router.get('/', h(async (req, res) => {
  const { clause, params } = where([
    ['b.location_id = ?', req.scope.locationId],
    ['b.warehouse_id = ?', req.scope.warehouseId],
    ['b.plan_id = ?', req.query.plan_id],
    ['b.product_id = ?', req.query.product_id],
    ['b.source = ?', req.query.source],
    ['(b.batch_no ilike ? or m.code ilike ? or m.name ilike ?)', req.query.q ? `%${req.query.q}%` : null],
  ]);
  const { rows } = await query(`${BATCH_SELECT} ${clause} order by b.created_at desc limit 1000`, params);
  res.json(rows);
}));

/**
 * Prefill for Batch Entry: BOM materials with planned input for this batch and
 * FEFO lots available at the location (expired lots excluded).
 */
router.get('/prefill', h(async (req, res) => {
  const db = getPool();
  const settings = await getSettings(db);
  let plan = null;
  let productId = v.uuid(req.query.product_id, 'Product');
  let locationId = v.uuid(req.query.location_id || req.scope.locationId, 'Location');
  let bomId = null;
  let applyScrap = settings.apply_scrap_allowance;

  if (req.query.plan_id) {
    plan = (await db.query('select * from public.plans where id = $1', [v.uuid(req.query.plan_id, 'Plan')])).rows[0];
    if (!plan) throw notFound('Plan not found');
    productId = plan.product_id;
    locationId = plan.location_id;
    bomId = plan.bom_id;
    applyScrap = plan.apply_scrap_allowance;
  }
  if (!productId || !locationId) throw badRequest('Select a plan, or a product and location');
  if (!bomId) {
    bomId = (await db.query(`select id from public.boms where product_id = $1 and location_id = $2 and status = 'ACTIVE'`,
      [productId, locationId])).rows[0]?.id || null;
  }
  const product = (await db.query('select * from public.materials where id = $1', [productId])).rows[0];
  if (!product) throw notFound('Product not found');

  const bom = bomId ? await loadBom(db, bomId) : null;
  const expected = bom ? Number(bom.expected_output_qty) : 0;
  let plannedOutput = v.num(req.query.planned_output, 'Planned output', { min: 0 });
  if (plannedOutput === null) {
    // Batch plans: every batch is one full BOM batch.
    plannedOutput = plan && plan.plan_mode !== 'BATCHES'
      ? Math.min(expected || Number(plan.remaining_qty), Number(plan.remaining_qty)) : expected;
  }
  const scale = expected > 0 ? plannedOutput / expected : 0;

  const lines = [];
  for (const l of (bom?.lines || [])) {
    const factor = applyScrap ? 1 + Number(l.scrap_allowance_pct) / 100 : 1;
    const planned = v.round4(Number(l.qty_per_batch) * scale * factor);
    const lots = (await db.query(`select * from public.v_stock where material_id = $1 and location_id = $2
                                    and quantity > 0 and not is_expired
                                  order by expiry_date nulls last, mfg_date nulls last, lot_no`,
    [l.material_id, locationId])).rows;
    const suggested = lots.find((x) => Number(x.quantity) >= planned) || lots[0] || null;
    lines.push({
      material_id: l.material_id, material_code: l.material_code, material_name: l.material_name,
      uom: l.uom, plan_input_qty: planned, lots, suggested_inventory_id: suggested ? suggested.id : null,
    });
  }
  const mfg = new Date().toISOString().slice(0, 10);
  res.json({
    plan: plan ? { id: plan.id, plan_no: plan.plan_no, remaining_qty: Number(plan.remaining_qty),
      target_qty: Number(plan.target_qty), executed_qty: Number(plan.executed_qty), plan_mode: plan.plan_mode,
      target_batches: plan.target_batches, executed_batches: (await db.query(
        'select count(*)::int as n from public.batches where plan_id = $1', [plan.id])).rows[0].n } : null,
    product: { id: product.id, code: product.code, name: product.name, uom: product.uom },
    location_id: locationId,
    warehouse_id: plan?.warehouse_id || bom?.warehouse_id || null,
    bom: bom ? { id: bom.id, bom_no: bom.bom_no, version: bom.version, expected_output_qty: expected, output_uom: bom.output_uom } : null,
    apply_scrap_allowance: applyScrap,
    planned_output: v.round4(plannedOutput),
    mfg_date: mfg,
    expiry_date: addDays(mfg, product.shelf_life_days || settings.default_shelf_life_days),
    variance_tolerance_pct: settings.variance_tolerance_pct,
    lines,
  });
}));

router.get('/:id', h(async (req, res) => res.json(await loadBatch(getPool(), v.uuid(req.params.id, 'id', { required: true })))));

/** Resolve an input's lot (inventory row) and validate it belongs to the batch location/material. */
async function resolveLot(c, inventoryId, materialId, locationId, label) {
  const inv = (await c.query('select * from public.inventory where id = $1', [inventoryId])).rows[0];
  if (!inv) throw badRequest(`${label}: selected lot not found`);
  if (inv.material_id !== materialId) throw badRequest(`${label}: selected lot is for a different material`);
  if (inv.location_id !== locationId) throw badRequest(`${label}: lot must be at the batch location`);
  return inv;
}

/**
 * Batch Entry (spec Workflow 3 + 4). One DB transaction:
 * validate -> save batch -> consume RM lots -> add FG lot -> update plan.
 * Any failure rolls back everything (no partial inventory changes).
 */
router.post('/', h(async (req, res) => {
  const b = req.body || {};
  const source = v.oneOf(b.source, 'Source', ['PLAN', 'AD_HOC'], { required: true });
  const actualOutput = v.num(b.actual_output_qty, 'Actual output qty', { required: true, gt: 0 });
  const inputs = Array.isArray(b.inputs) ? b.inputs : [];

  const id = await withTransaction(async (c) => {
    const settings = await getSettings(c);
    const tolerance = settings.variance_tolerance_pct;
    const override = v.bool(b.tolerance_override);
    if (override && !isAdmin(req.user)) throw forbidden('Only Admins can override the variance tolerance');

    let plan = null;
    let productId;
    let locationId;
    let bomId = null;
    if (source === 'PLAN') {
      const planId = v.uuid(b.plan_id, 'Plan', { required: true });
      plan = (await c.query('select * from public.plans where id = $1 for update', [planId])).rows[0];
      if (!plan) throw notFound('Plan not found');
      if (!['OPEN', 'IN_PROGRESS'].includes(plan.status)) throw conflict(`Plan is ${plan.status}`);
      productId = plan.product_id;
      locationId = plan.location_id;
      bomId = plan.bom_id;
    } else {
      productId = v.uuid(b.product_id, 'Product', { required: true });
      locationId = v.uuid(b.location_id || req.scope.locationId, 'Location', { required: true });
      bomId = v.uuid(b.bom_id, 'BOM') || (await c.query(
        `select id from public.boms where product_id = $1 and location_id = $2 and status = 'ACTIVE'`,
        [productId, locationId])).rows[0]?.id || null;
    }
    const product = (await c.query('select * from public.materials where id = $1', [productId])).rows[0];
    if (!product) throw notFound('Product not found');

    let warehouseId = v.uuid(b.warehouse_id, 'Warehouse') || plan?.warehouse_id
      || (bomId ? (await c.query('select warehouse_id from public.boms where id = $1', [bomId])).rows[0]?.warehouse_id : null)
      || (await c.query('select id from public.warehouses where location_id = $1 and is_default', [locationId])).rows[0]?.id;
    if (!warehouseId) throw badRequest('Select the output warehouse');

    const planOutput = v.num(b.plan_output_qty, 'Plan output qty', { min: 0 }) || 0;
    const outReason = v.str(b.variance_reason, 'Reason for variance', { max: 1000 });
    checkVariance('Output', actualOutput, planOutput, outReason, tolerance, override);

    const mfgDate = v.date(b.mfg_date, 'Mfg date') || new Date().toISOString().slice(0, 10);
    const expiryDate = v.date(b.expiry_date, 'Expiry date')
      || addDays(mfgDate, product.shelf_life_days || settings.default_shelf_life_days);
    if (expiryDate < mfgDate) throw badRequest('Expiry date must be on or after the Mfg date');
    let batchNo = v.str(b.batch_no, 'Batch No', { max: 60 });
    if (!batchNo) batchNo = (await c.query('select erp.next_batch_no() as n')).rows[0].n;
    const executedBy = v.str(b.executed_by, 'Executed by', { max: 200 }) || req.user.full_name;

    // --- validate inputs (per material: aggregate actual vs plan) ---
    const rows = [];
    const perMaterial = {};
    for (let i = 0; i < inputs.length; i += 1) {
      const x = inputs[i] || {};
      const label = `Input ${i + 1}`;
      const materialId = v.uuid(x.material_id, `${label} material`, { required: true });
      if (materialId === productId) throw badRequest(`${label}: the product cannot consume itself`);
      const planQty = v.num(x.plan_input_qty, `${label} plan qty`, { min: 0 }) || 0;
      const actualQty = v.num(x.actual_input_qty, `${label} actual qty`, { required: true, min: 0 });
      const reason = v.str(x.variance_reason, `${label} reason`, { max: 1000 });
      let inv = null;
      if (actualQty > 0) {
        const inventoryId = v.uuid(x.inventory_id, `${label} Lot No`, { required: true });
        inv = await resolveLot(c, inventoryId, materialId, locationId, label);
      }
      const mat = (await c.query('select code, uom from public.materials where id = $1', [materialId])).rows[0];
      if (!mat) throw badRequest(`${label}: material not found`);
      rows.push({ materialId, planQty, actualQty, reason, inv, uom: mat.uom, code: mat.code });
      const agg = perMaterial[materialId] || (perMaterial[materialId] = { plan: 0, actual: 0, reason: null, code: mat.code });
      agg.plan += planQty;
      agg.actual += actualQty;
      agg.reason = agg.reason || reason;
    }
    for (const agg of Object.values(perMaterial)) {
      checkVariance(`Material ${agg.code}`, agg.actual, agg.plan, agg.reason, tolerance, override);
    }

    // --- save batch ---
    const outMpn = await outputMpn(c, productId, req.user.id);
    const batch = (await c.query(`
      insert into public.batches(batch_no, source, plan_id, product_id, output_mpn_id, bom_id, location_id, warehouse_id,
                                 mfg_date, expiry_date, executed_by, plan_output_qty, actual_output_qty, variance_reason,
                                 output_uom, tolerance_override, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *`,
    [batchNo, source, plan?.id || null, productId, outMpn, bomId, locationId, warehouseId, mfgDate, expiryDate,
      executedBy, planOutput, actualOutput, outReason, product.uom, override, req.user.id])).rows[0];

    // --- consume raw material lots ---
    for (const r of rows) {
      await c.query(`insert into public.batch_inputs(batch_id, material_id, mpn_id, lot_no, warehouse_id, plan_input_qty,
                                                     actual_input_qty, variance_reason, uom)
                     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [batch.id, r.materialId, r.inv?.mpn_id || null, r.inv?.lot_no || null, r.inv?.warehouse_id || null,
        r.planQty, r.actualQty, r.reason, r.uom]);
      if (r.actualQty > 0) {
        await postStock(c, {
          type: 'MFG_CONSUMPTION', mpnId: r.inv.mpn_id, locationId, warehouseId: r.inv.warehouse_id,
          lotNo: r.inv.lot_no, qtyChange: -r.actualQty, userId: req.user.id,
          referenceType: 'BATCH', referenceId: batchNo, reason: r.reason || `Consumed in batch ${batchNo}`,
        });
      }
    }

    // --- add finished goods (lot = batch no) ---
    await postStock(c, {
      type: 'MFG_OUTPUT', mpnId: outMpn, locationId, warehouseId, lotNo: batchNo, qtyChange: actualOutput,
      userId: req.user.id, referenceType: 'BATCH', referenceId: batchNo, mfgDate, expiryDate,
      reason: outReason || `Output of batch ${batchNo}`,
    });

    // --- plan progress ---
    if (plan) {
      await c.query(`update public.plans
                        set executed_qty = executed_qty + $2,
                            status = case when target_qty <= executed_qty + $2 then 'COMPLETED' else 'IN_PROGRESS' end,
                            updated_by = $3
                      where id = $1`, [plan.id, actualOutput, req.user.id]);
      await planning.refreshPlanStatus(c, plan.id);
    }
    return batch.id;
  });
  res.status(201).json(await loadBatch(getPool(), id));
}));

/**
 * Edit IP/OP of an executed batch. Only the delta is posted to inventory
 * (MFG_CORRECTION ledger rows); the plan's executed qty follows the output delta.
 */
router.put('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  await withTransaction(async (c) => {
    const settings = await getSettings(c);
    const tolerance = settings.variance_tolerance_pct;
    const override = v.bool(b.tolerance_override);
    if (override && !isAdmin(req.user)) throw forbidden('Only Admins can override the variance tolerance');

    const batch = (await c.query('select * from public.batches where id = $1 for update', [id])).rows[0];
    if (!batch) throw notFound('Batch not found');
    const common = { userId: req.user.id, referenceType: 'BATCH_EDIT', referenceId: batch.batch_no };

    // Output
    const newOutput = b.actual_output_qty === undefined ? Number(batch.actual_output_qty)
      : v.num(b.actual_output_qty, 'Actual output qty', { required: true, gt: 0 });
    const outReason = b.variance_reason !== undefined ? v.str(b.variance_reason, 'Reason', { max: 1000 }) : batch.variance_reason;
    const outDelta = v.round4(newOutput - Number(batch.actual_output_qty));
    checkVariance('Output', newOutput, Number(batch.plan_output_qty), outReason, tolerance, override || batch.tolerance_override);
    if (outDelta !== 0) {
      await postStock(c, { ...common, type: 'MFG_CORRECTION', mpnId: batch.output_mpn_id, locationId: batch.location_id,
        warehouseId: batch.warehouse_id, lotNo: batch.batch_no, qtyChange: outDelta,
        reason: `Output corrected ${batch.actual_output_qty} -> ${newOutput}${outReason ? `: ${outReason}` : ''}`, allowExpired: true });
      if (batch.plan_id) {
        await c.query(`update public.plans set executed_qty = greatest(executed_qty + $2, 0),
                         status = case when status = 'CANCELLED' then status
                                       when target_qty <= greatest(executed_qty + $2, 0) then 'COMPLETED'
                                       when greatest(executed_qty + $2, 0) > 0 then 'IN_PROGRESS' else 'OPEN' end,
                         updated_by = $3 where id = $1`, [batch.plan_id, outDelta, req.user.id]);
        await planning.refreshPlanStatus(c, batch.plan_id);
      }
    }
    await c.query(`update public.batches set actual_output_qty = $2, variance_reason = $3,
                     tolerance_override = tolerance_override or $4, updated_by = $5 where id = $1`,
    [id, newOutput, outReason, override, req.user.id]);

    // Inputs
    const edits = Array.isArray(b.inputs) ? b.inputs : [];
    for (let i = 0; i < edits.length; i += 1) {
      const x = edits[i] || {};
      const label = `Input ${i + 1}`;
      const reason = v.str(x.variance_reason, `${label} reason`, { max: 1000 });
      const newQty = v.num(x.actual_input_qty, `${label} actual qty`, { required: true, min: 0 });
      let row;
      if (x.id) {
        row = (await c.query('select * from public.batch_inputs where id = $1 and batch_id = $2 for update',
          [v.uuid(x.id, `${label} id`), id])).rows[0];
        if (!row) throw notFound(`${label}: input row not found`);
      } else {
        // new lot / material added to the batch
        const materialId = v.uuid(x.material_id, `${label} material`, { required: true });
        const mat = (await c.query('select uom from public.materials where id = $1', [materialId])).rows[0];
        if (!mat) throw badRequest(`${label}: material not found`);
        row = (await c.query(`insert into public.batch_inputs(batch_id, material_id, plan_input_qty, actual_input_qty, uom)
                              values ($1,$2,$3,0,$4) returning *`,
        [id, materialId, v.num(x.plan_input_qty, `${label} plan qty`, { min: 0 }) || 0, mat.uom])).rows[0];
      }
      // attach a lot if the row had none
      if (!row.lot_no && newQty > 0) {
        const inv = await resolveLot(c, v.uuid(x.inventory_id, `${label} Lot No`, { required: true }), row.material_id, batch.location_id, label);
        row = (await c.query(`update public.batch_inputs set mpn_id = $2, lot_no = $3, warehouse_id = $4 where id = $1 returning *`,
          [row.id, inv.mpn_id, inv.lot_no, inv.warehouse_id])).rows[0];
      }
      const delta = v.round4(newQty - Number(row.actual_input_qty));
      checkVariance(`${label}`, newQty, Number(row.plan_input_qty), reason || row.variance_reason, tolerance, override || batch.tolerance_override);
      if (delta !== 0) {
        if (delta > 0) {
          const lot = (await c.query(`select expiry_date from public.inventory where mpn_id = $1 and location_id = $2
                                        and warehouse_id = $3 and lot_no = $4`,
          [row.mpn_id, batch.location_id, row.warehouse_id, row.lot_no])).rows[0];
          if (lot && lot.expiry_date && lot.expiry_date < new Date().toISOString().slice(0, 10)) {
            throw badRequest(`${label}: lot ${row.lot_no} is expired; more cannot be consumed`);
          }
        }
        await postStock(c, { ...common, type: 'MFG_CORRECTION', mpnId: row.mpn_id, locationId: batch.location_id,
          warehouseId: row.warehouse_id, lotNo: row.lot_no, qtyChange: -delta, allowExpired: delta < 0,
          reason: `Input corrected ${row.actual_input_qty} -> ${newQty}${reason ? `: ${reason}` : ''}` });
      }
      await c.query(`update public.batch_inputs set actual_input_qty = $2, variance_reason = coalesce($3, variance_reason)
                      where id = $1`, [row.id, newQty, reason]);
    }
  });
  res.json(await loadBatch(getPool(), id));
}));

module.exports = router;
