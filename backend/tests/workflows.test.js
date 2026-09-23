const { resetDb, ctx, api, getPool, close } = require('./helpers');

let C;
let admin;
let editor;
let viewer;
const q = async (sql, p) => (await getPool().query(sql, p)).rows;

beforeAll(async () => {
  await resetDb();
  C = await ctx();
  admin = api(C.admin.id);
  editor = api(C.editor.id);
  viewer = api(C.viewer.id);
});
afterAll(close);

describe('Inventory (Workflow 1)', () => {
  test('inward creates a lot and an audit ledger row with the new balance', async () => {
    const r = await editor.post('/inventory/inward', {
      mpn_id: C.riceMpn.id, location_id: C.mum.id, warehouse_id: C.wh1.id, lot_no: 'RICE-NEW',
      qty: 40, mfg_date: '2026-09-10', expiry_date: '2027-03-10', reason: 'GRN 55',
    });
    expect(r.status).toBe(201);
    expect(r.body.new_balance).toBe(40);
    const again = await editor.post('/inventory/inward', {
      mpn_id: C.riceMpn.id, location_id: C.mum.id, warehouse_id: C.wh1.id, lot_no: 'RICE-NEW', qty: 10,
    });
    expect(again.body.new_balance).toBe(50);
    const bad = await editor.post('/inventory/inward', {
      mpn_id: C.riceMpn.id, location_id: C.mum.id, warehouse_id: C.wh1.id, lot_no: 'RICE-NEW', qty: 1, expiry_date: '2028-01-01',
    });
    expect(bad.status).toBe(400);
  });

  test('inward rejects a warehouse from another location', async () => {
    const r = await editor.post('/inventory/inward', {
      mpn_id: C.riceMpn.id, location_id: C.mum.id, warehouse_id: C.punWh.id, lot_no: 'X', qty: 1,
    });
    expect(r.status).toBe(400);
  });

  test('outward deducts from the selected lot; over-issue and expired lots are blocked', async () => {
    const lot = await C.lot('RICE-L2');
    const ok = await editor.post('/inventory/outward', { inventory_id: lot.id, qty: 5, reason: 'Sample' });
    expect(ok.status).toBe(201);
    expect(ok.body.new_balance).toBe(75);
    const tooMuch = await editor.post('/inventory/outward', { inventory_id: lot.id, qty: 500, reason: 'x' });
    expect(tooMuch.status).toBe(400);
    const old = await C.lot('RICE-OLD');
    const expired = await editor.post('/inventory/outward', { inventory_id: old.id, qty: 1, reason: 'x' });
    expect(expired.status).toBe(400);
    expect(expired.body.error).toMatch(/expired/);
  });

  test('FEFO lot list excludes expired lots and orders by expiry', async () => {
    const r = await editor.get(`/inventory/lots?material_id=${C.rice.id}&location_id=${C.mum.id}`);
    const lots = r.body.map((x) => x.lot_no);
    expect(lots).not.toContain('RICE-OLD');
    expect(lots[0]).toBe('RICE-L1');
  });

  test('stock adjustment is Admin-only and posts New Physical - System', async () => {
    const lot = await C.lot('RICE-L1');
    const denied = await editor.post('/inventory/adjustments', { inventory_id: lot.id, new_physical_qty: 148, reason: 'count' });
    expect(denied.status).toBe(403);
    const r = await admin.post('/inventory/adjustments', { inventory_id: lot.id, new_physical_qty: 148, reason: 'Cycle count' });
    expect(r.status).toBe(201);
    expect(r.body.adjustment_qty).toBe(-2);
    expect(r.body.ledger.txn_type).toBe('ADJUSTMENT');
  });

  test('inventory cannot be edited directly and the ledger is immutable', async () => {
    await expect(q('update public.inventory set quantity = 1')).rejects.toThrow(/system transactions/);
    await expect(q('delete from public.stock_ledger')).rejects.toThrow(/immutable/);
  });

  test('concurrent issues never drive a lot negative', async () => {
    await editor.post('/inventory/inward', { mpn_id: C.riceMpn.id, location_id: C.mum.id, warehouse_id: C.wh1.id, lot_no: 'RACE', qty: 100 });
    const lot = await C.lot('RACE');
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      editor.post('/inventory/outward', { inventory_id: lot.id, qty: 20, reason: 'race' })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(Number((await C.lot('RACE')).quantity)).toBe(0);
  });

  test('viewer is read-only', async () => {
    const r = await viewer.post('/inventory/inward', { mpn_id: C.riceMpn.id, location_id: C.mum.id, warehouse_id: C.wh1.id, lot_no: 'V', qty: 1 });
    expect(r.status).toBe(403);
  });

  test('transfer: stock moves only on COMPLETED, with two ledger rows and lot dates preserved', async () => {
    const before = await C.lot('LEN-L1');
    const t = await editor.post('/transfers', {
      mpn_id: before.mpn_id, lot_no: 'LEN-L1', qty: 30, from_location_id: C.mum.id, from_warehouse_id: C.wh1.id,
      to_location_id: C.pun.id, to_warehouse_id: C.punWh.id, reason: 'Balance stock',
    });
    expect(t.status).toBe(201);
    expect(t.body.status).toBe('DRAFT');
    expect(Number((await C.lot('LEN-L1')).quantity)).toBe(100);
    const done1 = await editor.post(`/transfers/${t.body.id}/complete`);
    expect(done1.status).toBe(409); // must be IN_TRANSIT first
    expect((await editor.post(`/transfers/${t.body.id}/dispatch`)).body.status).toBe('IN_TRANSIT');
    const done = await editor.post(`/transfers/${t.body.id}/complete`);
    expect(done.body.status).toBe('COMPLETED');
    const rows = await q(`select * from public.inventory where lot_no = 'LEN-L1' order by quantity desc`);
    expect(rows.map((r) => Number(r.quantity))).toEqual([70, 30]);
    expect(rows[1].expiry_date).toBe(rows[0].expiry_date);
    const ledger = await q(`select txn_type from public.stock_ledger where reference_id = $1 order by txn_no`, [t.body.transfer_no]);
    expect(ledger.map((l) => l.txn_type)).toEqual(['TRANSFER_OUT', 'TRANSFER_IN']);
    expect((await editor.post(`/transfers/${t.body.id}/cancel`)).status).toBe(409);
  });
});

describe('Planning engine (Workflow 2)', () => {
  test('simulate: ceil batches, BOM explosion with scrap allowance, availability', async () => {
    const r = await editor.post('/plans/simulate', { product_id: C.fg.id, location_id: C.mum.id, demand_qty: 2500 });
    expect(r.status).toBe(200);
    expect(r.body.planSummary.remaining_batches).toBe(3);
    const rice = r.body.materialSummary.find((m) => m.material_code === 'RM-RICE');
    expect(rice.qty_required).toBeCloseTo(60 * 3 * 1.02, 4);
    expect(rice.mpn_code).toBe('MPN-RICE-AG');
    expect(rice.vendor_name).toBe('Agro Grains Co');
    const pouch = r.body.materialSummary.find((m) => m.material_code === 'PK-POUCH');
    expect(pouch.status).toBe('SHORT'); // 3030 needed, 2500 available
    const noScrap = await editor.post('/plans/simulate', { product_id: C.fg.id, location_id: C.mum.id, demand_qty: 2500, apply_scrap_allowance: false });
    expect(noScrap.body.materialSummary.find((m) => m.material_code === 'RM-RICE').qty_required).toBe(180);
  });

  test('expired stock does not count as available', async () => {
    const r = await editor.post('/plans/simulate', { product_id: C.fg.id, location_id: C.mum.id, demand_qty: 1000 });
    const rice = r.body.materialSummary.find((m) => m.material_code === 'RM-RICE');
    const usable = await q(`select sum(quantity)::float as s from public.inventory where material_id = $1
                             and location_id = $2 and expiry_date >= current_date`, [C.rice.id, C.mum.id]);
    expect(rice.qty_available).toBe(usable[0].s);
  });
});

describe('Manufacturing (Workflows 3 + 4) and dynamic plan edit', () => {
  let plan;
  let batch;

  test('create plan for 10 units', async () => {
    const r = await editor.post('/plans', { product_id: C.fg.id, location_id: C.mum.id, target_qty: 10 });
    expect(r.status).toBe(201);
    plan = r.body.plan;
    expect(r.body.planSummary).toMatchObject({ target_qty: 10, executed_qty: 0, remaining_qty: 10, remaining_batches: 1 });
  });

  test('variance above tolerance without a reason is blocked and nothing moves', async () => {
    const rice = await C.lot('RICE-L1');
    const r = await editor.post('/batches', {
      source: 'PLAN', plan_id: plan.id, plan_output_qty: 10, actual_output_qty: 8,
      inputs: [{ material_id: C.rice.id, inventory_id: rice.id, plan_input_qty: 0.6, actual_input_qty: 0.6 }],
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/tolerance/);
    expect(Number((await C.lot('RICE-L1')).quantity)).toBe(Number(rice.quantity));
  });

  test('batch is atomic: a failing input rolls back every stock change', async () => {
    const rice = await C.lot('RICE-L1');
    const lentil = await C.lot('LEN-L1');
    const fgBefore = await q('select count(*)::int as n from public.batches');
    const r = await editor.post('/batches', {
      source: 'PLAN', plan_id: plan.id, plan_output_qty: 1, actual_output_qty: 1,
      inputs: [
        { material_id: C.rice.id, inventory_id: rice.id, plan_input_qty: 0.06, actual_input_qty: 0.06 },
        { material_id: C.lentil.id, inventory_id: lentil.id, plan_input_qty: 9999, actual_input_qty: 9999 },
      ],
    });
    expect(r.status).toBe(400);
    expect(Number((await C.lot('RICE-L1')).quantity)).toBe(Number(rice.quantity));
    expect((await q('select count(*)::int as n from public.batches'))[0].n).toBe(fgBefore[0].n);
  });

  test('expired lots cannot be consumed', async () => {
    const old = await C.lot('RICE-OLD');
    const r = await editor.post('/batches', {
      source: 'AD_HOC', product_id: C.fg.id, location_id: C.mum.id, plan_output_qty: 1, actual_output_qty: 1,
      inputs: [{ material_id: C.rice.id, inventory_id: old.id, plan_input_qty: 0.06, actual_input_qty: 0.06 }],
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/expired/);
  });

  test('execute 1 unit: RM lots deducted, FG lot = batch no, plan remaining 9', async () => {
    const pf = await editor.get(`/batches/prefill?plan_id=${plan.id}&planned_output=1`);
    expect(pf.status).toBe(200);
    expect(pf.body.lines).toHaveLength(3);
    const inputs = pf.body.lines.map((l) => ({
      material_id: l.material_id, inventory_id: l.suggested_inventory_id, plan_input_qty: l.plan_input_qty, actual_input_qty: l.plan_input_qty,
    }));
    const riceBefore = Number((await C.lot('RICE-L1')).quantity);
    const r = await editor.post('/batches', {
      source: 'PLAN', plan_id: plan.id, batch_no: 'B-TEST-01', mfg_date: '2026-09-20', expiry_date: '2027-06-20',
      plan_output_qty: 1, actual_output_qty: 1, inputs,
    });
    expect(r.status).toBe(201);
    batch = r.body;
    expect(Number((await C.lot('RICE-L1')).quantity)).toBeCloseTo(riceBefore - 0.0612, 4);
    const fgLot = await C.lot('B-TEST-01');
    expect(Number(fgLot.quantity)).toBe(1);
    expect(fgLot.expiry_date).toBe('2027-06-20');
    const ledger = await q(`select txn_type from public.stock_ledger where reference_id = 'B-TEST-01'`);
    expect(ledger.filter((l) => l.txn_type === 'MFG_CONSUMPTION')).toHaveLength(3);
    expect(ledger.filter((l) => l.txn_type === 'MFG_OUTPUT')).toHaveLength(1);
    const pv = await editor.get(`/plans/${plan.id}`);
    expect(pv.body.planSummary).toMatchObject({ executed_qty: 1, remaining_qty: 9, status: 'IN_PROGRESS' });
    expect(pv.body.batchSummary[0]).toMatchObject({ batch_no: 'B-TEST-01', executed: true });
  });

  test('spec example: target 10 -> 20 recalculates remaining (19) and requirements (Admin only)', async () => {
    const denied = await editor.patch(`/plans/${plan.id}`, { target_qty: 20 });
    expect(denied.status).toBe(403);
    const r = await admin.patch(`/plans/${plan.id}`, { target_qty: 20 });
    expect(r.status).toBe(200);
    expect(r.body.planSummary).toMatchObject({ target_qty: 20, executed_qty: 1, remaining_qty: 19, remaining_batches: 1 });
    const rice = r.body.materialSummary.find((m) => m.material_code === 'RM-RICE');
    expect(rice.qty_required).toBeCloseTo(61.2, 4); // 1 batch x 60 kg x 1.02
    const below = await admin.patch(`/plans/${plan.id}`, { target_qty: 0.5 });
    expect(below.status).toBe(400);
  });

  test('edit batch IP/OP posts only the delta', async () => {
    const riceInput = batch.inputs.find((i) => i.material_code === 'RM-RICE');
    const riceLotBefore = Number((await C.lot(riceInput.lot_no)).quantity);
    const r = await editor.put(`/batches/${batch.id}`, {
      actual_output_qty: 1.04,
      inputs: [{ id: riceInput.id, actual_input_qty: 0.0632 }],
    });
    expect(r.status).toBe(200);
    expect(Number((await C.lot('B-TEST-01')).quantity)).toBeCloseTo(1.04, 4);
    expect(Number((await C.lot(riceInput.lot_no)).quantity)).toBeCloseTo(riceLotBefore - 0.002, 4);
    const pv = await editor.get(`/plans/${plan.id}`);
    expect(pv.body.planSummary.executed_qty).toBeCloseTo(1.04, 4);
    const corr = await q(`select count(*)::int as n from public.stock_ledger where txn_type = 'MFG_CORRECTION' and reference_id = 'B-TEST-01'`);
    expect(corr[0].n).toBe(2);
  });

  test('variance tolerance override: editor 403, admin allowed without reason', async () => {
    const denied = await editor.post('/batches', {
      source: 'AD_HOC', product_id: C.fg.id, location_id: C.mum.id, plan_output_qty: 10, actual_output_qty: 5, tolerance_override: true,
    });
    expect(denied.status).toBe(403);
    const ok = await admin.post('/batches', {
      source: 'AD_HOC', product_id: C.fg.id, location_id: C.mum.id, plan_output_qty: 10, actual_output_qty: 5, tolerance_override: true,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.variance_pct).toBe(-50);
  });
});

describe('Reports & traceability (Workflow 5)', () => {
  test('backward and forward traceability', async () => {
    const back = await editor.get(`/reports/trace?mpn_id=${C.fgMpn.id}&lot_no=B-TEST-01`);
    expect(back.status).toBe(200);
    expect(back.body.backward[0].inputs.map((i) => i.material_code).sort()).toEqual(['PK-POUCH', 'RM-LENTIL', 'RM-RICE']);
    const riceLot = back.body.backward[0].inputs.find((i) => i.material_code === 'RM-RICE');
    const fwd = await editor.get(`/reports/trace?mpn_id=${riceLot.mpn_id}&lot_no=${riceLot.lot_no}`);
    expect(fwd.body.forward.map((b) => b.batch_no)).toContain('B-TEST-01');
  });

  test('transaction report filters and physical stock sheet', async () => {
    const t = await editor.get('/inventory/ledger?type=TRANSFER_OUT');
    expect(t.body.every((r) => r.txn_type === 'TRANSFER_OUT')).toBe(true);
    const sheet = await editor.get('/reports/physical-stock-sheet').set('X-Location-Id', C.mum.id);
    expect(sheet.status).toBe(200);
    expect(sheet.body.length).toBeGreaterThan(0);
    expect(sheet.body[0]).toHaveProperty('system_qty');
  });
});
