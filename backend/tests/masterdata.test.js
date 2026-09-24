const ExcelJS = require('exceljs');
const { resetDb, ctx, api, getPool, close } = require('./helpers');

let C;
let admin;
let viewer;
const q = async (sql, p) => (await getPool().query(sql, p)).rows;

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

describe('Auto codes', () => {
  test('materials, vendors and MPNs get M/V/MPN codes that are never reused', async () => {
    const m1 = await admin.post('/materials', { name: 'Test Salt', classification: 'RAW_MATERIAL', uom: 'kg' });
    expect(m1.status).toBe(201);
    expect(m1.body.code).toMatch(/^M\d{4,}$/);
    const del = await admin.del(`/materials/${m1.body.id}`);
    expect(del.body.action).toBe('deleted');
    const m2 = await admin.post('/materials', { name: 'Test Pepper', classification: 'RAW_MATERIAL', uom: 'kg' });
    expect(Number(m2.body.code.slice(1))).toBe(Number(m1.body.code.slice(1)) + 1);

    const v1 = await admin.post('/vendors', { name: 'Code Test Vendor' });
    expect(v1.body.code).toMatch(/^V\d{4,}$/);
    const p1 = await admin.post('/mpns', { material_id: m2.body.id });
    expect(p1.body.mpn_code).toMatch(/^MPN\d{4,}$/);
  });

  test('hand-typed codes in the auto format are rejected and codes cannot change', async () => {
    const bad = await admin.post('/materials', { code: 'M9999', name: 'X', classification: 'RAW_MATERIAL', uom: 'kg' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/assigned automatically/);
    const legacy = await admin.post('/materials', { code: 'RM-LEGACY', name: 'Legacy', classification: 'RAW_MATERIAL', uom: 'kg' });
    expect(legacy.body.code).toBe('RM-LEGACY');
    await expect(q(`update public.materials set code = 'RM-OTHER' where id = $1`, [legacy.body.id])).rejects.toThrow(/cannot be changed/);
  });

  test('a material in use is deactivated instead of deleted', async () => {
    const r = await admin.del(`/materials/${C.rice.id}`);
    expect(r.status).toBe(200);
    expect(r.body.action).toBe('deactivated');
    expect((await q('select status from public.materials where id = $1', [C.rice.id]))[0].status).toBe('INACTIVE');
    await admin.put(`/materials/${C.rice.id}`, { status: 'ACTIVE' });
  });
});

describe('Material categories', () => {
  test('sub-category must belong to the chosen category', async () => {
    const grains = (await admin.post('/categories', { name: 'Grains' })).body;
    const rice = (await admin.post('/categories', { name: 'Rice', parent_id: grains.id })).body;
    const spices = (await admin.post('/categories', { name: 'Spices' })).body;
    const deeper = await admin.post('/categories', { name: 'Basmati', parent_id: rice.id });
    expect(deeper.status).toBe(400);
    const dup = await admin.post('/categories', { name: 'grains' });
    expect(dup.status).toBe(409);

    const ok = await admin.post('/materials', { name: 'Brown Rice', classification: 'RAW_MATERIAL', uom: 'kg',
      category_id: grains.id, sub_category_id: rice.id, description: 'Whole grain' });
    expect(ok.status).toBe(201);
    const wrong = await admin.post('/materials', { name: 'Cumin', classification: 'RAW_MATERIAL', uom: 'kg',
      category_id: spices.id, sub_category_id: rice.id });
    expect(wrong.status).toBe(400);
    const got = await admin.get(`/materials/${ok.body.id}`);
    expect(got.body.category_name).toBe('Grains');
    expect(got.body.sub_category_name).toBe('Rice');
    const tree = await admin.get('/categories');
    expect(tree.body.find((c) => c.name === 'Grains').children.map((c) => c.name)).toEqual(['Rice']);
  });
});

describe('Vendor master', () => {
  test('addresses, contacts, bank and supplied materials are saved; account masked in view', async () => {
    const body = {
      name: 'Fresh Farms', phone: '+91 98200 11111', contact_email: 'sales@freshfarms.in', gstin: '27AAPFU0939F1ZV',
      fssai_no: '11521999000123', fssai_expiry: '2027-06-30',
      addresses: [
        { address_name: 'Head Office', line1: '12 Market Rd', city: 'Pune', state: 'MH', pincode: '411001' },
        { address_name: 'Warehouse', address_type: 'SECONDARY', is_default: true, city: 'Nashik', pincode: '422001' },
      ],
      contacts: [{ name: 'Ravi', designation: 'Sales', phone: '9820011111', email: 'ravi@freshfarms.in' }],
      bank_accounts: [{ account_holder: 'Fresh Farms LLP', account_number: '123456789012', ifsc: 'HDFC0001234', bank_name: 'HDFC' }],
      material_ids: [C.rice.id, C.lentil.id], // ignored since v6: supplied materials come from MPNs
    };
    const r = await admin.post('/vendors', body);
    expect(r.status).toBe(201);
    const v = (await admin.get(`/vendors/${r.body.id}`)).body;
    expect(v.addresses).toHaveLength(2);
    expect(v.addresses.find((a) => a.is_default).address_name).toBe('Warehouse');
    expect(v.city).toBe('Nashik'); // legacy column follows the default address
    expect(v.contacts[0].name).toBe('Ravi');
    expect(v.bank_accounts[0].account_number).toBe('XXXXXXXX9012');
    expect(v.bank_accounts[0].is_primary).toBe(true);
    expect(v.materials).toEqual([]); // no MPN yet, so no supplied materials
    const full = (await admin.get(`/vendors/${r.body.id}?full=true`)).body;
    expect(full.bank_accounts[0].account_number).toBe('123456789012');

    const badIfsc = await admin.post('/vendors', { name: 'Bad Bank', bank_accounts: [{ account_holder: 'X', account_number: '12345678', ifsc: 'HDFC1234' }] });
    expect(badIfsc.status).toBe(400);
    const twoDefaults = await admin.post('/vendors', { name: 'Two Defaults', addresses: [
      { address_name: 'A', is_default: true }, { address_name: 'B', is_default: true }] });
    expect(twoDefaults.status).toBe(400);
  });
});

describe('MPN bulk create and price history', () => {
  test('grid rows create one MPN each; duplicates block the whole save', async () => {
    const ven = (await admin.post('/vendors', { name: 'Grid Vendor' })).body;
    const ok = await admin.post('/mpns/bulk', { rows: [
      { material_id: C.rice.id, vendor_id: ven.id, uom: 'kg', moq: 100, price: 52.5, lead_time_days: 5 },
      { material_id: C.lentil.id, vendor_id: ven.id, uom: 'kg', moq: 50, price: 98 },
    ] });
    expect(ok.status).toBe(201);
    expect(ok.body.created).toBe(2);
    expect(ok.body.rows[0].code).toMatch(/^MPN\d+$/);
    const mv = (await q(`select mv.* from public.mpn_vendors mv join public.mpns p on p.id = mv.mpn_id where p.mpn_code = $1`, [ok.body.rows[0].code]))[0];
    expect(mv.price).toBe(52.5);
    expect(mv.moq).toBe(100);

    const before = (await q('select count(*)::int n from public.mpns'))[0].n;
    const dup = await admin.post('/mpns/bulk', { rows: [
      { material_id: C.pouch.id, vendor_id: ven.id, uom: 'pcs', moq: 1000, price: 2 },
      { material_id: C.rice.id, vendor_id: ven.id, uom: 'kg', moq: 1, price: 1 }, // already exists
    ] });
    expect(dup.status).toBe(400);
    expect(dup.body.rows[1].errors[0]).toMatch(/already supplies/);
    expect((await q('select count(*)::int n from public.mpns'))[0].n).toBe(before);

    // Changing the price keeps history
    const mpnId = ok.body.rows[0].id;
    await admin.put(`/mpns/${mpnId}`, { vendors: [{ vendor_id: ven.id, is_preferred: true, uom: 'kg', moq: 100, price: 55 }] });
    const det = (await admin.get(`/mpns/${mpnId}`)).body;
    expect(det.price_history[0].old_price).toBe(52.5);
    expect(det.price_history[0].new_price).toBe(55);
    expect(det.price_history[0].changed_by_name).toBeTruthy();
  });
});

describe('Bulk entry / bulk update / export', () => {
  test('materials: template upload, preview, all-or-nothing commit', async () => {
    const tpl = await admin.get('/bulk/materials/template?mode=create');
    expect(tpl.status).toBe(200);
    expect(tpl.headers['content-type']).toMatch(/spreadsheetml/);

    const data = await xlsxBase64(['Material Name *', 'Classification *', 'Category', 'Sub-category', 'UOM *', 'Shelf Life (days)', 'Status', 'Description'], [
      ['Bulk Jaggery', 'Raw Material', 'Grains', 'Rice', 'kg', 180, 'Active', 'Test'],
      ['Bulk Box', 'Packaging', '', '', 'pcs', '', '', ''],
      ['Bad Row', 'Metal', '', '', '', '', '', ''],
    ]);
    const parsed = await admin.post('/bulk/materials/parse?mode=create', { filename: 'm.xlsx', data });
    expect(parsed.status).toBe(200);
    expect(parsed.body.rows).toHaveLength(3);
    const prev = await admin.post('/bulk/materials/preview', { mode: 'create', rows: parsed.body.rows });
    expect(prev.body.summary).toMatchObject({ total: 3, errors: 1, create: 2 });
    expect(prev.body.rows[2].errors.join(' ')).toMatch(/Classification/);

    const fail = await admin.post('/bulk/materials/commit', { mode: 'create', rows: parsed.body.rows });
    expect(fail.status).toBe(400);
    expect((await q(`select count(*)::int n from public.materials where name like 'Bulk %'`))[0].n).toBe(0);

    const good = await admin.post('/bulk/materials/commit', { mode: 'create', rows: parsed.body.rows.slice(0, 2) });
    expect(good.status).toBe(201);
    expect(good.body.saved.map((s) => s.code)).toEqual(expect.arrayContaining([expect.stringMatching(/^M\d+$/)]));
    const j = (await q(`select m.*, c.name cat from public.materials m left join public.material_categories c on c.id = m.category_id where m.name = 'Bulk Jaggery'`))[0];
    expect(j.cat).toBe('Grains');
    expect(j.shelf_life_days).toBe(180);
  });

  test('materials bulk update shows only changed fields and applies them', async () => {
    const code = (await q(`select code from public.materials where name = 'Bulk Box'`))[0].code;
    const rows = [
      { row_no: 2, code, uom: 'box', description: 'Carton' },
      { row_no: 3, code: 'RM-RICE', name: 'Rice (Sona Masoori)' },
      { row_no: 4, code: 'RM-LENTIL' }, // nothing to change
    ];
    const prev = await admin.post('/bulk/materials/preview', { mode: 'update', rows });
    expect(prev.body.summary).toMatchObject({ update: 2, unchanged: 1, errors: 0 });
    expect(prev.body.rows[0].changes.map((c) => c.field)).toEqual(['UOM', 'Description']);
    const r = await admin.post('/bulk/materials/commit', { mode: 'update', rows });
    expect(r.status).toBe(201);
    expect((await q(`select uom from public.materials where code = $1`, [code]))[0].uom).toBe('box');
    expect((await q(`select name from public.materials where code = 'RM-RICE'`))[0].name).toBe('Rice (Sona Masoori)');
  });

  test('vendors bulk entry creates address, contact and bank (materials come from MPNs)', async () => {
    const rows = [{ row_no: 2, name: 'Bulk Vendor One', phone: '9820000000', city: 'Mumbai', line1: 'Plot 4',
      contact_name: 'Asha', account_holder: 'Bulk Vendor One', account_number: '000111222333', ifsc: 'SBIN0000123',
      fssai_expiry: '31/12/2027' }];
    const r = await admin.post('/bulk/vendors/commit', { mode: 'create', rows });
    expect(r.status).toBe(201);
    const id = (await q(`select id from public.vendors where name = 'Bulk Vendor One'`))[0].id;
    const v = (await admin.get(`/vendors/${id}`)).body;
    expect(v.addresses[0].address_name).toBe('Head Office');
    expect(v.contacts[0].name).toBe('Asha');
    expect(v.bank_accounts[0].ifsc).toBe('SBIN0000123');
    expect(v.materials).toEqual([]);
    expect(String(v.fssai_expiry).slice(0, 10)).toBe('2027-12-31');
  });

  test('MPN bulk update changes price by MPN + vendor; export works as xlsx and csv', async () => {
    const row = (await q(`select p.mpn_code, ve.code vendor_code from public.mpn_vendors mv join public.mpns p on p.id = mv.mpn_id
                           join public.vendors ve on ve.id = mv.vendor_id where mv.price = 55`))[0];
    const r = await admin.post('/bulk/mpns/commit', { mode: 'update', rows: [{ row_no: 2, ...row, price: 60, moq: 200 }] });
    expect(r.status).toBe(201);
    const mv = (await q(`select mv.price, mv.moq from public.mpn_vendors mv join public.mpns p on p.id = mv.mpn_id where p.mpn_code = $1`, [row.mpn_code]))[0];
    expect(mv).toEqual({ price: 60, moq: 200 });

    const csv = await admin.get('/bulk/mpns/export?format=csv');
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('MPN Code');
    const xl = await admin.get('/bulk/vendors/export');
    expect(xl.headers['content-disposition']).toMatch(/vendors_.*\.xlsx/);
  });

  test('viewer cannot bulk-save', async () => {
    const r = await viewer.post('/bulk/materials/commit', { mode: 'create', rows: [{ name: 'x', classification: 'Packaging', uom: 'pcs' }] });
    expect(r.status).toBe(403);
  });
});

describe('BOM costing and scaling', () => {
  test('costs roll up per batch and per unit; scale creates a new draft version', async () => {
    const active = (await admin.get(`/boms/active?product_id=${C.fg.id}&location_id=${C.mum.id}`)).body;
    // A BOM never carries a price: the cost comes from each line's MPN.
    const lines = active.lines.map((l) => ({ material_id: l.material_id, mpn_id: l.mpn_id, qty_per_batch: l.qty_per_batch,
      uom: l.uom, scrap_allowance_pct: l.scrap_allowance_pct, notes: `n${l.line_no}` }));
    const withPrice = await admin.post('/boms', {
      product_id: C.fg.id, location_id: C.mum.id, batch_size: active.batch_size, batch_uom: active.batch_uom,
      expected_output_qty: active.expected_output_qty, output_uom: active.output_uom,
      lines: lines.map((l, i) => (i === 0 ? { ...l, unit_price: 10 } : l)),
    });
    expect(withPrice.status).toBe(400);
    expect(withPrice.body.error).toMatch(/price cannot be set on a BOM/);
    const draft = await admin.post('/boms', {
      product_id: C.fg.id, location_id: C.mum.id, batch_size: active.batch_size, batch_uom: active.batch_uom,
      expected_output_qty: active.expected_output_qty, output_uom: active.output_uom, lines,
      packing_cost: 100, processing_cost: 50, overhead_cost: 25, freight_cost: 25,
    });
    expect(draft.status).toBe(201);
    const c = draft.body.costing;
    const expectedMaterial = active.lines.reduce((a, l) => a + l.qty_per_batch * (1 + l.scrap_allowance_pct / 100) * Number(l.mpn_price), 0);
    expect(c.material_cost).toBeCloseTo(expectedMaterial, 1);
    expect(c.total_batch_cost).toBeCloseTo(expectedMaterial + 200, 1);
    expect(c.cost_per_output_unit).toBeCloseTo((expectedMaterial + 200) / active.expected_output_qty, 3);
    expect(draft.body.lines[0].notes).toBe('n1');

    const prev = await admin.post(`/boms/${draft.body.id}/scale`, { batch_size: draft.body.batch_size * 2, preview: true });
    expect(prev.body.factor).toBe(2);
    expect(prev.body.lines[0].to).toBeCloseTo(lines[0].qty_per_batch * 2, 3);
    const countBefore = (await q('select count(*)::int n from public.boms'))[0].n;
    expect(countBefore).toBeGreaterThan(0);

    const scaled = await admin.post(`/boms/${draft.body.id}/scale`, { batch_size: draft.body.batch_size * 2 });
    expect(scaled.status).toBe(201);
    expect(scaled.body.status).toBe('DRAFT');
    expect(scaled.body.version).toBe(draft.body.version + 1);
    expect(scaled.body.expected_output_qty).toBeCloseTo(active.expected_output_qty * 2, 3);
    expect(scaled.body.packing_cost).toBe(200);
    expect(scaled.body.scaled_from_bom_id).toBe(draft.body.id);
    // The source BOM is untouched
    const src = (await admin.get(`/boms/${draft.body.id}`)).body;
    expect(src.batch_size).toBe(draft.body.batch_size);
  });
});
