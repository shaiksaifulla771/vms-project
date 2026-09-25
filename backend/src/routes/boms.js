const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { h, where } = require('../utils/http');
const { notFound, badRequest, conflict } = require('../utils/errors');
const v = require('../utils/validate');
const { loadUoms, matchUom } = require('../services/options');

const { BOM_SELECT, loadBom, lineSource, resolveBom, r2, r4 } = require('../services/boms');

router.get('/', h(async (req, res) => {
  const { clause, params } = where([
    ['b.product_id = ?', v.uuid(req.query.product_id, 'Product')],
    // An explicit location (location-first pickers) wins over the top-bar scope.
    ['b.location_id = ?', v.uuid(req.query.location_id, 'Location') || req.scope.locationId],
    ['b.warehouse_id = ?', req.query.location_id ? null : req.scope.warehouseId],
    ['b.status = ?', v.oneOf(req.query.status, 'Status', ['DRAFT', 'ACTIVE', 'OBSOLETE'])],
    ['m.classification = ?', v.oneOf(req.query.classification, 'Classification', ['FINISHED_GOOD', 'SEMI_FINISHED'])],
    ['(m.code ilike ? or m.name ilike ? or b.bom_no ilike ? or b.name ilike ?)', req.query.q ? `%${req.query.q}%` : null],
  ]);
  const { rows } = await query(`${BOM_SELECT} ${clause}
    order by m.code, l.code, (b.status = 'ACTIVE') desc, b.is_default desc, b.version desc`, params);
  res.json(rows);
}));

// The BOM planning / batch entry would use for a product at a location (Default, or the only active one)
router.get('/active', h(async (req, res) => {
  const productId = v.uuid(req.query.product_id, 'Product', { required: true });
  const locationId = v.uuid(req.query.location_id || req.scope.locationId, 'Location', { required: true });
  const id = await resolveBom({ query }, { productId, locationId, bomId: v.uuid(req.query.bom_id, 'BOM') });
  res.json(await loadBom({ query }, id));
}));

/**
 * Vendor, UOM and price for one ingredient, straight from the MPN - what the BOM screen shows
 * when a material is picked. The BOM never stores a price of its own, so this is the only answer.
 */
router.get('/line-source', h(async (req, res) => {
  const materialId = v.uuid(req.query.material_id, 'Material', { required: true });
  const src = await lineSource({ query }, materialId, v.uuid(req.query.mpn_id, 'MPN'));
  if (!src) throw notFound('Material not found');
  res.json(src);
}));

router.get('/:id', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const bom = await loadBom({ query }, id);
  // Full-page view: where this BOM is used, and the other BOMs of the same product.
  const [plans, batches, siblings] = await Promise.all([
    query(`select id, plan_no, status, target_qty, executed_qty, remaining_qty, created_at from public.plans
            where bom_id = $1 order by created_at desc limit 20`, [id]),
    query(`select id, batch_no, status, mfg_date, actual_output_qty, output_uom from public.batches
            where bom_id = $1 order by created_at desc limit 20`, [id]),
    query(`select b.id, b.bom_no, b.version, b.name, b.status, b.is_default, l.code as location_code
             from public.boms b join public.locations l on l.id = b.location_id
            where b.product_id = $1 and b.id <> $2 order by l.code, (b.status = 'ACTIVE') desc, b.version desc`, [bom.product_id, id]),
  ]);
  res.json({ ...bom, used_in_plans: plans.rows, used_in_batches: batches.rows, other_boms: siblings.rows });
}));

function parseHeader(b) {
  return {
    batchSize: v.num(b.batch_size, 'Batch size', { required: true, gt: 0 }),
    batchUom: v.str(b.batch_uom, 'Batch UOM', { required: true, max: 20 }),
    expectedOutput: v.num(b.expected_output_qty, 'Expected output qty', { required: true, gt: 0 }),
    outputUom: v.str(b.output_uom, 'Output UOM', { max: 20 }),
    notes: v.str(b.notes, 'Notes', { max: 2000 }),
    name: v.str(b.name, 'BOM name', { max: 100 }),
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
    // The price lives on the MPN; a BOM can never carry its own.
    if (l.unit_price !== undefined && l.unit_price !== null && String(l.unit_price).trim() !== '') {
      throw badRequest(`Line ${i + 1}: a price cannot be set on a BOM. Change it on the MPN of this material.`);
    }
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
      notes: v.str(l.notes, `Line ${i + 1} notes`, { max: 500 }),
    });
  }
  return out;
}

async function insertLines(c, bomId, lines) {
  let n = 1;
  for (const l of lines) {
    await c.query(`insert into public.bom_lines(bom_id, line_no, material_id, mpn_id, qty_per_batch, uom, scrap_allowance_pct, notes)
                   values ($1,$2,$3,$4,$5,$6,$7,$8)`, [bomId, n, l.materialId, l.mpnId, l.qty, l.uom, l.scrap, l.notes]);
    n += 1;
  }
}

/** Serialise BOM status changes of one product + location (two users activating at once). */
async function lockProductLocation(c, productId, locationId) {
  await c.query('select pg_advisory_xact_lock(hashtext($1))', [`bom:${productId}:${locationId}`]);
}

/**
 * Activate a DRAFT. Several BOMs can be active side by side. A new version made with "Revise"
 * replaces the BOM it came from (that one becomes obsolete and hands over the Default). The first
 * active BOM of a product + location becomes the Default.
 */
async function activate(c, bomId, userId) {
  let bom = (await c.query('select * from public.boms where id = $1', [bomId])).rows[0];
  if (!bom) throw notFound('BOM not found');
  await lockProductLocation(c, bom.product_id, bom.location_id);
  bom = (await c.query('select * from public.boms where id = $1 for update', [bomId])).rows[0];
  if (bom.status === 'OBSOLETE') throw conflict('An obsolete BOM cannot be re-activated; create a new version');
  if (bom.status === 'ACTIVE') return;
  let makeDefault = false;
  if (bom.revised_from_bom_id) {
    const src = (await c.query(`select is_default from public.boms where id = $1 and status = 'ACTIVE' for update`,
      [bom.revised_from_bom_id])).rows[0];
    if (src) {
      await c.query(`update public.boms set status = 'OBSOLETE', is_default = false, updated_by = $2 where id = $1`,
        [bom.revised_from_bom_id, userId]);
      if (src.is_default) makeDefault = true;
    }
  }
  const hasDefault = (await c.query(`select 1 from public.boms where product_id = $1 and location_id = $2
                                       and status = 'ACTIVE' and is_default and id <> $3`,
  [bom.product_id, bom.location_id, bomId])).rows[0];
  if (!hasDefault) makeDefault = true;
  await c.query(`update public.boms set status = 'ACTIVE', is_default = $3, updated_by = $2 where id = $1`,
    [bomId, userId, makeDefault]);
}

/** Make an ACTIVE BOM the Default of its product + location. */
async function setDefault(c, bomId, userId) {
  const first = (await c.query('select product_id, location_id from public.boms where id = $1', [bomId])).rows[0];
  if (!first) throw notFound('BOM not found');
  await lockProductLocation(c, first.product_id, first.location_id);
  const bom = (await c.query('select * from public.boms where id = $1 for update', [bomId])).rows[0];
  if (bom.status !== 'ACTIVE') throw conflict('Only an active BOM can be the Default');
  await c.query(`update public.boms set is_default = false, updated_by = $3
                  where product_id = $1 and location_id = $2 and is_default and id <> $4`,
  [bom.product_id, bom.location_id, userId, bomId]);
  await c.query('update public.boms set is_default = true, updated_by = $2 where id = $1', [bomId, userId]);
}

/** New DRAFT BOM copied from another (optionally to another location / under a new name). */
async function copyBom(c, srcId, { name, locationId, revise, userId }) {
  const src = (await c.query('select * from public.boms where id = $1', [srcId])).rows[0];
  if (!src) throw notFound('BOM not found');
  const loc = locationId || src.location_id;
  let wh = src.warehouse_id;
  if (loc !== src.location_id) {
    wh = (await c.query('select id from public.warehouses where location_id = $1 order by is_default desc, code limit 1', [loc])).rows[0]?.id;
    if (!wh) throw badRequest('Location not found or it has no warehouse');
  }
  await lockProductLocation(c, src.product_id, loc);
  const ver = (await c.query('select coalesce(max(version), 0) + 1 as v from public.boms where product_id = $1 and location_id = $2',
    [src.product_id, loc])).rows[0].v;
  const nb = (await c.query(`insert into public.boms(product_id, location_id, warehouse_id, version, status, name, batch_size, batch_uom,
                               expected_output_qty, output_uom, notes, created_by,
                               packing_cost, processing_cost, overhead_cost, freight_cost, revised_from_bom_id)
                             select product_id, $2, $3, $4, 'DRAFT', $5, batch_size, batch_uom,
                                    expected_output_qty, output_uom, notes, $6,
                                    packing_cost, processing_cost, overhead_cost, freight_cost, $7
                               from public.boms where id = $1 returning id`,
  [srcId, loc, wh, ver, name === undefined ? src.name : name, userId, revise ? srcId : null])).rows[0];
  await c.query(`insert into public.bom_lines(bom_id, line_no, material_id, mpn_id, qty_per_batch, uom, scrap_allowance_pct, notes)
                 select $2, line_no, material_id, mpn_id, qty_per_batch, uom, scrap_allowance_pct, notes
                   from public.bom_lines where bom_id = $1`, [srcId, nb.id]);
  return nb.id;
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
    await lockProductLocation(c, productId, locationId);
    const ver = (await c.query('select coalesce(max(version), 0) + 1 as v from public.boms where product_id = $1 and location_id = $2',
      [productId, locationId])).rows[0].v;
    const bom = (await c.query(`insert into public.boms(product_id, location_id, warehouse_id, version, status, batch_size, batch_uom,
                                  expected_output_qty, output_uom, notes, created_by,
                                  packing_cost, processing_cost, overhead_cost, freight_cost, name)
                                values ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
      [productId, locationId, warehouseId, ver, hdr.batchSize, hdr.batchUom, hdr.expectedOutput,
        hdr.outputUom || product.uom, hdr.notes, req.user.id,
        hdr.packingCost, hdr.processingCost, hdr.overheadCost, hdr.freightCost, hdr.name])).rows[0];
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
                     packing_cost = $9, processing_cost = $10, overhead_cost = $11, freight_cost = $12, name = $13 where id = $1`,
    [id, warehouseId, hdr.batchSize, hdr.batchUom, hdr.expectedOutput, hdr.outputUom, hdr.notes, req.user.id,
      hdr.packingCost, hdr.processingCost, hdr.overheadCost, hdr.freightCost, hdr.name]);
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

router.post('/:id/set-default', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  await withTransaction((c) => setDefault(c, id, req.user.id));
  res.json(await loadBom({ query }, id));
}));

/** Rename any BOM (the name is only a label, so it can change at any status). */
router.post('/:id/rename', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const name = v.str((req.body || {}).name, 'BOM name', { max: 100 });
  const r = await query('update public.boms set name = $2, updated_by = $3 where id = $1 returning id', [id, name, req.user.id]);
  if (!r.rows[0]) throw notFound('BOM not found');
  res.json(await loadBom({ query }, id));
}));

router.post('/:id/obsolete', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  await withTransaction(async (c) => {
    const first = (await c.query('select product_id, location_id from public.boms where id = $1', [id])).rows[0];
    if (!first) throw notFound('BOM not found');
    await lockProductLocation(c, first.product_id, first.location_id);
    // Re-read under the lock: a concurrent Set as Default may have just changed it.
    const bom = (await c.query('select * from public.boms where id = $1 for update', [id])).rows[0];
    await c.query(`update public.boms set status = 'OBSOLETE', is_default = false, updated_by = $2 where id = $1`, [id, req.user.id]);
    // The newest other active BOM takes over as Default, so planning keeps working.
    if (bom.is_default) {
      await c.query(`update public.boms set is_default = true, updated_by = $3 where id = (
                       select id from public.boms where product_id = $1 and location_id = $2 and status = 'ACTIVE'
                        order by version desc limit 1)`, [bom.product_id, bom.location_id, req.user.id]);
    }
  });
  res.json(await loadBom({ query }, id));
}));

// New version of a BOM: a DRAFT that replaces its source when activated
router.post('/:id/revise', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const newId = await withTransaction((c) => copyBom(c, id, { revise: true, userId: req.user.id }));
  res.status(201).json(await loadBom({ query }, newId));
}));

// Copy a BOM into a separate new BOM (side by side), optionally to another location / name
router.post('/:id/copy', h(async (req, res) => {
  const id = v.uuid(req.params.id, 'id', { required: true });
  const b = req.body || {};
  const newId = await withTransaction((c) => copyBom(c, id, {
    name: v.str(b.name, 'BOM name', { max: 100 }), locationId: v.uuid(b.location_id, 'Location'), userId: req.user.id,
  }));
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
    await lockProductLocation(c, src.product_id, src.location_id);
    const ver = (await c.query('select max(version) + 1 as v from public.boms where product_id = $1 and location_id = $2',
      [src.product_id, src.location_id])).rows[0].v;
    const nb = (await c.query(`insert into public.boms(product_id, location_id, warehouse_id, version, status, batch_size, batch_uom,
                                 expected_output_qty, output_uom, notes, created_by,
                                 packing_cost, processing_cost, overhead_cost, freight_cost, scaled_from_bom_id, name)
                               values ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
    [src.product_id, src.location_id, src.warehouse_id, ver, scaled.to.batch_size, src.batch_uom,
      scaled.to.expected_output_qty, src.output_uom,
      [src.notes, `Scaled x${scaled.factor} from ${src.bom_no} v${src.version}`].filter(Boolean).join('\n'),
      req.user.id, scaled.costs.packing_cost.to, scaled.costs.processing_cost.to, scaled.costs.overhead_cost.to,
      scaled.costs.freight_cost.to, src.id, src.name])).rows[0];
    for (const l of src.lines) {
      await c.query(`insert into public.bom_lines(bom_id, line_no, material_id, mpn_id, qty_per_batch, uom, scrap_allowance_pct, notes)
                     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [nb.id, l.line_no, l.material_id, l.mpn_id, r4(Number(l.qty_per_batch) * factor), l.uom, l.scrap_allowance_pct, l.notes]);
    }
    return nb.id;
  });
  res.status(201).json(await loadBom({ query }, newId));
}));

module.exports = router;
module.exports.loadBom = loadBom;
