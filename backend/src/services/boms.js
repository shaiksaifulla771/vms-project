/** BOM loading and costing, shared by the BOM and Product APIs. */
const { notFound, badRequest } = require('../utils/errors');

/**
 * The single rule for a BOM line's source, used by every screen and by planning:
 *   the line's MPN (or, when none was chosen, the material's preferred MPN)
 *   -> that MPN's preferred vendor -> its vendor, UOM and price.
 * Prices belong to the MPN, so a BOM never carries its own price.
 * Expects a `bl` (bom line, or any row with material_id / mpn_id) in scope.
 */
const LINE_SOURCE = `
  left join lateral (
    select pp.id as source_mpn_id, pp.mpn_code, mv.vendor_id, mv.vendor_code, mv.vendor_name,
           mv.price, mv.uom as price_uom
      from public.mpns pp
      left join lateral (
        select mv.price, mv.uom, ve.id as vendor_id, ve.code as vendor_code, ve.name as vendor_name
          from public.mpn_vendors mv join public.vendors ve on ve.id = mv.vendor_id
         where mv.mpn_id = pp.id
         order by mv.is_preferred desc, ve.name, mv.id limit 1) mv on true
     where case when bl.mpn_id is not null then pp.id = bl.mpn_id else pp.material_id = bl.material_id end
     order by (pp.status = 'ACTIVE') desc, (mv.vendor_id is null), pp.created_at, pp.id
     limit 1) src on true`;

/** Resolve the source of one (material, MPN) pair - what the BOM screen shows before saving. */
async function lineSource(db, materialId, mpnId) {
  const { rows } = await db.query(`
    select m.code as material_code, m.name as material_name, m.uom, src.*
      from public.materials m
      cross join lateral (select $1::uuid as material_id, $2::uuid as mpn_id) bl
      ${LINE_SOURCE}
     where m.id = $1`, [materialId, mpnId || null]);
  return rows[0] || null;
}

const BOM_SELECT = `
  select b.*, m.code as product_code, m.name as product_name, m.classification as product_classification,
         l.code as location_code, l.name as location_name, w.code as warehouse_code, w.name as warehouse_name,
         (select count(*) from public.bom_lines x where x.bom_id = b.id)::int as line_count
    from public.boms b
    join public.materials m on m.id = b.product_id
    join public.locations l on l.id = b.location_id
    join public.warehouses w on w.id = b.warehouse_id`;

async function loadBom(db, id, depth = 0) {
  const bom = (await db.query(`${BOM_SELECT} where b.id = $1`, [id])).rows[0];
  if (!bom) throw notFound('BOM not found');
  bom.label = bomLabel(bom);
  bom.lines = (await db.query(`
    select bl.*, m.code as material_code, m.name as material_name, m.classification,
           src.source_mpn_id, src.mpn_code, src.vendor_id, src.vendor_name, src.vendor_code,
           src.price as mpn_price, src.price_uom as mpn_price_uom
      from public.bom_lines bl
      join public.materials m on m.id = bl.material_id
      ${LINE_SOURCE}
     where bl.bom_id = $1 order by bl.line_no`, [id])).rows;
  // A semi-finished ingredient made in-house has no bought price: cost it from its own Default BOM
  // (same location first). One level deep is enough for costing and avoids loops.
  if (depth < 2) {
    for (const l of bom.lines) {
      if (l.mpn_price != null || l.classification !== 'SEMI_FINISHED') continue;
      const sub = (await db.query(`select id from public.boms where product_id = $1 and status = 'ACTIVE'
                                    order by (location_id = $2) desc, is_default desc, version desc limit 1`,
      [l.material_id, bom.location_id])).rows[0];
      if (!sub || sub.id === bom.id) continue;
      const sb = await loadBom(db, sub.id, depth + 1);
      if (sb.costing.cost_per_output_unit != null && !sb.costing.unpriced_lines) {
        l.bom_unit_cost = sb.costing.cost_per_output_unit;
        l.bom_cost_source = `${sb.bom_no} v${sb.version}`;
      }
    }
  }
  bom.costing = costBom(bom);
  return bom;
}

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const r4 = (n) => Math.round(Number(n) * 10000) / 10000;

/** Material cost + packing/processing/overhead/freight, per batch and per output unit. */
function costBom(bom) {
  let material = 0;
  let unpriced = 0;
  for (const l of bom.lines) {
    // The MPN price is the only price: a BOM never overrides it.
    const price = l.mpn_price ?? l.bom_unit_cost ?? null;
    l.effective_price = price;
    l.price_source = l.mpn_price != null ? 'MPN' : (l.bom_unit_cost != null ? 'BOM' : null);
    const gross = Number(l.qty_per_batch) * (1 + Number(l.scrap_allowance_pct || 0) / 100);
    l.gross_qty = r4(gross);
    l.line_cost = price == null ? null : r2(gross * Number(price));
    if (price == null) unpriced += 1; else material += gross * Number(price);
  }
  const extra = ['packing_cost', 'processing_cost', 'overhead_cost', 'freight_cost'].reduce((a, k) => a + Number(bom[k] || 0), 0);
  const total = material + extra;
  return {
    material_cost: r2(material),
    packing_cost: r2(bom.packing_cost || 0),
    processing_cost: r2(bom.processing_cost || 0),
    overhead_cost: r2(bom.overhead_cost || 0),
    freight_cost: r2(bom.freight_cost || 0),
    total_batch_cost: r2(total),
    cost_per_output_unit: Number(bom.expected_output_qty) > 0 ? r4(total / Number(bom.expected_output_qty)) : null,
    unpriced_lines: unpriced,
  };
}

/** "BOM-1001 v2 · Standard (Default)" */
function bomLabel(b) {
  return `${b.bom_no} v${b.version}${b.name ? ` · ${b.name}` : ''}${b.is_default ? ' (Default)' : ''}`;
}

/**
 * Which BOM a plan or batch uses. An explicit bom_id must be ACTIVE and belong to the product and
 * location; otherwise the Default BOM is used, or the only active one. Several active BOMs and no
 * Default -> the user must choose.
 */
async function resolveBom(db, { productId, locationId, bomId }) {
  if (bomId) {
    const b = (await db.query('select id, product_id, location_id, status from public.boms where id = $1', [bomId])).rows[0];
    if (!b) throw badRequest('BOM not found');
    if (productId && b.product_id !== productId) throw badRequest('The selected BOM is for a different product');
    if (locationId && b.location_id !== locationId) throw badRequest('The selected BOM is for a different location');
    if (b.status !== 'ACTIVE') throw badRequest('The selected BOM is not active');
    return b.id;
  }
  const { rows } = await db.query(`select id, is_default from public.boms
                                    where product_id = $1 and location_id = $2 and status = 'ACTIVE'
                                    order by is_default desc, version desc`, [productId, locationId]);
  if (!rows.length) throw badRequest('No active BOM for this product at the selected location');
  if (rows[0].is_default || rows.length === 1) return rows[0].id;
  throw badRequest('This product has several active BOMs at this location: choose one');
}

module.exports = { resolveBom, bomLabel, BOM_SELECT, LINE_SOURCE, lineSource, loadBom, costBom, r2, r4 };
