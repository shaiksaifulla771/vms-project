const { resetDb, ctx, api, getPool, close } = require('./helpers');

let C;
let admin;
let editor;
const q = async (sql, p) => (await getPool().query(sql, p)).rows;

beforeAll(async () => {
  await resetDb();
  C = await ctx();
  admin = api(C.admin.id);
  editor = api(C.editor.id);
});
afterAll(close);

describe('v8: Inward entry type', () => {
  const base = () => ({ location_id: C.mum.id, warehouse_id: C.wh1.id, qty: 10 });

  test('Purchase (default) of a bought material is an INWARD ledger row referenced PURCHASE', async () => {
    const r = await editor.post('/inventory/inward', { ...base(), mpn_id: C.riceMpn.id, lot_no: 'P-1' });
    expect(r.status).toBe(201);
    const l = (await q(`select txn_type, reference_type from public.stock_ledger where lot_no = 'P-1'`))[0];
    expect(l).toEqual({ txn_type: 'INWARD', reference_type: 'PURCHASE' });
  });

  test('a finished good cannot be purchased; Opening Stock works by material, without an MPN', async () => {
    const bad = await editor.post('/inventory/inward', { ...base(), material_id: C.fg.id, lot_no: 'FG-OPEN-1', entry_type: 'PURCHASE' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/cannot be purchased/);
    const byMpn = await editor.post('/inventory/inward', { ...base(), mpn_id: C.fgMpn.id, lot_no: 'FG-OPEN-1' });
    expect(byMpn.status).toBe(400); // default type is Purchase
    const ok = await editor.post('/inventory/inward', { ...base(), material_id: C.fg.id, lot_no: 'FG-OPEN-1', entry_type: 'OPENING', warehouse_id: C.wh2.id });
    expect(ok.status).toBe(201);
    const l = (await q(`select txn_type, reference_type, qty_change from public.stock_ledger where lot_no = 'FG-OPEN-1'`))[0];
    expect(l).toMatchObject({ txn_type: 'OPENING', reference_type: 'OPENING' });
  });

  test('Adjustment is Admin only and needs a reason', async () => {
    const body = { ...base(), mpn_id: C.riceMpn.id, lot_no: 'ADJ-1', entry_type: 'ADJUSTMENT' };
    expect((await editor.post('/inventory/inward', { ...body, reason: 'Found extra' })).status).toBe(403);
    expect((await admin.post('/inventory/inward', body)).status).toBe(400);
    const ok = await admin.post('/inventory/inward', { ...body, reason: 'Found extra in store' });
    expect(ok.status).toBe(201);
    expect((await q(`select txn_type from public.stock_ledger where lot_no = 'ADJ-1'`))[0].txn_type).toBe('ADJUSTMENT');
    const ledger = (await admin.get('/inventory/ledger?type=ADJUSTMENT')).body;
    expect(ledger.find((x) => x.lot_no === 'ADJ-1').classification).toBe('RAW_MATERIAL');
  });

  test('semi-finished goods can be purchased', async () => {
    const sfg = (await admin.post('/materials', { name: 'Masala Premix', classification: 'SEMI_FINISHED', uom: 'kg' })).body;
    const ven = (await admin.post('/vendors', { name: 'Premix Supplier' })).body;
    const mpn = await admin.post('/mpns', { material_id: sfg.id, vendors: [{ vendor_id: ven.id, uom: 'kg', moq: 10, price: 200 }] });
    expect(mpn.status).toBe(201);
    const r = await editor.post('/inventory/inward', { ...base(), mpn_id: mpn.body.id, lot_no: 'SFG-1' });
    expect(r.status).toBe(201);
  });
});

describe('v8: finished goods have no MPN', () => {
  test('MPN list, detail, create, update and bulk leave finished goods out', async () => {
    const list = (await admin.get('/mpns')).body;
    expect(list.some((p) => p.classification === 'FINISHED_GOOD')).toBe(false);
    expect((await admin.get(`/mpns/${C.fgMpn.id}`)).status).toBe(404);
    const create = await admin.post('/mpns', { material_id: C.fg.id });
    expect(create.status).toBe(400);
    expect(create.body.error).toMatch(/no MPN/);
    expect((await admin.put(`/mpns/${C.fgMpn.id}`, { manufacturer: 'X' })).status).toBe(400);
    const ven = (await q(`select code from public.vendors limit 1`))[0].code;
    const prev = (await admin.post('/bulk/mpns/preview', { mode: 'create', rows: [{ row_no: 2, material_code: 'FG-RL1', vendor_code: ven, uom: 'pcs', moq: 1, price: 1 }] })).body;
    expect(prev.rows[0].errors.join(' ')).toMatch(/finished good/);
    const upd = (await admin.post('/bulk/mpns/preview', { mode: 'update', rows: [{ row_no: 2, mpn_code: 'FG-RL1', vendor_code: ven, price: 5 }] })).body;
    expect(upd.rows[0].errors.join(' ')).toMatch(/not found/);
  });

  test('a new finished good still gets its hidden stock code, so batches and stock keep working', async () => {
    const fg = (await admin.post('/materials', { name: 'Ready Upma 200g', classification: 'FINISHED_GOOD', uom: 'pcs' })).body;
    const hidden = await q('select id from public.mpns where material_id = $1', [fg.id]);
    expect(hidden).toHaveLength(1);
    const r = await editor.post('/inventory/inward', { location_id: C.mum.id, warehouse_id: C.wh2.id, qty: 5, material_id: fg.id, lot_no: 'UPMA-OPEN', entry_type: 'OPENING' });
    expect(r.status).toBe(201);
    expect(r.body.mpn_id).toBe(hidden[0].id);
  });
});
