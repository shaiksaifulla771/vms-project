const { resetDb, ctx, api, getPool, close } = require('./helpers');

let C;
let admin;
let editor;
const q = async (sql, p) => (await getPool().query(sql, p)).rows;
const body = (over = {}) => ({
  product_id: C.fg.id, location_id: C.mum.id, batch_size: 50, batch_uom: 'kg', expected_output_qty: 500, output_uom: 'pcs',
  lines: [{ material_id: C.rice.id, qty_per_batch: 50 }], ...over,
});
const defaults = async (loc) => (await q(`select bom_no from public.boms where product_id = $1 and location_id = $2
                                          and status = 'ACTIVE' and is_default`, [C.fg.id, loc])).map((r) => r.bom_no);

beforeAll(async () => {
  await resetDb();
  C = await ctx();
  admin = api(C.admin.id);
  editor = api(C.editor.id);
});
afterAll(close);

describe('v13: several BOMs per product, with one Default per location', () => {
  test('a second and third BOM at the same location stay side by side; the Default does not move by itself', async () => {
    const before = await defaults(C.mum.id);
    expect(before).toHaveLength(1);
    const b2 = await editor.post('/boms', body({ name: 'Economy', activate: true }));
    const b3 = await editor.post('/boms', body({ name: 'Trial' }));                       // draft
    expect(b2.status).toBe(201);
    expect(b3.status).toBe(201);
    expect(b2.body).toMatchObject({ status: 'ACTIVE', is_default: false });
    expect(b3.body.status).toBe('DRAFT');
    expect(b3.body.version).toBe(b2.body.version + 1);
    expect(await defaults(C.mum.id)).toEqual(before);
    const list = (await admin.get(`/boms?product_id=${C.fg.id}&location_id=${C.mum.id}`)).body;
    expect(list.filter((b) => b.status !== 'OBSOLETE').length).toBeGreaterThanOrEqual(3);
  });

  test('make_default on create moves the Default to the new BOM in the same save', async () => {
    const r = await editor.post('/boms', body({ name: 'Festival', activate: true, make_default: true }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'ACTIVE', is_default: true });
    expect(await defaults(C.mum.id)).toEqual([r.body.bom_no]);
  });

  test('make_default is ignored for a draft (only an active BOM can be the Default)', async () => {
    const before = await defaults(C.mum.id);
    const r = await editor.post('/boms', body({ name: 'Draft only', make_default: true }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'DRAFT', is_default: false });
    expect(await defaults(C.mum.id)).toEqual(before);
  });

  test('activating a draft with make_default makes it the Default; without it the Default stays', async () => {
    const d1 = (await editor.post('/boms', body({ name: 'D1' }))).body;
    const before = await defaults(C.mum.id);
    await editor.post(`/boms/${d1.id}/activate`, {});
    expect(await defaults(C.mum.id)).toEqual(before);
    const d2 = (await editor.post('/boms', body({ name: 'D2' }))).body;
    const act = await editor.post(`/boms/${d2.id}/activate`, { make_default: true });
    expect(act.status).toBe(200);
    expect(act.body.is_default).toBe(true);
    expect(await defaults(C.mum.id)).toEqual([d2.bom_no]);
  });

  test('the first active BOM of a product at a new location becomes its Default; other locations are untouched', async () => {
    const mumBefore = await defaults(C.mum.id);
    const pun = await editor.post('/boms', body({ location_id: C.pun.id, name: 'Pune', activate: true }));
    expect(pun.body.is_default).toBe(true);
    expect(await defaults(C.pun.id)).toEqual([pun.body.bom_no]);
    expect(await defaults(C.mum.id)).toEqual(mumBefore);
  });
});
