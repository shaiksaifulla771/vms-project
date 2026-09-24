const { resetDb, ctx, api, getPool, close } = require('./helpers');

let C;
let admin;
let editor;
const q = async (sql, p) => (await getPool().query(sql, p)).rows;
const lotQty = async (lot) => Number((await q('select coalesce(sum(quantity), 0) as n from public.inventory where lot_no = $1', [lot]))[0].n);

beforeAll(async () => {
  await resetDb();
  C = await ctx();
  admin = api(C.admin.id);
  editor = api(C.editor.id);
});
afterAll(close);

async function runBatch(planId, output, batchNo) {
  const pf = await editor.get(`/batches/prefill?plan_id=${planId}&planned_output=${output}`);
  const inputs = pf.body.lines.map((l) => ({
    material_id: l.material_id, inventory_id: l.suggested_inventory_id, plan_input_qty: l.plan_input_qty, actual_input_qty: l.plan_input_qty,
  }));
  return editor.post('/batches', { source: 'PLAN', plan_id: planId, plan_output_qty: output, actual_output_qty: output, inputs, batch_no: batchNo });
}

describe('Batch reversal and plan history', () => {
  let plan;
  let batch;

  test('executing a batch is recorded in the plan history', async () => {
    plan = (await editor.post('/plans', { product_id: C.fg.id, location_id: C.mum.id, plan_mode: 'BATCHES', target_batches: 2 })).body.plan;
    const r = await runBatch(plan.id, 1000);
    expect(r.status).toBe(201);
    batch = r.body;
    const view = (await editor.get(`/plans/${plan.id}`)).body;
    expect(view.events.map((e) => e.event)).toEqual(['BATCH_EXECUTED', 'CREATED']);
    expect(view.events[0].new_value).toMatchObject({ batch_no: batch.batch_no, output_qty: 1000 });
  });

  test('only Admin can reverse; a reason is required', async () => {
    expect((await editor.post(`/batches/${batch.id}/reverse`, { reason: 'Wrong entry' })).status).toBe(403);
    expect((await admin.post(`/batches/${batch.id}/reverse`, {})).status).toBe(400);
  });

  test('reversal returns materials, removes the output, and reopens the plan', async () => {
    const before = {};
    for (const i of batch.inputs) before[i.lot_no] = await lotQty(i.lot_no);
    const r = await admin.post(`/batches/${batch.id}/reverse`, { reason: 'Entered on the wrong plan' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('REVERSED');
    expect(await lotQty(batch.batch_no)).toBe(0);
    for (const i of batch.inputs.filter((x) => x.actual_input_qty > 0)) {
      expect(await lotQty(i.lot_no)).toBeCloseTo(before[i.lot_no] + Number(i.actual_input_qty), 4);
    }
    const view = (await editor.get(`/plans/${plan.id}`)).body;
    expect(view.planSummary).toMatchObject({ executed_batches: 0, remaining_batches: 2, executed_qty: 0, status: 'OPEN' });
    expect(view.events[0]).toMatchObject({ event: 'BATCH_REVERSED' });
    const led = await q(`select txn_type from public.stock_ledger where reference_type = 'BATCH_REVERSAL' and reference_id = $1`, [batch.batch_no]);
    expect(led.length).toBe(1 + batch.inputs.filter((x) => x.actual_input_qty > 0).length);
    // a reversed batch cannot be edited or reversed again
    expect((await admin.post(`/batches/${batch.id}/reverse`, { reason: 'again' })).status).toBe(409);
    expect((await admin.put(`/batches/${batch.id}`, { actual_output_qty: 5 })).status).toBe(409);
  });

  test('reversal is blocked when the output was already issued', async () => {
    const r = await runBatch(plan.id, 1000);
    const fg = (await q('select id from public.inventory where lot_no = $1', [r.body.batch_no]))[0];
    await editor.post('/inventory/outward', { inventory_id: fg.id, qty: 10, reason: 'Sample / QC' });
    const rev = await admin.post(`/batches/${r.body.id}/reverse`, { reason: 'test' });
    expect(rev.status).toBe(400);
    expect(rev.body.error).toMatch(/still in lot/);
  });

  test('a batch no cannot reuse an existing lot of the product', async () => {
    const used = (await q(`select batch_no from public.batches where status = 'COMPLETED' limit 1`))[0].batch_no;
    const dup = await runBatch(plan.id, 1000, used.toLowerCase());
    expect(dup.status).toBe(400);
  });

  test('Inward cannot top up the output lot of a batch', async () => {
    // Finished goods are refused outright, so this uses a semi-finished good, which may be bought.
    const semi = (await admin.post('/materials', { name: 'Roasted Base', classification: 'SEMI_FINISHED', uom: 'kg' })).body;
    const mpnId = (await q('select id from public.mpns where material_id = $1', [semi.id]))[0].id;
    const b = await editor.post('/batches', { source: 'AD_HOC', product_id: semi.id, location_id: C.mum.id, actual_output_qty: 20, inputs: [] });
    expect(b.status).toBe(201);
    const inw = await editor.post('/inventory/inward', { mpn_id: mpnId, location_id: b.body.location_id,
      warehouse_id: b.body.warehouse_id, lot_no: b.body.batch_no, qty: 5 });
    expect(inw.status).toBe(400);
    expect(inw.body.error).toMatch(/production batch/);
  });
});

describe('References for goods receipt and sale', () => {
  test('goods receipt needs a GRN / invoice no; sale needs an invoice / DC no', async () => {
    const base = { mpn_id: C.riceMpn.id, location_id: C.mum.id, warehouse_id: C.wh1.id, lot_no: 'REF-1', qty: 5 };
    expect((await editor.post('/inventory/inward', { ...base, reason: 'Goods receipt' })).status).toBe(400);
    expect((await editor.post('/inventory/inward', { ...base, reason: 'Goods receipt', reference: 'GRN-77' })).status).toBe(201);
    const lot = await C.lot('REF-1');
    expect((await editor.post('/inventory/outward', { inventory_id: lot.id, qty: 1, reason: 'Sale / dispatch' })).status).toBe(400);
    const ok = await editor.post('/inventory/outward', { inventory_id: lot.id, qty: 1, reason: 'Sale / dispatch', reference: 'INV-9' });
    expect(ok.status).toBe(201);
    expect(ok.body.reference_id).toBe('INV-9');
  });
});

describe('Reorder alerts', () => {
  test('materials at or below their reorder level are listed; open plans do not change the figure', async () => {
    const r = await admin.put(`/materials/${C.lentil.id}`, { reorder_level: 100000 });
    expect(r.status).toBe(200);
    expect(Number(r.body.reorder_level)).toBe(100000);
    const list = (await editor.get('/reports/reorder')).body;
    const lentil = list.find((x) => x.material_code === 'RM-LENTIL');
    expect(lentil).toBeTruthy();
    const actual = Number((await q(`select coalesce(sum(quantity), 0) as n from public.inventory
                                     where material_id = $1 and quantity > 0
                                       and (expiry_date is null or expiry_date >= current_date)`, [C.lentil.id]))[0].n);
    expect(lentil.stock_qty).toBeCloseTo(actual, 4);                               // plain stock, nothing reserved
    expect(lentil.to_order_qty).toBeCloseTo(100000 - actual, 4);
    expect(lentil.plan_need_qty).toBeUndefined();
    expect(lentil.free_qty).toBeUndefined();
    expect(list.find((x) => x.material_code === 'RM-RICE')).toBeUndefined();        // no reorder level set
    await admin.put(`/materials/${C.lentil.id}`, { reorder_level: 0 });
    expect((await editor.get('/reports/reorder')).body.find((x) => x.material_code === 'RM-LENTIL')).toBeUndefined();
  });
});
