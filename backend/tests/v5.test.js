const ExcelJS = require('exceljs');
const { resetDb, ctx, api, getPool, close } = require('./helpers');

let C;
let admin;
let viewer;
const q = async (sql, p) => (await getPool().query(sql, p)).rows;
const catId = async (name) => (await q('select id from public.material_categories where name = $1 and parent_id is null', [name]))[0].id;
const subId = async (parent, name) => (await q(`select s.id from public.material_categories s join public.material_categories c on c.id = s.parent_id
                                                 where c.name = $1 and s.name = $2`, [parent, name]))[0].id;

beforeAll(async () => {
  await resetDb();
  C = await ctx();
  admin = api(C.admin.id);
  viewer = api(C.viewer.id);
});
afterAll(close);

async function xlsxBase64(headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
}
const MAT_HEADERS = ['Material Name *', 'Classification *', 'Category', 'Sub-category', 'UOM *', 'Shelf Life (days)', 'Status', 'Description'];

describe('Categories per classification', () => {
  test('starter categories exist with their classification; list filters by classification', async () => {
    const rm = (await admin.get('/categories?classification=RAW_MATERIAL')).body;
    const names = rm.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Grains & Pulses', 'Spices & Seasoning', 'Cereals & Pulses']));
    expect(names).not.toContain('Primary Packaging');
    const grains = rm.find((c) => c.name === 'Grains & Pulses');
    expect(grains.classification).toBe('RAW_MATERIAL');
    expect(grains.children.map((s) => s.name)).toEqual(expect.arrayContaining(['Rice', 'Lentils & Dals']));
    expect(grains.children.every((s) => s.classification === 'RAW_MATERIAL')).toBe(true);
    const pk = (await admin.get('/categories?classification=PACKAGING')).body.map((c) => c.name);
    expect(pk).toEqual(expect.arrayContaining(['Primary Packaging', 'Packing Material']));
    expect(pk).not.toContain('Grains & Pulses');
  });

  test('a material cannot use a category of another classification', async () => {
    const bad = await admin.post('/materials', { name: 'Wrong Pouch', classification: 'PACKAGING', uom: 'pcs', category_id: await catId('Grains & Pulses') });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/not for packaging/i);
    const ok = await admin.post('/materials', { name: 'Basmati Test', classification: 'RAW_MATERIAL', uom: 'kg',
      category_id: await catId('Grains & Pulses'), sub_category_id: await subId('Grains & Pulses', 'Rice') });
    expect(ok.status).toBe(201);
  });

  test('changing classification clears a category that no longer fits', async () => {
    const m = (await q(`select id from public.materials where name = 'Basmati Test'`))[0];
    const r = await admin.put(`/materials/${m.id}`, { classification: 'CONSUMABLE' });
    expect(r.status).toBe(200);
    expect(r.body.category_id).toBeNull();
    expect(r.body.sub_category_id).toBeNull();
  });

  test('a category cannot move to another classification while materials of the old one use it', async () => {
    const r = await admin.put(`/categories/${await catId('Cereals & Pulses')}`, { classification: 'PACKAGING' });
    expect(r.status).toBe(400);
    const sub = await admin.post('/categories', { name: 'Oats', parent_id: await catId('Grains & Pulses'), classification: 'PACKAGING' });
    expect(sub.status).toBe(201);
    expect(sub.body.classification).toBe('RAW_MATERIAL'); // follows the parent
  });
});

describe('UOM list', () => {
  test('UOMs are matched case-insensitively; unknown UOMs are rejected with the list', async () => {
    const r = await admin.post('/materials', { name: 'Upper Kg', classification: 'RAW_MATERIAL', uom: 'KG' });
    expect(r.status).toBe(201);
    expect(r.body.uom).toBe('kg');
    const bad = await admin.post('/materials', { name: 'Odd Unit', classification: 'RAW_MATERIAL', uom: 'bucket' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/not in the UOM list.*kg/);
    expect(bad.body.error).not.toMatch(/Settings/);
  });

  test('the dropdown list includes packets, boxes and the other units; it is read-only', async () => {
    const codes = (await admin.get('/uoms')).body.map((u) => u.code);
    expect(codes).toEqual(expect.arrayContaining(['kg', 'g', 'ltr', 'ml', 'pcs', 'nos', 'packet', 'box', 'carton', 'pouch',
      'sachet', 'bottle', 'jar', 'bag', 'roll', 'dozen', 'quintal', 'm']));
    expect((await admin.post('/uoms', { code: 'tin2', name: 'x' })).status).toBe(404);
    const m = await admin.post('/materials', { name: 'Chips Packet', classification: 'PACKAGING', uom: 'Packet' });
    expect(m.status).toBe(201);
    expect(m.body.uom).toBe('packet');
  });

  test('an inactive UOM stays on old records but cannot be picked for new ones', async () => {
    await q(`update public.uoms set status = 'INACTIVE' where code = 'tin'`);
    expect((await admin.get('/uoms?status=ACTIVE')).body.map((u) => u.code)).not.toContain('tin');
    const old = await q(`insert into public.materials(code, name, classification, uom) values ('OLD-TIN', 'Old Tin', 'PACKAGING', 'tin') returning id`);
    expect((await admin.post('/materials', { name: 'New Tin', classification: 'PACKAGING', uom: 'tin' })).status).toBe(400);
    expect((await admin.put(`/materials/${old[0].id}`, { name: 'Old Tin 15L', uom: 'tin' })).status).toBe(200);
    await q(`update public.uoms set status = 'ACTIVE' where code = 'tin'`);
  });

  test('BOM and MPN vendor UOMs must come from the list', async () => {
    const bom = (await admin.get(`/boms/active?product_id=${C.fg.id}&location_id=${C.mum.id}`)).body;
    const lines = bom.lines.map((l) => ({ material_id: l.material_id, mpn_id: l.mpn_id, qty_per_batch: l.qty_per_batch, uom: l.uom,
      scrap_allowance_pct: l.scrap_allowance_pct }));
    const body = { product_id: C.fg.id, location_id: C.mum.id, batch_size: 100, batch_uom: 'bucket', expected_output_qty: 1000, output_uom: 'pcs', lines };
    const bad = await admin.post('/boms', body);
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/Batch UOM "bucket"/);
    const ok = await admin.post('/boms', { ...body, batch_uom: 'KG', output_uom: 'PCS' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ batch_uom: 'kg', output_uom: 'pcs' });

    const mpn = (await admin.get(`/mpns/${C.riceMpn.id}`)).body;
    const vendors = mpn.vendors.map((x) => ({ vendor_id: x.vendor_id, is_preferred: x.is_preferred, uom: 'Kg', moq: x.moq, price: x.price }));
    expect((await admin.put(`/mpns/${C.riceMpn.id}`, { vendors })).status).toBe(200);
    expect((await q('select uom from public.mpn_vendors where mpn_id = $1', [C.riceMpn.id]))[0].uom).toBe('kg');
    vendors[0].uom = 'bucket';
    expect((await admin.put(`/mpns/${C.riceMpn.id}`, { vendors })).status).toBe(400);
  });
});

describe('Bulk entry with option lists', () => {
  test('template has dropdowns: dependent category / sub-category, UOM list, and a Categories sheet', async () => {
    const res = await admin.get('/bulk/materials/template?mode=create').buffer(true)
      .parse((r, cb) => { const d = []; r.on('data', (x) => d.push(x)); r.on('end', () => cb(null, Buffer.concat(d))); });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Materials', 'Instructions', 'Categories', 'Lists']);
    expect(wb.getWorksheet('Lists').state).toBe('hidden');
    const ws = wb.getWorksheet('Materials');
    expect(ws.getCell('B2').dataValidation.formulae[0]).toMatch(/Raw Material/);
    expect(ws.getCell('C2').dataValidation.formulae[0]).toMatch(/MATCH\(\$B2,Lists!/);
    expect(ws.getCell('D5').dataValidation.formulae[0]).toMatch(/MATCH\(\$C5,Lists!/);
    expect(ws.getCell('E2').dataValidation.formulae[0]).toMatch(/^Lists!\$A\$3:\$A\$\d+$/);
    expect(ws.getCell('C2').dataValidation.formulae[0].length).toBeLessThan(255);
    const lists = wb.getWorksheet('Lists');
    const header = lists.getRow(1).values.filter(Boolean);
    expect(header).toEqual(expect.arrayContaining(['UOM', 'Raw Material', 'Packaging', 'Grains & Pulses']));
    const ref = wb.getWorksheet('Categories');
    const rows = [];
    ref.eachRow((r) => rows.push(r.values.slice(1)));
    expect(rows).toEqual(expect.arrayContaining([['Raw Material', 'Grains & Pulses', expect.stringContaining('Rice')]]));
  });

  test('the rows that failed before now pass with list values; wrong ones name the valid choices', async () => {
    const data = await xlsxBase64(MAT_HEADERS, [
      ['Bulk Basmati', 'Raw Material', 'Grains & Pulses', 'Rice', 'KG', 365, 'Active', 'Long grain'],
      ['Bulk Pouch Film', 'Packaging', 'Primary Packaging', 'Laminate Film', 'pcs', '', 'Active', ''],
      ['Bulk Tape', 'Consumable', 'Packing Consumables', 'Tapes', 'roll', '', '', ''],
      ['Bulk Mix FG', 'Finished Good', 'Ready-to-Cook Mixes', 'Rice Mixes', 'pcs', 270, '', ''],
      ['Bulk Wrong Cat', 'Packaging', 'Grains & Pulses', '', 'pcs', '', '', ''],
      ['Bulk Missing Cat', 'Raw Material', 'Grains', '', 'kg', '', '', ''],
      ['Bulk Wrong Sub', 'Raw Material', 'Grains & Pulses', 'Pouches', 'kg', '', '', ''],
      ['Bulk Bad UOM', 'Raw Material', '', '', 'bucket', '', '', ''],
    ]);
    const parsed = await admin.post('/bulk/materials/parse?mode=create', { filename: 'm.xlsx', data });
    const prev = await admin.post('/bulk/materials/preview', { mode: 'create', rows: parsed.body.rows });
    expect(prev.body.summary).toMatchObject({ total: 8, create: 4, errors: 4 });
    const err = (i) => prev.body.rows[i].errors.join(' ');
    expect(err(4)).toMatch(/"Grains & Pulses" is a Raw Material category, not Packaging\. Choose one of: .*Primary Packaging/);
    expect(err(5)).toMatch(/"Grains" does not exist for Raw Material\. Choose one of: .*Grains & Pulses/);
    expect(err(6)).toMatch(/"Pouches" is not under "Grains & Pulses"\. Choose one of: .*Rice/);
    expect(err(7)).toMatch(/UOM "bucket" is not in the UOM list/);

    const good = await admin.post('/bulk/materials/commit', { mode: 'create', rows: parsed.body.rows.slice(0, 4) });
    expect(good.status).toBe(201);
    const b = (await q(`select m.uom, c.name cat, s.name sub from public.materials m join public.material_categories c on c.id = m.category_id
                         join public.material_categories s on s.id = m.sub_category_id where m.name = 'Bulk Basmati'`))[0];
    expect(b).toEqual({ uom: 'kg', cat: 'Grains & Pulses', sub: 'Rice' });
  });

  test('bulk update: classification change clears the old category; UOM checked', async () => {
    const code = (await q(`select code from public.materials where name = 'Bulk Tape'`))[0].code;
    const prev = await admin.post('/bulk/materials/preview', { mode: 'update', rows: [
      { row_no: 2, code, classification: 'Packaging' },
      { row_no: 3, code: 'RM-RICE', uom: 'bucket' },
    ] });
    expect(prev.body.rows[0].changes.map((c) => c.field)).toEqual(['Classification', 'Category']);
    expect(prev.body.rows[1].errors.join(' ')).toMatch(/not in the UOM list/);
  });
});

describe('Products', () => {
  test('list shows finished / semi-finished goods with active BOM, cost per unit and stock in scope', async () => {
    const r = await admin.get('/products').set('X-Location-Id', C.mum.id);
    expect(r.status).toBe(200);
    expect(r.body.every((p) => ['FINISHED_GOOD', 'SEMI_FINISHED'].includes(p.classification))).toBe(true);
    const fg = r.body.find((p) => p.code === 'FG-RL1');
    expect(fg.active_boms.length).toBeGreaterThan(0);
    expect(fg.bom_in_scope.location_code).toBe('MUM');
    expect(fg.cost_per_unit).toBeGreaterThan(0);
    expect(Number(fg.stock_qty)).toBeGreaterThanOrEqual(0);
    const other = await admin.get('/products').set('X-Location-Id', C.pun.id);
    expect(other.body.find((p) => p.code === 'FG-RL1').bom_in_scope).toBeNull();
  });

  test('detail has BOM versions, stock lots and plans', async () => {
    const r = await admin.get(`/products/${C.fg.id}`);
    expect(r.status).toBe(200);
    expect(r.body.boms.length).toBeGreaterThan(0);
    expect(Array.isArray(r.body.stock)).toBe(true);
    expect(Array.isArray(r.body.plans)).toBe(true);
    expect((await admin.get(`/products/${C.rice.id}`)).status).toBe(404);
  });
});

describe('v6: MPN is the vendor-material link; smart Inward / Outward', () => {
  test('vendor supplied materials come from MPNs; old manual links are listed as unpriced', async () => {
    const ven = (await admin.post('/vendors', { name: 'Link Test Vendor' })).body;
    await q('insert into public.vendor_materials(vendor_id, material_id) values ($1, $2)', [ven.id, C.pouch.id]); // pre-v6 manual link
    let v = (await admin.get(`/vendors/${ven.id}`)).body;
    expect(v.materials).toEqual([]);
    expect(v.unpriced_links.map((m) => m.code)).toEqual(['PK-POUCH']);
    const mpn = await admin.post('/mpns', { material_id: C.pouch.id, vendors: [{ vendor_id: ven.id, uom: 'pcs', moq: 500, price: 3 }] });
    expect(mpn.status).toBe(201);
    v = (await admin.get(`/vendors/${ven.id}`)).body;
    expect(v.materials.map((m) => m.code)).toEqual(['PK-POUCH']);
    expect(v.unpriced_links).toEqual([]);
    const suppliers = (await admin.get(`/vendors?material_id=${C.pouch.id}`)).body.map((x) => x.id);
    expect(suppliers).toContain(ven.id);
    expect((await admin.put(`/vendors/${ven.id}`, { material_ids: [C.rice.id] })).status).toBe(200); // ignored
    expect((await admin.get(`/vendors/${ven.id}`)).body.materials.map((m) => m.code)).toEqual(['PK-POUCH']);
  });

  test('inward defaults: last received location / WH and the next lot number', async () => {
    const d = (await admin.get(`/inventory/inward-defaults?material_id=${C.rice.id}`)).body;
    expect(d.last_location_id).toBe(C.mum.id);
    expect(d.last_warehouse_id).toBe(C.wh1.id);
    expect(d.suggested_lot_no).toMatch(/^RM-RICE-\d{6}-1$/);
    const r = await admin.post('/inventory/inward', { mpn_id: C.riceMpn.id, location_id: C.pun.id, warehouse_id: C.punWh.id,
      lot_no: d.suggested_lot_no, qty: 10, reason: 'Goods receipt' });
    expect(r.status).toBe(201);
    const d2 = (await admin.get(`/inventory/inward-defaults?material_id=${C.rice.id}`)).body;
    expect(d2.last_location_id).toBe(C.pun.id); // most recent receipt
    expect(d2.suggested_lot_no).toMatch(/-2$/);
    const inMum = (await admin.get(`/inventory/inward-defaults?material_id=${C.rice.id}&location_id=${C.mum.id}`)).body;
    expect(inMum.last_location_id).toBe(C.mum.id);
  });

  test('outward lots: all locations when no location is chosen', async () => {
    const all = (await admin.get(`/inventory/lots?material_id=${C.rice.id}`)).body;
    expect(new Set(all.map((l) => l.location_code))).toEqual(new Set(['MUM', 'PUN']));
    const mum = (await admin.get(`/inventory/lots?material_id=${C.rice.id}&location_id=${C.mum.id}`)).body;
    expect(mum.every((l) => l.location_code === 'MUM')).toBe(true);
  });
});
