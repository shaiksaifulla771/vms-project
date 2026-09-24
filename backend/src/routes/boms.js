const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { notFound, badRequest, conflict } = require('../utils/errors');
const v = require('../utils/validate');
const { loadUoms, matchUom } = require('../services/options');

const { BOM_SELECT, loadBom, r2, r4 } = require('../services/boms');

router.get('/', h(async (req, res) => {
  const { clause, params } = where([
    ['b.product_id = ?', req.query.product_id],
    ['b.location_id = ?', req.scope.locationId],
    ['b.warehouse_id = ?', req.scope.warehouseId],
    ['b.status = ?', req.query.status],
    ['(m.code ilike ? or m.name ilike ? or b.bom_no ilike ?)', req.query.q ? `%${req.query.q}%` : null],
  ]);
  const { rows } = await query(`${BOM_SELECT} ${clause} order by m.code, l.code, b.version desc`, params);
  res.json(rows);
}));

// Active BOM for a product at a location (used by planning & batch entry)
router.get('/active', h(async (req, res) => {
  const productId = v.uuid(req.query.product_id, 'Product', { required: true });
  const locationId = v.uuid(req.query.location_id || req.scope.locationId, 'Location', { required: true });
  const r = await query(`select id from public.boms where product_id = $1 and location_id = $2 and status = 'ACTIVE'`,
    [productId, locationId]);
  if (!r.rows[0]) throw notFound('No active BOM for this product at this location');
  res.json(await loadBom({ query }, r.rows[0].id));
}));

router.get('/:id', h(async (req, res) => {
  res.json(await loadBom({ query }, v.uuid(req.params.id, 'id', { required: true })));
}));

function parseHeader(b) {
  return {
    batchSize: v.num(b.batch_size, 'Batch size', { required: true, gt: 0 }),
    batchUom: v.str(b.batch_uom, 'Batch UOM', { required: true, max: 20 }),
    expectedOutput: v.num(b.expected_output_qty, 'Expected output qty', { required: true, gt: 0 }),
    outputUom: v.str(b.output_uom, 'Output UOM', { max: 20 }),
    notes: v.str(b.notes, 'Notes', { max: 2000 }),
    packingCost: v.num(b.packing_cost, 'Packing cost', { min: 0 }) ?? 0,
    processingCost: v.num(b.processing_cost, 'Processing cost', { min: 0 }) ?? 0,
    overheadCost: v.num(b.overhead_cost, 'Overhead cost', { min: 0 }) ?? 0,
    freightCost: v.num(b.freight_cost, 'Freight cost', { min: 0 }) ?? 0,
  };
}

/** Batch / output UOM must come from the UOM list; an unchanged old value is kept. */
async function canonHeaderUoms(c, hdr, old = {}) {
  const uoms = await loadUoms(c);
  hdr.batchUom = matchUom(uoms, hdr.batchUom, 'Batch UOM', { required: true, current: old.batch_uom });
  hdr.outputUom = matchUom(uoms, hdr.outputUom, 'Output UOM', { current: old.output_uom });
}

async function parseLines(c, productId, lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw badRequest('Add at least one BOM line');
  const uoms = await loadUoms(c);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i] || {};
    const materialId = v.uuid(l.material_id, `Line ${i + 1} material`, { required: true });
    if (materialId === productId) throw badRequest('A product cannot be an ingredient of itself');
    if (seen.has(materialId)) throw badRequest(`Line ${i + 1}: material is listed twice`);
    seen.add(materialId);
    const mat = (await c.query('select code, uom from public.materials where id = $1', [materialId])).rows[0];
    if (!mat) throw badRequest(`Line ${i + 1}: material not found`);
    // Stock, planning and consumption all use the material's base UOM (no conversion), so the line must too.
    const lineUom = v.str(l.uom, `Line ${i + 1} UOM`, { max: 20 });
    if (lineUom && lineUom.toLowerCase() !== String(mat.uom).toLowerCase()) {
      throw badRequest(`Line ${i + 1}: UOM must be the material's stock UOM (${mat.code}: ${mat.uom}); enter the quantity in ${mat.uom}`);
    }
    out.push({
      materialId,
      mpnId: v.uuid(l.mpn_id, `Line ${i + 1} MPN`),
      qty: v.num(l.qty_per_batch, `Line ${i + 1} qty per batch`, { required: true, gt: 0 }),
      uom: matchUom(uoms, v.str(l.uom, `Line ${i + 1} UOM`, { max: 20 }) || mat.uom, `Line ${i + 1} UOM`, { current: mat.uom }),
      scrap: v.num(l.scrap_allowance_pct, `Line ${i + 1} loss %`, { min: 0, max: 99.999 }) || 0,
      price: v.num(l.unit_price, `Line ${i + 1} price`, { min: 0 }),
      notes: v.str(l.notes, `Line ${i + 1} notes`, { max: 500 }),
    });
  }
  return out;
}

async function insertLines(c, bomId, lines) {
  let n = 1;
  for (const l of lines) {
    await c.query(`insert into public.bom_lines(bom_id, line_no, material_id, mpn_id, qty_per_batch, uom, scrap_allowance_pct,
                     unit_price, notes)
                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [bomId, n, l.materialId, l.mpnId, l.qty, l.uom, l.scrap, l.price, l.notes]);
    n += 1;
  }
}

async function activate(c, bomId, userId) {
  const bom = (await c.query('select * from public.boms where id = $1 for update', [bomId])).rows[0];
  if (!bom) throw notFound('BOM not found');
  if (bom.status === 'OBSOLETE') throw conflict('An obsolete BOM cannot be re-activated; create a new version');
  await c.query(`update public.boms set status = 'OBSOLETE', updated_by = $3
                  where product_id = $1 and location_id = $2 and status = 'ACTIVE' and id <> $4`,
  [bom.product_id, bom.location_id, userId, bomId]);
  await c.query(`update public.boms set status = 'ACTIVE', updated_by = $2 where id = $1`, [bomId, userId]);
}

router.post('/', h(async (req, res) => {
  const b = req.body || {};
  const productId = v.uuid(b.product_id, 'Product', { required: true });
  const locationId = v.uuid(b.location_id, 'Location', { required: true });
  let warehouseId = v.uuid(b.warehouse_id, 'Warehouse');
  const hdr = parseHeader(b);

  const id = await withTransaction(async (c) => {
    const product = (await c.query('select * from public.materials where id = $1', [productId])).rows[0];
    if (!product) throw badRequest('Product not found');
    if (!['FINISHED_GOOD', 'SEMI_FINISHED'].includes(product.classification)) {
      throw badRequest('BOM product must be a Finished Good or Semi-Finished material');
    }
    if (!warehouseId) {
      warehouseId = (await c.query('select id from public.warehouses where location_id = $1 and is_default', [locationId])).rows[0]?.id;
    }
    await canonHeaderUoms(c, hdr);
    const lines = await parseLines(c, productId, b.lines);
    const ver = (await c.query('select coalesce(max(version), 0) + 1 as v from public.boms where product_id = $1 and location_id = $2',
      [productId, locationId])).rows[0].v;
    const bom = (await c.query(`insert into public.boms(product_id, location_id, warehouse_id, version, status, batch_size, batch_uom,
                                  expected_output_qty, output_uom, notes, created_by,
                                  packing_cost, processing_cost, overhead_cost, freight_cost)
                                values ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [productId, locationId, warehouseId, ver, hdr.batchSize, hdr.batchUom, hdr.expectedOutput,
        hdr.outputUom || product.uom, hdr.notes, req.user.id,
        hdr.packingCost, hdr.processingCost, hdr.overheadCost, hdr.freightCost])).rows[0];
    await insertLines(c, bom.id, lines);
    if (v.bool(b.activate)) await activate(c, bom.id, req.user.id);
    return bom.id;
  });
  res.status(201).json(await loadBom({ query }, id));
}));

// Only DRAFT BOMs are editable (ACTIVE/OBSOLETE are frozen -> revise into a new version)
router.put('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  const hdr = parseHeader(b);
  await withTransaction(async (c) => {
    const bom = (await c.query('select * from public.boms where id = $1 for update', [id])).rows[0];
    if (!bom) throw notFound('BOM not found');
    if (bom.status !== 'DRAFT') throw conflict('Only DRAFT BOMs can be edited. Create a new version to change an active BOM.');
    await canonHeaderUoms(c, hdr, bom);
    const lines = await parseLines(c, bom.product_id, b.lines);
    let warehouseId = v.uuid(b.warehouse_id, 'Warehouse') || bom.warehouse_id;
    await c.query(`update public.boms set warehouse_id = $2, batch_size = $3, batch_uom = $4, expected_output_qty = $5,
                     output_uom = coalesce($6, output_uom), notes = $7, updated_by = $8,
                     packing_cost = $9, processing_cost = $10, overhead_cost = $11, freight_cost = $12 where id = $1`,
    [id, warehouseId, hdr.batchSize, hdr.batchUom, hdr.expectedOutput, hdr.outputUom, hdr.notes, req.user.id,
      hdr.packingCost, hdr.processingCost, hdr.overheadCost, hdr.freightCost]);
    await c.query('delete from public.bom_lines where bom_id = $1', [id]);
    await insertLines(c, id, lines);
  });
  res.json(await loadBom({ query }, id));
}));

router.post('/:id/activate', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  await withTransaction((c) => activate(c, id, req.user.id));
  res.json(await loadBom({ query }, id));
}));

router.post('/:id/obsolete', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const r = await query(`update public.boms set status = 'OBSOLETE', updated_by = $2 where id = $1 returning id`, [id, req.user.id]);
  if (!r.rows[0]) throw notFound('BOM not found');
  res.json(await loadBom({ query }, id));
}));

// Copy a BOM into a new DRAFT version
router.post('/:id/revise', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const newId = await withTransaction(async (c) => {
    const src = (await c.query('select * from public.boms where id = $1', [id])).rows[0];
    if (!src) throw notFound('BOM not found');
    const ver = (await c.query('select max(version) + 1 as v from public.boms where product_id = $1 and location_id = $2',
      [src.product_id, src.location_id])).rows[0].v;
    const nb = (await c.query(`insert into public.boms(product_id, location_id, warehouse_id, version, status, batch_size, batch_uom,
                                 expected_output_qty, output_uom, notes, created_by,
                                 packing_cost, processing_cost, overhead_cost, freight_cost)
                               select product_id, location_id, warehouse_id, $2, 'DRAFT', batch_size, batch_uom,
                                      expected_output_qty, output_uom, notes, $3,
                                      packing_cost, processing_cost, overhead_cost, freight_cost
                                 from public.boms where id = $1 returning id`,
      [id, ver, req.user.id])).rows[0];
    await c.query(`insert into public.bom_lines(bom_id, line_no, material_id, mpn_id, qty_per_batch, uom, scrap_allowance_pct,
                     unit_price, notes)
                   select $2, line_no, material_id, mpn_id, qty_per_batch, uom, scrap_allowance_pct, unit_price, notes
                     from public.bom_lines where bom_id = $1`, [id, nb.id]);
    return nb.id;
  });
  res.status(201).json(await loadBom({ query }, newId));
}));

/**
 * Scale a recipe to a new batch size. Every line quantity, the expected output and the per-batch
 * costs change by the same factor. preview=true only calculates; otherwise a new DRAFT version is
 * saved and the source BOM is left untouched.
 */
router.post('/:id/scale', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  const newSize = v.num(b.batch_size, 'New batch size', { required: true, gt: 0 });
  const src = await loadBom({ query }, id);
  const factor = newSize / Number(src.batch_size);
  const scaled = {
    factor: r4(factor),
    from: { batch_size: src.batch_size, expected_output_qty: src.expected_output_qty },
    to: { batch_size: r4(newSize), expected_output_qty: r4(Number(src.expected_output_qty) * factor) },
    costs: Object.fromEntries(['packing_cost', 'processing_cost', 'overhead_cost', 'freight_cost']
      .map((k) => [k, { from: Number(src[k] || 0), to: r2(Number(src[k] || 0) * factor) }])),
    lines: src.lines.map((l) => ({
      line_no: l.line_no, material_code: l.material_code, material_name: l.material_name, uom: l.uom,
      from: l.qty_per_batch, to: r4(Number(l.qty_per_batch) * factor),
    })),
  };
  if (scaled.lines.some((l) => l.to <= 0) || scaled.to.expected_output_qty <= 0) {
    throw badRequest('The new batch size is too small: some quantities would round to zero');
  }
  if (v.bool(b.preview)) return res.json(scaled);

  const newId = await withTransaction(async (c) => {
    const ver = (await c.query('select max(version) + 1 as v from public.boms where product_id = $1 and location_id = $2',
      [src.product_id, src.location_id])).rows[0].v;
    const nb = (await c.query(`insert into public.boms(product_id, location_id, warehouse_id, version, status, batch_size, batch_uom,
                                 expected_output_qty, output_uom, notes, created_by,
                                 packing_cost, processing_cost, overhead_cost, freight_cost, scaled_from_bom_id)
                               values ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
    [src.product_id, src.location_id, src.warehouse_id, ver, scaled.to.batch_size, src.batch_uom,
      scaled.to.expected_output_qty, src.output_uom,
      [src.notes, `Scaled x${scaled.factor} from ${src.bom_no} v${src.version}`].filter(Boolean).join('\n'),
      req.user.id, scaled.costs.packing_cost.to, scaled.costs.processing_cost.to, scaled.costs.overhead_cost.to,
      scaled.costs.freight_cost.to, src.id])).rows[0];
    for (const l of src.lines) {
      await c.query(`insert into public.bom_lines(bom_id, line_no, material_id, mpn_id, qty_per_batch, uom, scrap_allowance_pct,
                       unit_price, notes) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [nb.id, l.line_no, l.material_id, l.mpn_id, r4(Number(l.qty_per_batch) * factor), l.uom, l.scrap_allowance_pct,
        l.unit_price, l.notes]);
    }
    return nb.id;
  });
  res.status(201).json(await loadBom({ query }, newId));
}));

module.exports = router;
module.exports.loadBom = loadBom;
