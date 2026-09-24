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

async function runBatch(client, planId, output = 10) {
  const pf = await client.get(`/batches/prefill?plan_id=${planId}&planned_output=${output}`);
  const inputs = pf.body.lines.map((l) => ({
    material_id: l.material_id, inventory_id: l.suggested_inventory_id, plan_input_qty: l.plan_input_qty, actual_input_qty: l.plan_input_qty,
  }));
  return client.post('/batches', { source: 'PLAN', plan_id: planId, plan_output_qty: output, actual_output_qty: output, inputs });
}

describe('Plans by number of batches', () => {
  let plan;

  test('simulate and create a 10-batch plan', async () => {
    const sim = await editor.post('/plans/simulate', { product_id: C.fg.id, location_id: C.mum.id, plan_mode: 'BATCHES', target_batches: 10 });
    expect(sim.status).toBe(200);
    expect(sim.body.planSummary).toMatchObject({ target_batches: 10, remaining_batches: 10, target_qty: 10000 });
    expect(sim.body.batchSummary).toHaveLength(10);
    const rice = sim.body.materialSummary.find((m) => m.material_code === 'RM-RICE');
    expect(rice.qty_required).toBeCloseTo(60 * 10 * 1.02, 3);

    const bad = await editor.post('/plans', { product_id: C.fg.id, location_id: C.mum.id, plan_mode: 'BATCHES', target_batches: 2.5 });
    expect(bad.status).toBe(400);

    const r = await editor.post('/plans', { product_id: C.fg.id, location_id: C.mum.id, plan_mode: 'BATCHES', target_batches: 10 });
    expect(r.status).toBe(201);
    plan = r.body.plan;
    expect(r.body.planSummary).toMatchObject({ plan_mode: 'BATCHES', target_batches: 10, executed_batches: 0, remaining_batches: 10, status: 'OPEN' });
  });

  test('executing one batch leaves 9; materials are for the 9 remaining', async () => {
    const pf = await editor.get(`/batches/prefill?plan_id=${plan.id}`);
    expect(pf.body.planned_output).toBe(1000); // one full batch
    expect(pf.body.plan).toMatchObject({ plan_mode: 'BATCHES', target_batches: 10, executed_batches: 0 });
    const b = await runBatch(editor, plan.id, 10);
    expect(b.status).toBe(201);
    const v = (await editor.get(`/plans/${plan.id}`)).body;
    expect(v.planSummary).toMatchObject({ executed_batches: 1, remaining_batches: 9, status: 'IN_PROGRESS' });
    const rice = v.materialSummary.find((m) => m.material_code === 'RM-RICE');
    expect(rice.qty_required).toBeCloseTo(60 * 9 * 1.02, 3);
    expect(v.batchSummary.filter((x) => x.executed)).toHaveLength(1);
    expect(v.batchSummary.filter((x) => !x.executed)).toHaveLength(9);
  });

  test('editing the batch count recalculates; admin only; not below executed', async () => {
    expect((await editor.patch(`/plans/${plan.id}`, { target_batches: 12 })).status).toBe(403);
    const up = await admin.patch(`/plans/${plan.id}`, { target_batches: 12 });
    expect(up.body.planSummary).toMatchObject({ target_batches: 12, remaining_batches: 11, target_qty: 12000 });
    const rice = up.body.materialSummary.find((m) => m.material_code === 'RM-RICE');
    expect(rice.qty_required).toBeCloseTo(60 * 11 * 1.02, 3);
    const down = await admin.patch(`/plans/${plan.id}`, { target_batches: 5 });
    expect(down.body.planSummary).toMatchObject({ remaining_batches: 4 });
    expect((await admin.patch(`/plans/${plan.id}`, { target_batches: 0 })).status).toBe(400);
    const ev = down.body.events.find((e) => e.event === 'BATCHES_CHANGED');
    expect(ev.new_value).toEqual({ target_batches: 5 });
    expect((await admin.patch(`/plans/${plan.id}`, { target_qty: 99 })).status).toBe(400);
  });

  test('plan completes when executed batches reach the count, and reopens when raised', async () => {
    await admin.patch(`/plans/${plan.id}`, { target_batches: 2 });
    expect((await runBatch(editor, plan.id, 10)).status).toBe(201);
    let v = (await editor.get(`/plans/${plan.id}`)).body;
    expect(v.planSummary).toMatchObject({ executed_batches: 2, remaining_batches: 0, status: 'COMPLETED' });
    expect((await admin.patch(`/plans/${plan.id}`, { target_batches: 1 })).status).toBe(400);
    v = (await admin.patch(`/plans/${plan.id}`, { target_batches: 3 })).body;
    expect(v.planSummary).toMatchObject({ remaining_batches: 1, status: 'IN_PROGRESS' });
  });

  test('quantity plans keep working and show batch figures', async () => {
    const r = await editor.post('/plans', { product_id: C.fg.id, location_id: C.mum.id, target_qty: 2500 });
    expect(r.status).toBe(201);
    expect(r.body.planSummary).toMatchObject({ plan_mode: 'QTY', target_qty: 2500, target_batches: 3, remaining_batches: 3 });
  });
});

describe('Physical stock count', () => {
  let count;

  test('start a count: snapshot of lots in scope, nothing posted', async () => {
    const before = (await q('select count(*)::int n from public.stock_ledger'))[0].n;
    const r = await editor.post('/stock-counts', { location_id: C.mum.id, warehouse_id: C.wh1.id, classification: 'RAW_MATERIAL' });
    expect(r.status).toBe(201);
    count = r.body;
    expect(count.count_no).toMatch(/^CNT-\d{6}$/);
    expect(count.status).toBe('DRAFT');
    expect(count.lines.length).toBeGreaterThan(0);
    expect(count.lines.every((l) => l.classification === 'RAW_MATERIAL')).toBe(true);
    expect((await q('select count(*)::int n from public.stock_ledger'))[0].n).toBe(before);
  });

  test('counts save without touching stock; submit needs a reason for each variance', async () => {
    const [l1, l2] = count.lines;
    const lotBefore = Number((await q('select quantity from public.inventory where id = $1', [l1.inventory_id]))[0].quantity);
    const s = await editor.put(`/stock-counts/${count.id}/lines`, { counted_by: 'Ravi', lines: [
      { id: l1.id, counted_qty: Number(l1.snapshot_qty) - 5 },
      { id: l2.id, counted_qty: Number(l2.snapshot_qty) },
    ] });
    expect(s.status).toBe(200);
    expect(s.body.status).toBe('COUNTING');
    expect(s.body.lines[0].variance_qty).toBe(-5);
    expect(Number((await q('select quantity from public.inventory where id = $1', [l1.inventory_id]))[0].quantity)).toBe(lotBefore);

    const noReason = await editor.post(`/stock-counts/${count.id}/submit`);
    expect(noReason.status).toBe(400);
    expect(noReason.body.error).toMatch(/reason/);
    const other = await editor.put(`/stock-counts/${count.id}/lines`, { lines: [{ id: l1.id, counted_qty: Number(l1.snapshot_qty) - 5, reason_code: 'OTHER' }] });
    expect(other.status).toBe(200);
    expect((await editor.post(`/stock-counts/${count.id}/submit`)).status).toBe(400); // OTHER needs a note
    await editor.put(`/stock-counts/${count.id}/lines`, { lines: [{ id: l1.id, counted_qty: Number(l1.snapshot_qty) - 5, reason_code: 'SPILLAGE' }] });
    const sub = await editor.post(`/stock-counts/${count.id}/submit`);
    expect(sub.status).toBe(200);
    expect(sub.body.status).toBe('SUBMITTED');
    // locked for counters
    expect((await editor.put(`/stock-counts/${count.id}/lines`, { lines: [{ id: l1.id, counted_qty: 1 }] })).status).toBe(409);
  });

  test('only Admin approves; stock moved after counting is kept; variance posted with reason', async () => {
    expect((await editor.post(`/stock-counts/${count.id}/approve`)).status).toBe(403);
    const l1 = count.lines[0];
    const inv = (await q('select * from public.inventory where id = $1', [l1.inventory_id]))[0];
    // a real movement after the shelf was counted: +3 inward on that lot
    await editor.post('/inventory/inward', { mpn_id: inv.mpn_id, location_id: inv.location_id, warehouse_id: inv.warehouse_id, lot_no: inv.lot_no, qty: 3 });
    const ok = await admin.post(`/stock-counts/${count.id}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('POSTED');
    expect(ok.body.posted_lines).toBe(1);
    // snapshot - 5 variance applied on top of the +3 movement
    const after = Number((await q('select quantity from public.inventory where id = $1', [l1.inventory_id]))[0].quantity);
    expect(after).toBeCloseTo(Number(l1.snapshot_qty) + 3 - 5, 4);
    const led = (await q(`select * from public.stock_ledger where reference_id = $1`, [count.count_no]));
    expect(led).toHaveLength(1);
    expect(led[0].reason).toMatch(/Spillage/);
    expect(Number(led[0].qty_change)).toBe(-5);
    expect((await admin.post(`/stock-counts/${count.id}/cancel`)).status).toBe(409);
  });

  test('blind count hides system qty from counters; Admin adds reasons before approving', async () => {
    const r = await editor.post('/stock-counts', { location_id: C.mum.id, warehouse_id: C.wh1.id, blind: true });
    expect(r.body.system_qty_hidden).toBe(true);
    expect(r.body.lines[0].snapshot_qty).toBeNull();
    const asAdmin = (await admin.get(`/stock-counts/${r.body.id}`)).body;
    expect(asAdmin.system_qty_hidden).toBe(false);
    const line = asAdmin.lines[0];
    await editor.put(`/stock-counts/${r.body.id}/lines`, { lines: [{ id: line.id, counted_qty: Number(line.snapshot_qty) + 2 }] });
    expect((await editor.post(`/stock-counts/${r.body.id}/submit`)).status).toBe(200); // no reason needed from blind counters
    expect((await admin.post(`/stock-counts/${r.body.id}/approve`)).status).toBe(400); // admin must add the reason
    await admin.put(`/stock-counts/${r.body.id}/lines`, { lines: [{ id: line.id, reason_code: 'FOUND_EXTRA' }] });
    const ok = await admin.post(`/stock-counts/${r.body.id}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body.lines[0].posted_qty).toBe(2);
  });

  test('send back, cancel, and ledger paging', async () => {
    const r = await editor.post('/stock-counts', { location_id: C.mum.id });
    const line = r.body.lines[0];
    await editor.put(`/stock-counts/${r.body.id}/lines`, { lines: [{ id: line.id, counted_qty: Number(line.snapshot_qty) }] });
    await editor.post(`/stock-counts/${r.body.id}/submit`);
    const back = await admin.post(`/stock-counts/${r.body.id}/return`, { comment: 'Recount pouches' });
    expect(back.body).toMatchObject({ status: 'COUNTING', return_comment: 'Recount pouches' });
    const c = await editor.post(`/stock-counts/${r.body.id}/cancel`);
    expect(c.body.status).toBe('CANCELLED');
    const list = await editor.get('/stock-counts');
    expect(list.body.length).toBeGreaterThanOrEqual(3);

    const p = await editor.get('/inventory/ledger?page=1&page_size=10');
    expect(p.body.rows.length).toBeLessThanOrEqual(10);
    expect(p.body.total).toBeGreaterThan(0);
    const plain = await editor.get('/inventory/ledger');
    expect(Array.isArray(plain.body)).toBe(true);
  });
});

describe('Stock count: movements between starting the sheet and counting the shelf', () => {
  const lotQty = async (id) => Number((await q('select quantity from public.inventory where id = $1', [id]))[0].quantity);
  const start = async (body) => (await editor.post('/stock-counts', { location_id: C.mum.id, warehouse_id: C.wh1.id, ...body })).body;
  const lineOf = (count, lot) => count.lines.find((l) => l.lot_no === lot);
  const finish = async (count, lines, extra = {}) => {
    const s = await editor.put(`/stock-counts/${count.id}/lines`, { lines, ...extra });
    expect(s.status).toBe(200);
    const sub = await editor.post(`/stock-counts/${count.id}/submit`);
    expect(sub.status).toBe(200);
    const ap = await admin.post(`/stock-counts/${count.id}/approve`);
    expect(ap.status).toBe(200);
    return ap.body;
  };

  test('stock received after the sheet was started is not a false + and is not posted twice', async () => {
    const count = await start({ classification: 'PACKAGING' });
    const line = lineOf(count, 'POUCH-L1');
    const inv = (await q('select * from public.inventory where id = $1', [line.inventory_id]))[0];
    const snap = Number(line.snapshot_qty);
    // next morning: 100 pouches received, 40 issued - then the shelf is counted and matches the system
    await editor.post('/inventory/inward', { mpn_id: inv.mpn_id, location_id: inv.location_id, warehouse_id: inv.warehouse_id, lot_no: inv.lot_no, qty: 100 });
    await editor.post('/inventory/outward', { inventory_id: inv.id, qty: 40, reason: 'Production issue' });
    const s = await editor.put(`/stock-counts/${count.id}/lines`, { lines: [{ id: line.id, counted_qty: snap + 60 }] });
    const saved = lineOf(s.body, 'POUCH-L1');
    expect(saved.book_qty).toBe(snap + 60);
    expect(saved.moved_before_count).toBe(60);
    expect(saved.variance_qty).toBe(0);
    await editor.post(`/stock-counts/${count.id}/submit`);
    const ap = await admin.post(`/stock-counts/${count.id}/approve`);
    expect(ap.body.posted_lines).toBe(0);
    expect(await lotQty(inv.id)).toBe(snap + 60);
  });

  test('a real shortage found after a receipt posts only the shortage', async () => {
    const count = await start({ classification: 'PACKAGING' });
    const line = lineOf(count, 'POUCH-L1');
    const snap = Number(line.snapshot_qty);
    const inv = (await q('select * from public.inventory where id = $1', [line.inventory_id]))[0];
    await editor.post('/inventory/inward', { mpn_id: inv.mpn_id, location_id: inv.location_id, warehouse_id: inv.warehouse_id, lot_no: inv.lot_no, qty: 50 });
    const res = await finish(count, [{ id: line.id, counted_qty: snap + 50 - 7, reason_code: 'DAMAGED' }]);
    expect(lineOf(res, 'POUCH-L1').posted_qty).toBe(-7);
    expect(await lotQty(inv.id)).toBe(snap + 50 - 7);
  });

  test('paper sheet counted yesterday and typed in today: counted_at excludes later movements', async () => {
    const count = await start({ classification: 'PACKAGING' });
    const line = lineOf(count, 'POUCH-L1');
    const snap = Number(line.snapshot_qty);
    const countedAt = new Date().toISOString();            // shelf counted now (matches the system)...
    await new Promise((r) => setTimeout(r, 20));
    await editor.post('/inventory/outward', { inventory_id: line.inventory_id, qty: 30, reason: 'Production issue' }); // ...then 30 issued
    const res = await finish(count, [{ id: line.id, counted_qty: snap }], { counted_at: countedAt });
    const l = lineOf(res, 'POUCH-L1');
    expect(l.variance_qty).toBe(0);
    expect(l.moved_after_count).toBe(-30);
    expect(await lotQty(line.inventory_id)).toBe(snap - 30);
    const bad = await editor.post('/stock-counts', { location_id: C.mum.id, warehouse_id: C.wh1.id, classification: 'PACKAGING' });
    const tooEarly = await editor.put(`/stock-counts/${bad.body.id}/lines`, { counted_at: '2020-01-01T00:00:00Z',
      lines: [{ id: bad.body.lines[0].id, counted_qty: 1 }] });
    expect(tooEarly.status).toBe(400);
    await editor.post(`/stock-counts/${bad.body.id}/cancel`);
  });

  test('a lot can be on only one open count', async () => {
    const a = await start({ classification: 'RAW_MATERIAL' });
    const b = await editor.post('/stock-counts', { location_id: C.mum.id });
    expect(b.status).toBe(409);
    expect(b.body.error).toContain(a.count_no);
    await editor.post(`/stock-counts/${a.id}/cancel`);
    const c2 = await editor.post('/stock-counts', { location_id: C.mum.id });
    expect(c2.status).toBe(201);
    await editor.post(`/stock-counts/${c2.body.id}/cancel`);
  });

  test('lots received after the count started can be added; found stock on an empty lot can be counted', async () => {
    const count = await start({ classification: 'RAW_MATERIAL' });
    const rice = (await q(`select id from public.mpns where mpn_code = 'MPN-RICE-AG'`))[0];
    await editor.post('/inventory/inward', { mpn_id: rice.id, location_id: C.mum.id, warehouse_id: C.wh1.id, lot_no: 'RICE-NEW', qty: 25 });
    const add = await editor.post(`/stock-counts/${count.id}/add-lots`);
    expect(add.status).toBe(200);
    expect(add.body.added_lines).toBe(1);
    const nl = lineOf(add.body, 'RICE-NEW');
    expect(nl).toMatchObject({ snapshot_qty: 0, added_after_start: true });
    const res = await finish(count, [{ id: nl.id, counted_qty: 25 }]);
    expect(lineOf(res, 'RICE-NEW').variance_qty).toBe(0);
    expect(res.posted_lines).toBe(0);

    // empty lot with stock found on the shelf
    const empty = (await q(`select id, quantity from public.inventory where lot_no = 'RICE-NEW'`))[0];
    await editor.post('/inventory/outward', { inventory_id: empty.id, qty: 25, reason: 'Production issue' });
    const z = await start({ classification: 'RAW_MATERIAL', include_zero: true });
    const zl = lineOf(z, 'RICE-NEW');
    expect(zl.snapshot_qty).toBe(0);
    await finish(z, [{ id: zl.id, counted_qty: 4, reason_code: 'FOUND_EXTRA' }]);
    expect(await lotQty(empty.id)).toBe(4);
  });
});

describe('BOM line UOM', () => {
  test('a BOM line must use the material stock UOM (no silent g vs kg mix-up)', async () => {
    const r = await admin.post('/boms', { product_id: C.fg.id, location_id: C.mum.id, batch_size: 100, batch_uom: 'kg',
      expected_output_qty: 1000, output_uom: 'pcs', lines: [{ material_id: C.rice.id, qty_per_batch: 60000, uom: 'g' }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/stock UOM/);
  });
});
