/**
 * Robustness / security regression tests from the v10 audit. Each block pins one finding so it cannot come back.
 */
const request = require('supertest');
const JSZip = require('jszip');
const { createApp } = require('../src/app');
const { resetDb, ctx, api, getPool, close } = require('./helpers');

let C;
let admin;
let editor;
let viewer;
const q = async (sql, p) => (await getPool().query(sql, p)).rows;
const raw = () => request(createApp());

beforeAll(async () => {
  await resetDb();
  C = await ctx();
  admin = api(C.admin.id);
  editor = api(C.editor.id);
  viewer = api(C.viewer.id);
});
afterAll(close);

describe('acting user: no silent admin', () => {
  const adj = async (uid) => {
    const body = { inventory_id: (await C.lot('RICE-L1')).id, new_physical_qty: 0, reason: 'x' };
    const r = raw().post('/api/inventory/adjustments');
    return (uid ? r.set('X-User-Id', uid) : r).send(body);
  };
  test('a write without X-User-Id, with a malformed one or an unknown one is refused (401)', async () => {
    expect((await adj(null)).status).toBe(401);
    expect((await adj('viewer-please')).status).toBe(401);
    expect((await adj('00000000-0000-0000-0000-000000000000')).status).toBe(401);
    expect(Number((await C.lot('RICE-L1')).quantity)).toBeGreaterThan(0);                // nothing happened
  });
  test('reads also need a user, except the start-up session call', async () => {
    expect((await raw().get('/api/inventory/stock')).status).toBe(401);
    const s = await raw().get('/api/session');
    expect(s.status).toBe(200);
    expect(s.body.user.role).toBe('admin');
  });
  test('a plain cross-site form POST (no custom header, form body) is refused', async () => {
    const r = await raw().post('/api/plans/00000000-0000-0000-0000-000000000000/cancel').type('form').send('a=1');
    expect(r.status).toBe(401);
  });
  test('viewers stay read-only, but may run a plan simulation (nothing is saved)', async () => {
    expect((await viewer.post('/materials', { name: 'X', classification: 'RAW_MATERIAL', uom: 'kg' })).status).toBe(403);
    const sim = await viewer.post('/plans/simulate', { product_id: C.fg.id, location_id: C.mum.id, plan_mode: 'BATCHES', target_batches: 1 });
    expect(sim.status).toBe(200);
  });
});

describe('sensitive data and exports', () => {
  test('full bank account numbers only for users who can edit', async () => {
    const v = (await admin.post('/vendors', { name: 'Bank Test', bank_accounts: [{ account_holder: 'A', account_number: '123456789012', ifsc: 'HDFC0001234', is_primary: true }] })).body;
    const asViewer = (await viewer.get(`/vendors/${v.id}?full=true`)).body.bank_accounts[0].account_number;
    const asEditor = (await editor.get(`/vendors/${v.id}?full=true`)).body.bank_accounts[0].account_number;
    expect(asViewer).not.toBe('123456789012');
    expect(asEditor).toBe('123456789012');
  });
  test('CSV export never lets a spreadsheet run a formula', async () => {
    await admin.post('/vendors', { name: '=HYPERLINK("http://evil","x")' });
    const r = await admin.get('/bulk/vendors/export?format=csv');
    expect(r.status).toBe(200);
    const text = Buffer.isBuffer(r.body) ? r.body.toString('utf8') : r.text;
    expect(text).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(text).not.toMatch(/,=HYPERLINK/);
  });
  test('a "zip bomb" workbook is refused before it is unpacked', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('xl/worksheets/sheet1.xml', '0'.repeat(60 * 1024 * 1024));               // 60 MB unpacked, tiny packed
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    expect(buf.length).toBeLessThan(1024 * 1024);
    const r = await admin.post('/bulk/materials/parse', { filename: 'x.xlsx', data: buf.toString('base64') });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/too large when unpacked/);
  });
});

describe('variance tolerance cannot be switched off from the browser', () => {
  let plan;
  const lots = async () => ({ rice: (await C.lot('RICE-L1')).id, lentil: (await C.lot('LEN-L1')).id, pouch: (await C.lot('POUCH-L1')).id });
  beforeAll(async () => {
    plan = (await editor.post('/plans', { product_id: C.fg.id, location_id: C.mum.id, plan_mode: 'BATCHES', target_batches: 5 })).body.plan;
  });
  test('sending plan = actual does not hide a 50% overuse', async () => {
    const l = await lots();
    const r = await editor.post('/batches', { source: 'PLAN', plan_id: plan.id, actual_output_qty: 1000, inputs: [
      { material_id: C.rice.id, inventory_id: l.rice, plan_input_qty: 91.8, actual_input_qty: 91.8 },
      { material_id: C.lentil.id, inventory_id: l.lentil, plan_input_qty: 40.8, actual_input_qty: 40.8 },
      { material_id: C.pouch.id, inventory_id: l.pouch, plan_input_qty: 1010, actual_input_qty: 1010 }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/RM-RICE: variance 50/);
  });
  test('leaving BOM materials out, or using one not in the BOM, needs a reason', async () => {
    const l = await lots();
    const none = await editor.post('/batches', { source: 'PLAN', plan_id: plan.id, actual_output_qty: 1000, inputs: [] });
    expect(none.status).toBe(400);
    const sfg = (await admin.post('/materials', { name: 'Extra Salt', classification: 'RAW_MATERIAL', uom: 'kg' })).body;
    await q(`select erp.post_stock('OPENING',(select id from public.mpns where material_id=$1 limit 1),$2,$3,'SALT-1',10,$4,null,null,'t',null,null,null,true)`,
      [sfg.id, C.mum.id, C.wh1.id, C.admin.id]).catch(async () => {
      const m = (await admin.post('/mpns', { material_id: sfg.id })).body;
      await q(`select erp.post_stock('OPENING',$1,$2,$3,'SALT-1',10,$4,null,null,'t',null,null,null,true)`, [m.id, C.mum.id, C.wh1.id, C.admin.id]);
    });
    const salt = (await C.lot('SALT-1')).id;
    const base = [{ material_id: C.rice.id, inventory_id: l.rice, actual_input_qty: 61.2 },
      { material_id: C.lentil.id, inventory_id: l.lentil, actual_input_qty: 40.8 }, { material_id: C.pouch.id, inventory_id: l.pouch, actual_input_qty: 1010 }];
    const extra = await editor.post('/batches', { source: 'PLAN', plan_id: plan.id, actual_output_qty: 1000,
      inputs: [...base, { material_id: sfg.id, inventory_id: salt, actual_input_qty: 1 }] });
    expect(extra.status).toBe(400);
    expect(extra.body.error).toMatch(/not in the BOM/);
    const ok = await editor.post('/batches', { source: 'PLAN', plan_id: plan.id, actual_output_qty: 1000, client_request_id: 'req-1',
      inputs: [...base, { material_id: sfg.id, inventory_id: salt, actual_input_qty: 1, variance_reason: 'Taste fix' }] });
    expect(ok.status).toBe(201);
  });
  test('a double-clicked Submit posts the batch once', async () => {
    const before = Number((await C.lot('RICE-L1')).quantity);
    const l = await lots();
    const body = { source: 'PLAN', plan_id: plan.id, actual_output_qty: 1000, client_request_id: 'req-2', inputs: [
      { material_id: C.rice.id, inventory_id: l.rice, actual_input_qty: 61.2 }, { material_id: C.lentil.id, inventory_id: l.lentil, actual_input_qty: 40.8 },
      { material_id: C.pouch.id, inventory_id: l.pouch, actual_input_qty: 1010 }] };
    const a = await editor.post('/batches', body);
    const b = await editor.post('/batches', body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    expect(Number((await C.lot('RICE-L1')).quantity)).toBeCloseTo(before - 61.2, 4);
  });
  test('an Admin override is not reused by later edits; the same lot twice is refused clearly', async () => {
    // fresh lots, so earlier tests' consumption does not matter
    for (const [mpn, lot, qty] of [[C.riceMpn.id, 'RICE-H', 500], ['MPN-LENTIL-AG', 'LEN-H', 500], ['MPN-POUCH-PR', 'POUCH-H', 9000]]) {
      const id = mpn.startsWith('MPN-') ? (await q('select id from public.mpns where mpn_code = $1', [mpn]))[0].id : mpn;
      await q(`select erp.post_stock('OPENING',$1,$2,$3,$4,$5,$6,null,null,'test',null,null,null,true)`, [id, C.mum.id, C.wh1.id, lot, qty, C.admin.id]);
    }
    const l = { rice: (await C.lot('RICE-H')).id, lentil: (await C.lot('LEN-H')).id, pouch: (await C.lot('POUCH-H')).id };
    const inputs = [{ material_id: C.rice.id, inventory_id: l.rice, actual_input_qty: 61.2 },
      { material_id: C.lentil.id, inventory_id: l.lentil, actual_input_qty: 40.8 }, { material_id: C.pouch.id, inventory_id: l.pouch, actual_input_qty: 1010 }];
    const dup = await editor.post('/batches', { source: 'PLAN', plan_id: plan.id, actual_output_qty: 1000, inputs: [...inputs, inputs[0]] });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/already listed/);
    const made = await admin.post('/batches', { source: 'PLAN', plan_id: plan.id, actual_output_qty: 1500, tolerance_override: true, inputs });
    expect(made.body.error || '').toBe('');
    const b = made.body;
    const rice = b.inputs.find((x) => x.material_id === C.rice.id);
    const edit = await editor.put(`/batches/${b.id}`, { inputs: [{ id: rice.id, actual_input_qty: 40 }] });
    expect(edit.status).toBe(400);
    expect((await editor.put(`/batches/${b.id}`, { inputs: [{ id: rice.id, actual_input_qty: 40, variance_reason: 'Spill recount' }] })).status).toBe(200);
    expect((await editor.put(`/batches/${b.id}`, { inputs: [{ material_id: C.fg.id, actual_input_qty: 1 }] })).status).toBe(400);
  });
});

describe('bad input gets a clear 400, never a crash', () => {
  const base = () => ({ location_id: C.mum.id, warehouse_id: C.wh1.id, mpn_id: C.riceMpn.id, lot_no: 'BAD-1', entry_type: 'OPENING', qty: 1 });
  test.each([
    ['qty with 5 decimals', { qty: 0.00005 }, /decimal places/],
    ['qty too large', { qty: 1e14 }, /too large/],
    ['qty as hex text', { qty: '0x10' }, /number/],
    ['qty as true', { qty: true }, /number/],
    ['qty as a list', { qty: [5] }, /number/],
    ['lot as an object', { lot_no: { a: 1 } }, /text/],
    ['impossible date', { mfg_date: '2026-02-30' }, /real date/],
    ['broken timestamp', { mfg_date: '2026-01-01T99:99' }, /date/],
    ['mfg date in the future', { mfg_date: '2099-01-01' }, /future/],
    ['NUL character', { lot_no: 'A\u0000B' }, /invalid character/],
  ])('inward refuses %s', async (_, patch, msg) => {
    const r = await editor.post('/inventory/inward', { ...base(), ...patch });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(msg);
  });
  test('query strings: impossible dates, bad ids and NUL characters', async () => {
    expect((await editor.get('/inventory/ledger?from=2026-02-30')).status).toBe(400);
    expect((await editor.get('/reports/stock-balance?as_on=2026-02-30')).status).toBe(400);
    expect((await editor.get('/materials?q=%00')).status).toBe(400);
    expect((await editor.get('/inventory/ledger?material_id=nope')).status).toBe(400);
  });
  test('lists with null items are refused, not crashed on', async () => {
    const cnt = (await q('select id from public.stock_counts limit 1'))[0];
    if (cnt) expect((await editor.put(`/stock-counts/${cnt.id}/lines`, { lines: [null] })).status).toBe(400);
    expect((await editor.post('/categories/bulk-create', { items: [null] })).status).toBe(400);
    expect((await editor.post('/categories/bulk-create', { items: [{ classification: 'RAW_MATERIAL', category: 'Z', sub_categories: 5 }] })).status).toBe(400);
    const ven = (await q('select id from public.vendors limit 1'))[0].id;
    expect((await editor.put(`/vendors/${ven}`, { addresses: [null] })).status).toBe(400);
    expect((await editor.put(`/mpns/${C.riceMpn.id}`, { vendors: [null] })).status).toBe(400);
    expect((await editor.post('/bulk/materials/preview', { mode: 'create', rows: [null] })).status).toBe(400);
  });
  test('huge plans, silly settings and deleting a finished good stock code are refused', async () => {
    const big = await editor.post('/plans/simulate', { product_id: C.fg.id, location_id: C.mum.id, plan_mode: 'QTY', demand_qty: 3e9 });
    expect(big.status).toBe(400);
    expect(big.body.error).toMatch(/at most 1,00,000/);
    expect((await admin.put('/settings', { default_shelf_life_days: 1e300 })).status).toBe(400);
    expect((await admin.put('/settings', { default_shelf_life_days: 1.5 })).status).toBe(400);
    expect((await admin.put('/settings', { apply_scrap_allowance: 'banana' })).status).toBe(400);
    expect((await admin.put('/settings', { company_name: { x: 1 } })).status).toBe(400);
    expect((await admin.del(`/mpns/${C.fgMpn.id}`)).status).toBe(400);
  });
});
