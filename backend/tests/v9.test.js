/**
 * v9: no stock reservation anywhere, and one source of truth for a BOM line's
 * vendor / UOM / price (the MPN).
 */
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

describe('v9: no stock reservation', () => {
  const riceLine = (body) => body.materialSummary.find((m) => m.material_code === 'RM-RICE');
  const sim = async (extra = {}) => (await editor.post('/plans/simulate',
    { product_id: C.fg.id, location_id: C.mum.id, demand_qty: 1000, ...extra })).body;

  test('Qty Available is the actual stock in the location, whatever other plans want', async () => {
    const actual = async () => Number((await q(`select coalesce(sum(quantity), 0) as n from public.inventory
                                                  where material_id = $1 and location_id = $2 and quantity > 0
                                                    and (expiry_date is null or expiry_date >= current_date)`,
    [C.rice.id, C.mum.id]))[0].n);
    const before = riceLine(await sim());
    expect(before.qty_available).toBeCloseTo(await actual(), 4);
    expect(before.short_long).toBeCloseTo(before.qty_available - before.qty_required, 4);

    // Two open plans for the same product do not take stock away from each other.
    const p1 = await editor.post('/plans', { product_id: C.fg.id, location_id: C.mum.id, plan_mode: 'BATCHES', target_batches: 2 });
    expect(p1.status).toBe(201);
    const p2 = await editor.post('/plans', { product_id: C.fg.id, location_id: C.mum.id, plan_mode: 'BATCHES', target_batches: 3 });
    expect(p2.status).toBe(201);
    expect(riceLine(await sim()).qty_available).toBeCloseTo(before.qty_available, 4);
    expect(riceLine(p2.body).qty_available).toBeCloseTo(before.qty_available, 4);

    // Only a real stock movement changes it.
    await editor.post('/inventory/inward', { mpn_id: C.riceMpn.id, location_id: C.mum.id, warehouse_id: C.wh1.id, lot_no: 'RICE-NEW9', qty: 25 });
    expect(riceLine(await sim()).qty_available).toBeCloseTo(before.qty_available + 25, 4);
    await admin.post(`/plans/${p1.body.plan.id}/cancel`);
    await admin.post(`/plans/${p2.body.plan.id}/cancel`);
  });

  test('no reserved / free / allocated field is returned by planning or the reorder report', async () => {
    const line = riceLine(await sim());
    for (const key of ['qty_reserved', 'qty_free', 'qty_allocated', 'reserved_qty', 'free_qty']) {
      expect(line[key]).toBeUndefined();
    }
    await admin.put(`/materials/${C.rice.id}`, { reorder_level: 999999 });
    const row = (await editor.get('/reports/reorder')).body.find((x) => x.material_code === 'RM-RICE');
    expect(row).toBeTruthy();
    for (const key of ['plan_need_qty', 'free_qty', 'qty_reserved']) expect(row[key]).toBeUndefined();
    await admin.put(`/materials/${C.rice.id}`, { reorder_level: null });
  });

  test('a plan required date does not change what is available', async () => {
    const plain = riceLine(await sim()).qty_available;
    expect(riceLine(await sim({ required_date: '2030-01-01' })).qty_available).toBeCloseTo(plain, 4);
  });
});

describe('v9: one source of truth for a BOM line', () => {
  let bom;

  test('the BOM screen lookup, the saved BOM and planning all give the same vendor, UOM and price', async () => {
    bom = (await admin.get(`/boms/active?product_id=${C.fg.id}&location_id=${C.mum.id}`)).body;
    const plan = await editor.post('/plans', { product_id: C.fg.id, location_id: C.mum.id, plan_mode: 'BATCHES', target_batches: 1 });
    expect(plan.status).toBe(201);
    for (const l of bom.lines) {
      const src = await admin.get(`/boms/line-source?material_id=${l.material_id}${l.mpn_id ? `&mpn_id=${l.mpn_id}` : ''}`);
      expect(src.status).toBe(200);
      expect(src.body.mpn_code).toBe(l.mpn_code);                       // same MPN
      expect(src.body.vendor_name).toBe(l.vendor_name);                 // same vendor
      expect(Number(src.body.price)).toBe(Number(l.mpn_price));         // same price
      expect(src.body.uom).toBe(l.uom);                                 // same UOM
      const pl = plan.body.materialSummary.find((m) => m.material_code === l.material_code);
      expect(pl.mpn_code).toBe(l.mpn_code);
      expect(pl.vendor_name).toBe(l.vendor_name);
    }
    await admin.post(`/plans/${plan.body.plan.id}/cancel`);
  });

  test('the price always follows the MPN: change it there and every BOM follows', async () => {
    const line = bom.lines.find((l) => l.material_code === 'RM-RICE');
    expect(Number(line.mpn_price)).toBe(42);
    const mv = (await q('select id, vendor_id from public.mpn_vendors where mpn_id = $1', [C.riceMpn.id]))[0];
    const upd = await admin.put(`/mpns/${C.riceMpn.id}`, { vendors: [{ vendor_id: mv.vendor_id, is_preferred: true, uom: 'kg', price: 50 }] });
    expect(upd.status).toBe(200);
    const after = (await admin.get(`/boms/${bom.id}`)).body.lines.find((l) => l.material_code === 'RM-RICE');
    expect(Number(after.mpn_price)).toBe(50);
    expect(Number(after.effective_price)).toBe(50);
    expect(after.price_source).toBe('MPN');
    const src = await admin.get(`/boms/line-source?material_id=${line.material_id}&mpn_id=${line.mpn_id}`);
    expect(Number(src.body.price)).toBe(50);
  });

  test('a price cannot be sent from the BOM, on create or on update', async () => {
    const lines = bom.lines.map((l) => ({ material_id: l.material_id, mpn_id: l.mpn_id, qty_per_batch: l.qty_per_batch,
      uom: l.uom, scrap_allowance_pct: l.scrap_allowance_pct }));
    const header = { product_id: C.fg.id, location_id: C.pun.id, batch_size: bom.batch_size, batch_uom: bom.batch_uom,
      expected_output_qty: bom.expected_output_qty, output_uom: bom.output_uom };
    const bad = await admin.post('/boms', { ...header, lines: [{ ...lines[0], unit_price: 7 }, ...lines.slice(1)] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/price cannot be set on a BOM/);

    const ok = await admin.post('/boms', { ...header, lines });
    expect(ok.status).toBe(201);
    expect(ok.body.lines.every((l) => l.unit_price === null)).toBe(true);
    const badUpd = await admin.put(`/boms/${ok.body.id}`, { ...header, lines: lines.map((l) => ({ ...l, unit_price: 3 })) });
    expect(badUpd.status).toBe(400);
  });

  test('an ingredient with no MPN price has no price at all, instead of a made-up one', async () => {
    const m = (await admin.post('/materials', { name: 'Unpriced Spice', classification: 'RAW_MATERIAL', uom: 'kg' })).body;
    const mpn = (await admin.post('/mpns', { material_id: m.id, vendors: [] })).body;
    const src = (await admin.get(`/boms/line-source?material_id=${m.id}`)).body;
    expect(src.mpn_code).toBe(mpn.mpn_code);
    expect(src.price).toBeNull();
    expect(src.vendor_name).toBeNull();
    expect(src.uom).toBe('kg');
  });
});
