const router = require('express').Router();
const { query, withTransaction, getPool } = require('../db/pool');
const { h, where } = require('../utils/http');
const { badRequest, notFound, conflict, forbidden } = require('../utils/errors');
const { isAdmin } = require('../middleware/session');
const { loadBom } = require('./boms');
const { getSettings } = require('../services/settings');
const planning = require('../services/planning');
const v = require('../utils/validate');

const PLAN_SELECT = `
  select pl.*, m.code as product_code, m.name as product_name, m.uom as product_uom,
         l.code as location_code, l.name as location_name, w.code as warehouse_code,
         b.bom_no, b.version as bom_version, b.expected_output_qty, b.output_uom,
         (select count(*) from public.batches x where x.plan_id = pl.id)::int as batch_count,
         case when pl.plan_mode = 'BATCHES' then pl.target_batches
              else ceil(round(pl.target_qty / b.expected_output_qty, 4))::int end as planned_batches
    from public.plans pl
    join public.materials m on m.id = pl.product_id
    join public.locations l on l.id = pl.location_id
    join public.warehouses w on w.id = pl.warehouse_id
    join public.boms b on b.id = pl.bom_id`;

function wholeBatches(x, name = 'Number of batches') {
  const n = v.num(x, name, { required: true, gt: 0, max: 100000 });
  if (!Number.isInteger(n)) throw badRequest(`${name} must be a whole number`);
  return n;
}

async function activeBomId(db, productId, locationId) {
  const r = await db.query(`select id from public.boms where product_id = $1 and location_id = $2 and status = 'ACTIVE'`,
    [productId, locationId]);
  if (!r.rows[0]) throw badRequest('No ACTIVE BOM for this product at the selected location');
  return r.rows[0].id;
}

/** Plan Summary + Batch Summary + Material Summary (computed live from BOM + inventory). */
async function buildPlanView(db, planId) {
  const plan = (await db.query(`${PLAN_SELECT} where pl.id = $1`, [planId])).rows[0];
  if (!plan) throw notFound('Plan not found');
  const bom = await loadBom(db, plan.bom_id);
  const executed = (await db.query(`
    select id, batch_no, mfg_date, expiry_date, actual_output_qty as qty
      from public.batches where plan_id = $1 order by created_at`, [planId])).rows;

  const active = plan.status !== 'CANCELLED' && plan.status !== 'COMPLETED';
  const eo = Number(bom.expected_output_qty);
  const figs = planning.batchFigures(plan, eo, executed.length);
  // Batch plans: what is left is whole batches, each at the BOM expected output.
  const remaining = plan.plan_mode === 'BATCHES' ? v.round4(figs.remaining_batches * eo) : Number(plan.remaining_qty);
  const batchSummary = [
    ...executed.map((b, i) => ({ index: i + 1, batch_id: b.id, batch_no: b.batch_no, mfg_date: b.mfg_date,
      expiry_date: b.expiry_date, qty: Number(b.qty), executed: true })),
    ...(active ? planning.plannedBatches(remaining, bom.expected_output_qty, executed.length + 1) : []),
  ];
  const materialSummary = await planning.materialSummary(db, bom, active ? remaining : 0,
    plan.apply_scrap_allowance, plan.location_id, plan.id);
  const events = (await db.query(`select e.*, u.full_name as user_name from public.plan_events e
                                    left join public.user_profiles u on u.id = e.user_id
                                   where e.plan_id = $1 order by e.created_at desc`, [planId])).rows;
  return {
    plan,
    planSummary: {
      product: `${plan.product_code} - ${plan.product_name}`,
      plan_no: plan.plan_no,
      plan_mode: plan.plan_mode,
      target_qty: Number(plan.target_qty),
      executed_qty: Number(plan.executed_qty),
      remaining_qty: active ? remaining : 0,
      target_batches: figs.target_batches,
      executed_batches: figs.executed_batches,
      remaining_batches: active ? figs.remaining_batches : 0,
      expected_output_per_batch: eo,
      status: plan.status,
      uom: plan.output_uom,
    },
    batchSummary,
    materialSummary,
    bom,
    events,
  };
}

router.get('/', h(async (req, res) => {
  const { clause, params } = where([
    ['pl.location_id = ?', req.scope.locationId],
    ['pl.warehouse_id = ?', req.scope.warehouseId],
    ['pl.status = ?', req.query.status],
    ['pl.product_id = ?', req.query.product_id],
    ['(pl.plan_no ilike ? or m.code ilike ? or m.name ilike ?)', req.query.q ? `%${req.query.q}%` : null],
  ]);
  const { rows } = await query(`${PLAN_SELECT} ${clause} order by pl.created_at desc limit 1000`, params);
  res.json(rows);
}));

// Simulation: Product + Demand + Location -> 3 summaries, nothing saved
router.post('/simulate', h(async (req, res) => {
  const b = req.body || {};
  const productId = v.uuid(b.product_id, 'Product', { required: true });
  const locationId = v.uuid(b.location_id || req.scope.locationId, 'Location', { required: true });
  const mode = v.oneOf(b.plan_mode, 'Plan by', ['QTY', 'BATCHES'], { def: 'QTY' });
  const db = getPool();
  const settings = await getSettings(db);
  const applyScrap = b.apply_scrap_allowance === undefined ? settings.apply_scrap_allowance : v.bool(b.apply_scrap_allowance);
  const bom = await loadBom(db, await activeBomId(db, productId, locationId));
  let demand;
  let batches;
  if (mode === 'BATCHES') {
    batches = wholeBatches(b.target_batches);
    demand = v.round4(batches * Number(bom.expected_output_qty));
  } else {
    demand = v.num(b.demand_qty, 'Required quantity', { required: true, gt: 0 });
    batches = planning.requiredBatches(demand, bom.expected_output_qty);
  }
  res.json({
    bom,
    apply_scrap_allowance: applyScrap,
    planSummary: {
      product: `${bom.product_code} - ${bom.product_name}`, plan_no: null, plan_mode: mode, target_qty: demand,
      executed_qty: 0, remaining_qty: demand, target_batches: batches, executed_batches: 0, remaining_batches: batches,
      expected_output_per_batch: Number(bom.expected_output_qty), status: 'SIMULATION', uom: bom.output_uom,
    },
    batchSummary: planning.plannedBatches(demand, bom.expected_output_qty),
    materialSummary: await planning.materialSummary(db, bom, demand, applyScrap, locationId),
  });
}));

router.post('/', h(async (req, res) => {
  const b = req.body || {};
  const productId = v.uuid(b.product_id, 'Product', { required: true });
  const locationId = v.uuid(b.location_id || req.scope.locationId, 'Location', { required: true });
  const mode = v.oneOf(b.plan_mode, 'Plan by', ['QTY', 'BATCHES'], { def: 'QTY' });
  const targetBatches = mode === 'BATCHES' ? wholeBatches(b.target_batches) : null;
  let target = mode === 'QTY' ? v.num(b.target_qty, 'Target quantity', { required: true, gt: 0 }) : null;
  const id = await withTransaction(async (c) => {
    const settings = await getSettings(c);
    const bomId = await activeBomId(c, productId, locationId);
    const bom = (await c.query('select warehouse_id, expected_output_qty from public.boms where id = $1', [bomId])).rows[0];
    if (mode === 'BATCHES') target = v.round4(targetBatches * Number(bom.expected_output_qty));
    const warehouseId = v.uuid(b.warehouse_id, 'Warehouse') || bom.warehouse_id;
    const applyScrap = b.apply_scrap_allowance === undefined ? settings.apply_scrap_allowance : v.bool(b.apply_scrap_allowance);
    const r = await c.query(`insert into public.plans(product_id, location_id, warehouse_id, bom_id, target_qty,
                               apply_scrap_allowance, required_date, notes, created_by, plan_mode, target_batches)
                             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [productId, locationId, warehouseId, bomId, target, applyScrap,
      v.date(b.required_date, 'Required date'), v.str(b.notes, 'Notes', { max: 2000 }), req.user.id, mode, targetBatches]);
    await c.query(`insert into public.plan_events(plan_id, event, new_value, user_id) values ($1,'CREATED',$2,$3)`,
      [r.rows[0].id, JSON.stringify(mode === 'BATCHES' ? { target_batches: targetBatches, target_qty: target } : { target_qty: target }),
        req.user.id]);
    return r.rows[0].id;
  });
  res.status(201).json(await buildPlanView(getPool(), id));
}));

router.get('/:id', h(async (req, res) => {
  res.json(await buildPlanView(getPool(), v.uuid(req.params.id, 'id', { required: true })));
}));

/**
 * Dynamic edit. Changing Target_Plan_Qty is Admin-only (spec RBAC).
 * Remaining = Target - Executed; the response re-explodes the BOM for the remaining
 * quantity and re-checks availability instantly.
 */
router.patch('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  await withTransaction(async (c) => {
    const plan = (await c.query('select * from public.plans where id = $1 for update', [id])).rows[0];
    if (!plan) throw notFound('Plan not found');
    if (plan.status === 'CANCELLED') throw conflict('Plan is cancelled');

    if (b.target_batches !== undefined) {
      if (plan.plan_mode !== 'BATCHES') throw badRequest('This plan is by quantity; change its target quantity instead');
      const tb = wholeBatches(b.target_batches);
      if (tb !== Number(plan.target_batches)) {
        if (!isAdmin(req.user)) throw forbidden('Only Admins can change the number of batches in a plan');
        const done = (await c.query('select count(*)::int as n from public.batches where plan_id = $1', [id])).rows[0].n;
        if (tb < done) throw badRequest(`Number of batches cannot be less than the batches already executed (${done})`);
        const eo = (await c.query('select expected_output_qty from public.boms where id = $1', [plan.bom_id])).rows[0].expected_output_qty;
        await c.query('update public.plans set target_batches = $2, target_qty = $3, updated_by = $4 where id = $1',
          [id, tb, v.round4(tb * Number(eo)), req.user.id]);
        await planning.refreshPlanStatus(c, id);
        await c.query(`insert into public.plan_events(plan_id, event, old_value, new_value, user_id)
                       values ($1,'BATCHES_CHANGED',$2,$3,$4)`,
        [id, JSON.stringify({ target_batches: Number(plan.target_batches) }), JSON.stringify({ target_batches: tb }), req.user.id]);
      }
    }
    if (b.target_qty !== undefined && plan.plan_mode === 'BATCHES' && b.target_batches === undefined) {
      throw badRequest('This plan is by number of batches; change the number of batches instead');
    }
    if (b.target_qty !== undefined && plan.plan_mode !== 'BATCHES') {
      const target = v.num(b.target_qty, 'Target quantity', { required: true, gt: 0 });
      if (target !== Number(plan.target_qty)) {
        if (!isAdmin(req.user)) throw forbidden('Only Admins can change a plan target quantity');
        if (target < Number(plan.executed_qty)) {
          throw badRequest(`Target cannot be less than the executed quantity (${plan.executed_qty})`);
        }
        const status = target <= Number(plan.executed_qty) ? 'COMPLETED' : (Number(plan.executed_qty) > 0 ? 'IN_PROGRESS' : 'OPEN');
        await c.query('update public.plans set target_qty = $2, status = $3, updated_by = $4 where id = $1',
          [id, target, status, req.user.id]);
        await c.query(`insert into public.plan_events(plan_id, event, old_value, new_value, user_id)
                       values ($1,'TARGET_CHANGED',$2,$3,$4)`,
        [id, JSON.stringify({ target_qty: Number(plan.target_qty) }), JSON.stringify({ target_qty: target }), req.user.id]);
      }
    }
    if (b.apply_scrap_allowance !== undefined) {
      await c.query('update public.plans set apply_scrap_allowance = $2, updated_by = $3 where id = $1',
        [id, v.bool(b.apply_scrap_allowance), req.user.id]);
    }
    if (b.notes !== undefined || b.required_date !== undefined) {
      await c.query(`update public.plans set notes = coalesce($2, notes), required_date = coalesce($3, required_date),
                       updated_by = $4 where id = $1`,
      [id, v.str(b.notes, 'Notes', { max: 2000 }), v.date(b.required_date, 'Required date'), req.user.id]);
    }
  });
  res.json(await buildPlanView(getPool(), id));
}));

router.post('/:id/cancel', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  await withTransaction(async (c) => {
    const plan = (await c.query('select * from public.plans where id = $1 for update', [id])).rows[0];
    if (!plan) throw notFound('Plan not found');
    if (plan.status === 'COMPLETED') throw conflict('A completed plan cannot be cancelled');
    await c.query(`update public.plans set status = 'CANCELLED', updated_by = $2 where id = $1`, [id, req.user.id]);
    await c.query(`insert into public.plan_events(plan_id, event, user_id) values ($1,'CANCELLED',$2)`, [id, req.user.id]);
  });
  res.json(await buildPlanView(getPool(), id));
}));

module.exports = router;
module.exports.buildPlanView = buildPlanView;
