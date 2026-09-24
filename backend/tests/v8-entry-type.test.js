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

  test('a finished good can never be added by Inward, whatever the entry type or how it is addressed', async () => {
    for (const entry of ['PURCHASE', 'OPENING', 'ADJUSTMENT']) {
      // Adjustment is Admin-only, so an editor is turned away before the material is even looked at.
      for (const who of entry === 'ADJUSTMENT' ? [admin] : [editor, admin]) {
        for (const id of [{ material_id: C.fg.id }, { mpn_id: C.fgMpn.id }]) {
          const r = await who.post('/inventory/inward', { ...base(), ...id, lot_no: 'FG-OPEN-1', entry_type: entry, reason: 'Found extra' });
          expect(r.status).toBe(400);
          expect(r.body.error).toMatch(/only from a manufacturing batch/);
        }
      }
    }
    expect(await q(`select 1 from public.stock_ledger where lot_no = 'FG-OPEN-1'`)).toHaveLength(0);
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

  test('a new finished good still gets its hidden stock code, so batches can post its output', async () => {
    const fg = (await admin.post('/materials', { name: 'Ready Upma 200g', classification: 'FINISHED_GOOD', uom: 'pcs' })).body;
    const hidden = await q('select id from public.mpns where material_id = $1', [fg.id]);
    expect(hidden).toHaveLength(1);
    // ... but it still cannot be stocked by hand
    const r = await editor.post('/inventory/inward', { location_id: C.mum.id, warehouse_id: C.wh2.id, qty: 5, material_id: fg.id, lot_no: 'UPMA-OPEN', entry_type: 'OPENING' });
    expect(r.status).toBe(400);
    const batch = await editor.post('/batches', { source: 'AD_HOC', product_id: fg.id, location_id: C.mum.id, actual_output_qty: 5, inputs: [] });
    expect(batch.status).toBe(201);
    expect((await q('select mpn_id from public.inventory where lot_no = $1', [batch.body.batch_no]))[0].mpn_id).toBe(hidden[0].id);
  });
});

describe('v8: the finished good internal code never reaches the screens', () => {
  test('material, product, vendor and report APIs show no MPN for a finished good', async () => {
    // Finished-goods stock as a batch would post it, and a legacy vendor link on its hidden code
    await q(`select erp.post_stock('MFG_OUTPUT',$1,$2,$3,'FG-HIDE-1',5,$4,'BATCH','B-HIDE','test',null,null,null,true)`,
      [C.fgMpn.id, C.mum.id, C.wh1.id, C.admin.id]);
    const ven = (await q(`select vendor_id from public.mpn_vendors where mpn_id = $1 limit 1`, [C.riceMpn.id]))[0].vendor_id;
    await q(`insert into public.mpn_vendors (mpn_id, vendor_id) values ($1, $2) on conflict do nothing`, [C.fgMpn.id, ven]);

    const mat = await admin.get(`/materials/${C.fg.id}`);
    expect(mat.body.mpns).toEqual([]);
    expect(mat.body.vendors).toEqual([]);
    const list = (await admin.get('/materials')).body.find((m) => m.id === C.fg.id);
    expect(list.mpns).toEqual([]);
    expect(list.vendor_count).toBe(0);

    const prod = (await admin.get('/products')).body.find((p) => p.id === C.fg.id);
    expect(prod.mpn_code).toBeNull();

    const vd = (await admin.get(`/vendors/${ven}`)).body;
    expect(vd.mpns.some((p) => p.mpn_code === 'FG-RL1')).toBe(false);
    expect(vd.materials.some((m) => m.code === 'FG-RL1')).toBe(false);

    const bal = (await admin.get('/reports/stock-balance')).body.filter((r) => r.material_code === 'FG-RL1');
    expect(bal.length).toBeGreaterThan(0);
    expect(bal.every((r) => r.mpn_code === null)).toBe(true);
    const sheet = (await admin.get('/reports/physical-stock-sheet')).body.filter((r) => r.material_code === 'FG-RL1');
    expect(sheet.length).toBeGreaterThan(0);
    expect(sheet.every((r) => r.mpn_code === null)).toBe(true);
  });
});
