const { round4 } = require('../utils/validate');

/**
 * Planning engine (spec Workflow 2)
 *   Required_Batches = ceil(Demand / Expected_Output_Qty)
 *   Required_Qty     = Qty_Per_Batch * Required_Batches * (1 + Scrap_% / 100)   [scrap optional]
 */
function requiredBatches(qty, expectedOutput) {
  const q = Number(qty);
  if (!(q > 0)) return 0;
  return Math.ceil(round4(q / Number(expectedOutput)));
}

function lineRequirement(line, batches, applyScrap) {
  const factor = applyScrap ? 1 + Number(line.scrap_allowance_pct || 0) / 100 : 1;
  return round4(Number(line.qty_per_batch) * batches * factor);
}

/** Usable stock per material at a location: non-expired, quantity > 0, all warehouses of the location. */
async function usableStock(db, materialIds, locationId) {
  if (!materialIds.length) return {};
  const { rows } = await db.query(`
    select material_id, sum(quantity) as qty
      from public.inventory
     where material_id = any($1::uuid[]) and location_id = $2 and quantity > 0
       and (expiry_date is null or expiry_date >= current_date)
     group by material_id`, [materialIds, locationId]);
  return Object.fromEntries(rows.map((r) => [r.material_id, Number(r.qty)]));
}

/**
 * Material still needed by the other open plans at a location (their remaining batches x BOM qty, incl. scrap),
 * so two plans cannot both count on the same stock.
 */
async function reservedByOtherPlans(db, materialIds, locationId, excludePlanId) {
  if (!materialIds.length) return {};
  const { rows } = await db.query(`
    select bl.material_id,
           sum(bl.qty_per_batch * x.batches
               * case when p.apply_scrap_allowance then 1 + bl.scrap_allowance_pct / 100 else 1 end) as qty
      from public.plans p
      join public.boms b on b.id = p.bom_id
      join public.bom_lines bl on bl.bom_id = b.id
      cross join lateral (select case when p.plan_mode = 'BATCHES'
                                      then greatest(p.target_batches - (select count(*) from public.batches x where x.plan_id = p.id), 0)
                                      else ceil(round(p.remaining_qty / b.expected_output_qty, 4)) end as batches) x
     where p.location_id = $2 and p.status in ('OPEN', 'IN_PROGRESS')
       and ($3::uuid is null or p.id <> $3) and bl.material_id = any($1::uuid[])
     group by bl.material_id`, [materialIds, locationId, excludePlanId || null]);
  return Object.fromEntries(rows.map((r) => [r.material_id, round4(r.qty)]));
}

/** Preferred vendor per BOM line (line MPN, else any MPN of the material). */
async function lineVendors(db, bomId) {
  const { rows } = await db.query(`
    select bl.id as line_id,
           coalesce(p.mpn_code, fb.mpn_code) as mpn_code,
           (select ve.name from public.mpn_vendors mv join public.vendors ve on ve.id = mv.vendor_id
             where mv.mpn_id = coalesce(bl.mpn_id, fb.id) order by mv.is_preferred desc, ve.name limit 1) as vendor_name
      from public.bom_lines bl
      left join public.mpns p on p.id = bl.mpn_id
      left join lateral (select id, mpn_code from public.mpns x where x.material_id = bl.material_id
                          order by x.status = 'ACTIVE' desc, x.created_at limit 1) fb on true
     where bl.bom_id = $1`, [bomId]);
  return Object.fromEntries(rows.map((r) => [r.line_id, r]));
}

async function materialSummary(db, bom, qty, applyScrap, locationId, excludePlanId = null) {
  const batches = requiredBatches(qty, bom.expected_output_qty);
  const ids = bom.lines.map((l) => l.material_id);
  const stock = await usableStock(db, ids, locationId);
  const reserved = await reservedByOtherPlans(db, ids, locationId, excludePlanId);
  const vend = await lineVendors(db, bom.id);
  return bom.lines.map((l) => {
    const req = lineRequirement(l, batches, applyScrap);
    const avail = round4(stock[l.material_id] || 0);
    const other = round4(reserved[l.material_id] || 0);
    const free = round4(avail - other);
    const diff = round4(free - req);
    return {
      material_id: l.material_id,
      material_code: l.material_code,
      material_name: l.material_name,
      mpn_code: vend[l.id]?.mpn_code || null,
      vendor_name: vend[l.id]?.vendor_name || null,
      qty_per_batch: Number(l.qty_per_batch),
      scrap_allowance_pct: Number(l.scrap_allowance_pct),
      qty_required: req,
      qty_available: avail,
      qty_reserved: other,
      qty_free: free,
      short_long: diff,
      status: diff < 0 ? 'SHORT' : 'LONG',
      uom: l.uom,
    };
  });
}

/** Planned (not yet executed) batches for a remaining quantity. */
function plannedBatches(remaining, expectedOutput, startIndex = 1) {
  const out = [];
  const n = requiredBatches(remaining, expectedOutput);
  let left = Number(remaining);
  for (let i = 0; i < n; i += 1) {
    const qty = round4(Math.min(Number(expectedOutput), left));
    out.push({ index: startIndex + i, batch_no: null, mfg_date: null, expiry_date: null, qty, executed: false });
    left = round4(left - qty);
  }
  return out;
}

/**
 * Plans by number of batches: status follows executed batches vs planned batches
 * (actual output per batch can differ from expected, so quantity is not used).
 * Quantity plans are left as they are.
 */
async function refreshPlanStatus(c, planId) {
  await c.query(`
    update public.plans p
       set status = case when x.n >= p.target_batches then 'COMPLETED'
                         when x.n > 0 or p.executed_qty > 0 then 'IN_PROGRESS' else 'OPEN' end
      from (select count(*)::int as n from public.batches where plan_id = $1) x
     where p.id = $1 and p.plan_mode = 'BATCHES' and p.status <> 'CANCELLED'`, [planId]);
}

/** Batch figures for any plan (quantity plans derive them from the BOM expected output). */
function batchFigures(plan, expectedOutput, executedBatches) {
  if (plan.plan_mode === 'BATCHES') {
    const target = Number(plan.target_batches);
    return { target_batches: target, executed_batches: executedBatches, remaining_batches: Math.max(target - executedBatches, 0) };
  }
  return {
    target_batches: requiredBatches(plan.target_qty, expectedOutput),
    executed_batches: executedBatches,
    remaining_batches: requiredBatches(plan.remaining_qty, expectedOutput),
  };
}

module.exports = { requiredBatches, lineRequirement, usableStock, materialSummary, plannedBatches, refreshPlanStatus, batchFigures };
