/** BOM loading and costing, shared by the BOM and Product APIs. */
const { notFound } = require('../utils/errors');

const BOM_SELECT = `
  select b.*, m.code as product_code, m.name as product_name,
         l.code as location_code, l.name as location_name, w.code as warehouse_code, w.name as warehouse_name,
         (select count(*) from public.bom_lines x where x.bom_id = b.id)::int as line_count
    from public.boms b
    join public.materials m on m.id = b.product_id
    join public.locations l on l.id = b.location_id
    join public.warehouses w on w.id = b.warehouse_id`;

async function loadBom(db, id) {
  const bom = (await db.query(`${BOM_SELECT} where b.id = $1`, [id])).rows[0];
  if (!bom) throw notFound('BOM not found');
  bom.lines = (await db.query(`
    select bl.*, m.code as material_code, m.name as material_name, m.classification,
           p.mpn_code, src.vendor_name, src.vendor_code, src.price as mpn_price, src.price_uom as mpn_price_uom
      from public.bom_lines bl
      join public.materials m on m.id = bl.material_id
      left join public.mpns p on p.id = bl.mpn_id
      left join lateral (
        -- Price source: the line's MPN (preferred vendor first), else any MPN of the material with a price.
        select ve.name as vendor_name, ve.code as vendor_code, mv.price, mv.uom as price_uom
          from public.mpns pp join public.mpn_vendors mv on mv.mpn_id = pp.id join public.vendors ve on ve.id = mv.vendor_id
         where (bl.mpn_id is not null and pp.id = bl.mpn_id) or (bl.mpn_id is null and pp.material_id = bl.material_id)
         order by mv.is_preferred desc, (mv.price is null), pp.created_at
         limit 1) src on true
     where bl.bom_id = $1 order by bl.line_no`, [id])).rows;
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
    const price = l.unit_price ?? l.mpn_price;
    l.effective_price = price ?? null;
    l.price_source = l.unit_price != null ? 'OVERRIDE' : (l.mpn_price != null ? 'MPN' : null);
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

module.exports = { BOM_SELECT, loadBom, costBom, r2, r4 };
