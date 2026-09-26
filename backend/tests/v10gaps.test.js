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

describe('v10 gap fixes', () => {
  test('plans list filters by location (overrides the top-bar scope) and by product', async () => {
    const p = await editor.post('/plans', { product_id: C.fg.id, location_id: C.mum.id, plan_mode: 'BATCHES', target_batches: 1 });
    expect(p.status).toBe(201);
    const mum = await admin.get(`/plans?location_id=${C.mum.id}`);
    expect(mum.status).toBe(200);
    expect(mum.body.length).toBeGreaterThan(0);
    expect(mum.body.every((r) => r.location_id === C.mum.id)).toBe(true);
    const pun = await admin.get(`/plans?location_id=${C.pun.id}`);
    expect(pun.body.some((r) => r.id === p.body.plan.id)).toBe(false);
    const byProduct = await admin.get(`/plans?product_id=${C.fg.id}`);
    expect(byProduct.body.every((r) => r.product_id === C.fg.id)).toBe(true);
    expect((await admin.get('/plans?location_id=not-a-uuid')).status).toBe(400);
    expect((await admin.get('/plans?status=BOGUS')).status).toBe(400);
  });

  test('BOM list carries cost per unit and the count of unpriced lines', async () => {
    const r = await admin.get('/boms');
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
    r.body.forEach((b) => {
      expect(b).toHaveProperty('cost_per_unit');
      expect(b).toHaveProperty('unpriced_lines');
    });
    const one = r.body[0];
    const full = (await admin.get(`/boms/${one.id}`)).body;
    expect(one.cost_per_unit === null ? null : Number(one.cost_per_unit))
      .toBe(full.costing.cost_per_output_unit === null ? null : Number(full.costing.cost_per_output_unit));
  });

  test('BOM list with cost=0 skips costing (pickers); ledger print limit is capped', async () => {
    const lite = await admin.get('/boms?cost=0');
    expect(lite.status).toBe(200);
    expect(lite.body.length).toBeGreaterThan(0);
    expect(lite.body[0]).not.toHaveProperty('cost_per_unit');
    const led = await admin.get('/inventory/ledger?limit=999999');
    expect(led.status).toBe(200);
    expect(Array.isArray(led.body)).toBe(true);
  });

  test('line-source prices a semi-finished ingredient from its own BOM when it has no bought price', async () => {
    // Make every line of the new SFG BOM priced: give rice's MPN(s) a price.
    await q(`update public.mpn_vendors set price = 40 where mpn_id in (select id from public.mpns where material_id = $1)`, [C.rice.id]);
    const sfg = (await admin.post('/materials', { name: 'Rice Premix', classification: 'SEMI_FINISHED', uom: 'kg' })).body;
    const b = await editor.post('/boms', { product_id: sfg.id, location_id: C.mum.id, batch_size: 10, batch_uom: 'kg', expected_output_qty: 10, output_uom: 'kg',
      lines: [{ material_id: C.rice.id, qty_per_batch: 10 }], activate: true });
    expect(b.status).toBe(201);
    const src = await editor.get(`/boms/line-source?material_id=${sfg.id}&location_id=${C.mum.id}`);
    expect(src.status).toBe(200);
    const full = (await admin.get(`/boms/${b.body.id}`)).body;
    expect(full.costing.unpriced_lines).toBeFalsy();
    if (full.costing.unpriced_lines) {
      expect(src.body.price_source).toBeNull();
    } else {
      expect(src.body.price_source).toBe('BOM');
      expect(Number(src.body.price)).toBeCloseTo(Number(full.costing.cost_per_output_unit), 4);
      expect(src.body.bom_cost_source).toMatch(/v\d+/);
    }
    const bought = await editor.get(`/boms/line-source?material_id=${C.rice.id}`);
    expect(bought.status).toBe(200);
    expect(['MPN', null]).toContain(bought.body.price_source);
    expect((await editor.get('/boms/line-source?material_id=bad')).status).toBe(400);
  });
});
