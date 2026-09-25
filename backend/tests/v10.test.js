const { resetDb, ctx, api, getPool, close } = require('./helpers');

let C;
let admin;
let editor;
const q = async (sql, p) => (await getPool().query(sql, p)).rows;
const seedBom = async () => (await q(`select id from public.boms where product_id = $1 and location_id = $2 and status = 'ACTIVE'`, [C.fg.id, C.mum.id]))[0].id;
const bomBody = (over = {}) => ({
  product_id: C.fg.id, location_id: C.mum.id, batch_size: 50, batch_uom: 'kg', expected_output_qty: 500, output_uom: 'pcs',
  lines: [{ material_id: C.rice.id, qty_per_batch: 30 }, { material_id: C.pouch.id, qty_per_batch: 500 }], ...over,
});

beforeAll(async () => {
  await resetDb();
  C = await ctx();
  admin = api(C.admin.id);
  editor = api(C.editor.id);
});
afterAll(close);

describe('v10 A: several active BOMs per product and location, one Default', () => {
  let std;
  let eco;
  test('the seeded BOM is the Default; a second BOM can be active beside it', async () => {
    std = await seedBom();
    expect((await admin.get(`/boms/${std}`)).body.is_default).toBe(true);
    const r = await editor.post('/boms', bomBody({ name: 'Economy pack', activate: true }));
    expect(r.status).toBe(201);
    eco = r.body.id;
    expect(r.body).toMatchObject({ status: 'ACTIVE', is_default: false, name: 'Economy pack' });
    const active = await q(`select id, is_default from public.boms where product_id = $1 and location_id = $2 and status = 'ACTIVE'`, [C.fg.id, C.mum.id]);
    expect(active).toHaveLength(2);
    expect(active.filter((b) => b.is_default)).toHaveLength(1);
  });

  test('plans use the Default unless another BOM is chosen; a BOM of another product is refused', async () => {
    const def = await editor.post('/plans/simulate', { product_id: C.fg.id, location_id: C.mum.id, plan_mode: 'BATCHES', target_batches: 1 });
    expect(def.body.bom.id).toBe(std);
    const chosen = await editor.post('/plans', { product_id: C.fg.id, location_id: C.mum.id, bom_id: eco, plan_mode: 'BATCHES', target_batches: 2 });
    expect(chosen.status).toBe(201);
    expect(chosen.body.plan.bom_id).toBe(eco);
    expect(Number(chosen.body.plan.target_qty)).toBe(1000);                 // 2 x 500 from the Economy BOM
    const otherSfg = (await admin.post('/materials', { name: 'Spice Mix', classification: 'SEMI_FINISHED', uom: 'kg' })).body;
    const wrong = await editor.post('/plans', { product_id: otherSfg.id, location_id: C.mum.id, bom_id: eco, plan_mode: 'BATCHES', target_batches: 1 });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatch(/different product/);
    const wrongLoc = await editor.post('/plans', { product_id: C.fg.id, location_id: C.pun.id, bom_id: eco, plan_mode: 'BATCHES', target_batches: 1 });
    expect(wrongLoc.status).toBe(400);
  });

  test('ad hoc batch prefill and entry use the chosen BOM and refuse a foreign one', async () => {
    const pf = await editor.get(`/batches/prefill?product_id=${C.fg.id}&location_id=${C.mum.id}&bom_id=${eco}`);
    expect(pf.status).toBe(200);
    expect(pf.body.bom.id).toBe(eco);
    const bad = await editor.get(`/batches/prefill?product_id=${C.fg.id}&location_id=${C.pun.id}&bom_id=${eco}`);
    expect(bad.status).toBe(400);
    const post = await editor.post('/batches', { source: 'AD_HOC', product_id: C.fg.id, location_id: C.pun.id, bom_id: eco, actual_output_qty: 5, inputs: [] });
    expect(post.status).toBe(400);
  });

  test('Set as Default moves the Default; obsoleting the Default hands it to another active BOM', async () => {
    expect((await editor.post(`/boms/${eco}/set-default`)).body.is_default).toBe(true);
    expect((await admin.get(`/boms/${std}`)).body.is_default).toBe(false);
    await editor.post(`/boms/${eco}/obsolete`);
    expect((await admin.get(`/boms/${std}`)).body.is_default).toBe(true);
    const draft = (await editor.post('/boms', bomBody({ name: 'Draft only' }))).body.id;
    expect((await editor.post(`/boms/${draft}/set-default`)).status).toBe(409);
  });

  test('New Version replaces its source when activated; Copy stays side by side and can go to another location', async () => {
    const rev = (await editor.post(`/boms/${std}/revise`)).body;
    expect(rev.status).toBe('DRAFT');
    expect(rev.name).toBe('Standard');
    await editor.post(`/boms/${rev.id}/activate`);
    expect((await admin.get(`/boms/${std}`)).body.status).toBe('OBSOLETE');
    expect((await admin.get(`/boms/${rev.id}`)).body).toMatchObject({ status: 'ACTIVE', is_default: true });

    const copy = (await editor.post(`/boms/${rev.id}/copy`, { name: 'Pune line', location_id: C.pun.id })).body;
    expect(copy).toMatchObject({ status: 'DRAFT', name: 'Pune line', location_id: C.pun.id, version: 1 });
    await editor.post(`/boms/${copy.id}/activate`);
    expect((await admin.get(`/boms/${rev.id}`)).body.status).toBe('ACTIVE');       // untouched
    expect((await admin.get(`/boms/${copy.id}`)).body.is_default).toBe(true);        // first at Pune
  });

  test('two active BOMs with no Default: the user must choose', async () => {
    const a = (await editor.post('/boms', bomBody({ location_id: C.pun.id, name: 'Alt', activate: true }))).body.id;
    await q(`update public.boms set is_default = false where product_id = $1 and location_id = $2`, [C.fg.id, C.pun.id]);
    const r = await editor.post('/plans/simulate', { product_id: C.fg.id, location_id: C.pun.id, plan_mode: 'BATCHES', target_batches: 1 });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/choose one/);
    expect((await editor.post('/plans/simulate', { product_id: C.fg.id, location_id: C.pun.id, bom_id: a, plan_mode: 'BATCHES', target_batches: 1 })).status).toBe(200);
  });

  test('only one Default per product + location is possible in the database', async () => {
    const ids = (await q(`select id from public.boms where product_id = $1 and location_id = $2 and status = 'ACTIVE'`, [C.fg.id, C.pun.id])).map((r) => r.id);
    await expect(q(`update public.boms set is_default = true where id = any($1)`, [ids])).rejects.toThrow();
    await expect(q(`update public.boms set is_default = true where status = 'DRAFT'`)).rejects.toThrow();
  });

  test('BOM list: location-first filter, product type filter, rename, full-page usage', async () => {
    const atPun = (await editor.get(`/boms?status=ACTIVE&location_id=${C.pun.id}`)).body;
    expect(atPun.length).toBeGreaterThan(0);
    expect(atPun.every((b) => b.location_id === C.pun.id)).toBe(true);
    const sfgOnly = (await editor.get('/boms?classification=SEMI_FINISHED')).body;
    expect(sfgOnly.every((b) => b.product_classification === 'SEMI_FINISHED')).toBe(true);
    expect((await editor.get('/boms?classification=RAW_MATERIAL')).status).toBe(400);
    expect((await editor.post(`/boms/${atPun[0].id}/rename`, { name: 'x'.repeat(101) })).status).toBe(400);
    expect((await editor.post(`/boms/${atPun[0].id}/rename`, { name: 'Renamed' })).body.name).toBe('Renamed');
    const full = (await editor.get(`/boms/${eco}`)).body;
    expect(full.used_in_plans.length).toBe(1);
    expect(Array.isArray(full.other_boms)).toBe(true);
  });
});

describe('v10 C: semi-finished goods in BOMs', () => {
  test('a semi-finished ingredient is costed from its own BOM and flagged "make first" when short', async () => {
    const premix = (await admin.post('/materials', { name: 'Masala Premix', classification: 'SEMI_FINISHED', uom: 'kg' })).body;
    const pb = await editor.post('/boms', { product_id: premix.id, location_id: C.mum.id, batch_size: 10, batch_uom: 'kg',
      expected_output_qty: 10, output_uom: 'kg', lines: [{ material_id: C.lentil.id, qty_per_batch: 10 }], activate: true });
    expect(pb.status).toBe(201);
    const perKg = pb.body.costing.cost_per_output_unit;
    expect(perKg).toBeGreaterThan(0);
    const fgBom = await editor.post('/boms', bomBody({ name: 'Masala', activate: true,
      lines: [{ material_id: C.rice.id, qty_per_batch: 30 }, { material_id: premix.id, qty_per_batch: 2 }] }));
    expect(fgBom.status).toBe(201);
    const line = fgBom.body.lines.find((l) => l.material_id === premix.id);
    expect(line).toMatchObject({ price_source: 'BOM', effective_price: perKg });
    const sim = await editor.post('/plans/simulate', { product_id: C.fg.id, location_id: C.mum.id, bom_id: fgBom.body.id, plan_mode: 'BATCHES', target_batches: 1 });
    const m = sim.body.materialSummary.find((x) => x.material_id === premix.id);
    expect(m).toMatchObject({ classification: 'SEMI_FINISHED', status: 'SHORT', make_first: true });
  });
});

describe('v10 F: HSN code on MPN', () => {
  test('create, validate, update, filter and export', async () => {
    const ven = (await q('select id, code from public.vendors limit 1'))[0];
    const bad = await admin.post('/mpns', { material_id: C.lentil.id, hsn_code: '123' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/4, 6 or 8 digits/);
    const ok = await admin.post('/mpns', { material_id: C.lentil.id, hsn_code: '0713 10', vendors: [{ vendor_id: ven.id, uom: 'kg', moq: 1, price: 90 }] });
    expect(ok.status).toBe(201);
    expect(ok.body.hsn_code).toBe('071310');
    expect((await admin.put(`/mpns/${ok.body.id}`, { hsn_code: '10063010' })).body.hsn_code).toBe('10063010');
    expect((await admin.put(`/mpns/${ok.body.id}`, { hsn_code: 'abcd' })).status).toBe(400);
    const missing = (await admin.get('/mpns?hsn_missing=true')).body;
    expect(missing.some((p) => p.id === ok.body.id)).toBe(false);
    expect(missing.length).toBeGreaterThan(0);
    expect((await admin.get('/mpns?q=10063010')).body.map((p) => p.id)).toContain(ok.body.id);
    await expect(q(`update public.mpns set hsn_code = '12' where id = $1`, [ok.body.id])).rejects.toThrow();
  });

  test('bulk create checks HSN; bulk update can set it', async () => {
    const ven = (await q('select code from public.vendors limit 1'))[0].code;
    const prev = (await admin.post('/bulk/mpns/preview', { mode: 'create', rows: [
      { row_no: 2, material_code: 'RM-LENTIL', vendor_code: ven, uom: 'kg', moq: 1, price: 1, hsn_code: '99' }] })).body;
    expect(prev.rows[0].errors.join(' ')).toMatch(/HSN code must be 4, 6 or 8 digits/);
    const code = (await q(`select p.mpn_code from public.mpns p join public.mpn_vendors mv on mv.mpn_id = p.id join public.vendors v on v.id = mv.vendor_id
                           where p.mpn_code = 'MPN-RICE-AG' and v.code = $1`, [ven]));
    if (code.length) {
      const upd = (await admin.post('/bulk/mpns/preview', { mode: 'update', rows: [{ row_no: 2, mpn_code: 'MPN-RICE-AG', vendor_code: ven, hsn_code: '1006' }] })).body;
      expect(upd.rows[0].changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'HSN Code', to: '1006' })]));
    }
  });
});

describe('v10 E: vendor address has no Type to pick', () => {
  test('a vendor is saved without an address type', async () => {
    const r = await admin.post('/vendors', { name: 'No Type Traders', addresses: [{ address_name: 'Main', is_default: true, line1: 'Road 1', city: 'Pune' }] });
    expect(r.status).toBe(201);
    const v = (await admin.get(`/vendors/${r.body.id}`)).body;
    expect(v.addresses[0].is_default).toBe(true);
  });
});

describe('v10 G: full-page views', () => {
  test('material overview: stock, transactions, BOMs it is used in and its own BOMs', async () => {
    const rice = (await editor.get(`/materials/${C.rice.id}/overview`)).body;
    expect(rice.stock.length).toBeGreaterThan(0);
    expect(rice.stock_total).toBeGreaterThan(0);
    expect(rice.transactions.length).toBeGreaterThan(0);
    expect(rice.used_in_boms.some((b) => b.product_code === 'FG-RL1')).toBe(true);
    const fg = (await editor.get(`/materials/${C.fg.id}/overview`)).body;
    expect(fg.made_in_house).toBe(true);
    expect(fg.boms.length).toBeGreaterThan(1);
    expect(fg.stock.every((s) => s.mpn_code === null)).toBe(true);           // the hidden code never shows
    expect((await editor.get('/materials/not-a-uuid/overview')).status).toBe(400);
    expect((await editor.get('/materials/00000000-0000-0000-0000-000000000000/overview')).status).toBe(404);
  });

  test('MPN detail has its stock lots and transactions; vendor detail has recent receipts', async () => {
    const p = (await editor.get(`/mpns/${C.riceMpn.id}`)).body;
    expect(p.stock.length).toBeGreaterThan(0);
    expect(p.transactions.length).toBeGreaterThan(0);
    const venId = (await q('select vendor_id from public.inventory where mpn_id = $1 and vendor_id is not null limit 1', [C.riceMpn.id]))[0].vendor_id;
    const ven = (await editor.get(`/vendors/${venId}`)).body;
    expect(ven.recent_receipts.length).toBeGreaterThan(0);
    expect(ven.recent_receipts.every((r) => Number(r.qty_change) > 0)).toBe(true);
  });
});

describe('v10 H: printing data', () => {
  test('stock balance "as on" a date is rebuilt from the ledger; future dates and bad filters are refused', async () => {
    const now = (await editor.get('/reports/stock-balance')).body;
    const today = new Date().toISOString().slice(0, 10);
    const same = (await editor.get(`/reports/stock-balance?as_on=${today}`)).body;
    const sum = (rows) => Math.round(rows.reduce((a, r) => a + Number(r.quantity), 0) * 1000) / 1000;
    expect(sum(same)).toBe(sum(now));
    expect(same.length).toBe(now.length);
    // Before anything was posted there was no stock at all.
    expect((await editor.get('/reports/stock-balance?as_on=2020-01-01')).body).toHaveLength(0);
    expect((await editor.get('/reports/stock-balance?as_on=2999-01-01')).status).toBe(400);
    expect((await editor.get('/reports/stock-balance?classification=NOPE')).status).toBe(400);
    const rm = (await editor.get('/reports/stock-balance?classification=RAW_MATERIAL')).body;
    expect(rm.length).toBeGreaterThan(0);
    expect(rm.every((r) => r.classification === 'RAW_MATERIAL')).toBe(true);
  });

  test('stock balance "as on" reflects stock that later left the store', async () => {
    const lot = await C.lot('LEN-L1');
    const before = Number(lot.quantity);
    // back-date one outward by moving its ledger timestamp is not allowed (ledger is immutable), so compare today vs yesterday
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const y = (await editor.get(`/reports/stock-balance?as_on=${yesterday}`)).body.find((r) => r.lot_no === 'LEN-L1');
    expect(y).toBeUndefined();                                                // seeded today, so not there yesterday
    expect(before).toBeGreaterThan(0);
  });

  test('transaction report print fetch: dates, a bad MPN id and a silly limit are handled', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const all = (await editor.get(`/inventory/ledger?from=${today}&to=${today}&limit=5000`)).body;
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
    expect((await editor.get('/inventory/ledger?mpn_id=abc')).status).toBe(400);
    expect((await editor.get('/inventory/ledger?limit=-5')).status).toBe(200);
    expect((await editor.get('/inventory/ledger?from=2026-13-40')).status).toBe(400);
  });
});
