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

/** Actual stock per material at a location: quantity > 0, not expired, all warehouses of the location. */
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
 * Requirement vs actual stock per BOM line. There is no reservation in this system:
 * Qty Available is the stock that is really in the location today.
 * MPN and vendor come from the BOM line's own source (services/boms.js), so every screen agrees.
 */
async function materialSummary(db, bom, qty, applyScrap, locationId) {
  const batches = requiredBatches(qty, bom.expected_output_qty);
  const stock = await usableStock(db, bom.lines.map((l) => l.material_id), locationId);
  return bom.lines.map((l) => {
    const req = lineRequirement(l, batches, applyScrap);
    const avail = round4(stock[l.material_id] || 0);
    const diff = round4(avail - req);
    return {
      material_id: l.material_id,
      material_code: l.material_code,
      material_name: l.material_name,
      mpn_code: l.mpn_code || null,
      vendor_name: l.vendor_name || null,
      qty_per_batch: Number(l.qty_per_batch),
      scrap_allowance_pct: Number(l.scrap_allowance_pct),
      qty_required: req,
      qty_available: avail,
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
      from (select count(*)::int as n from public.batches where plan_id = $1 and status <> 'REVERSED') x
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
