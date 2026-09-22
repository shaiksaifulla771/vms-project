const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function runLiveApiVerification() {
  console.log('===============================================================');
  console.log('       LIVE API ENTERPRISE ARCHITECTURE VERIFICATION           ');
  console.log('===============================================================\n');

  const results = { passed: 0, failed: 0 };
  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      results.passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      results.failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // AUTHENTICATION
    // -------------------------------------------------------------
    console.log('--- 0. AUTHENTICATION ---');
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: 'admin@vms.com',
      password: 'admin123'
    });
    assert(loginRes.status === 200 && (loginRes.data.token || loginRes.headers['set-cookie']), 'Admin login successful');

    const token = loginRes.data.token;
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    const client = axios.create({
      baseURL: API_BASE,
      headers: authHeaders,
      withCredentials: true
    });

    // -------------------------------------------------------------
    // TEST 1: MASTER DATA SAFEGUARD (Zero Deletions)
    // -------------------------------------------------------------
    console.log('\n--- 1. MASTER DATA SAFEGUARD (ZERO DELETION) ---');
    const [matsRes, vendsRes, mpnsRes, bomsRes] = await Promise.all([
      client.get('/materials?limit=200'),
      client.get('/vendors?limit=200'),
      client.get('/mpn?limit=200'),
      client.get('/bom?limit=200')
    ]);

    const matCount = matsRes.data.total || matsRes.data.count || matsRes.data.data?.length || 0;
    const vendCount = vendsRes.data.total || vendsRes.data.count || vendsRes.data.data?.length || 0;
    const mpnCount = mpnsRes.data.total || mpnsRes.data.count || mpnsRes.data.data?.length || 0;
    const bomCount = bomsRes.data.total || bomsRes.data.count || bomsRes.data.data?.length || 0;

    console.log(`  Counts: Materials=${matCount}, Vendors=${vendCount}, MPNs=${mpnCount}, BOMs=${bomCount}`);
    assert(matCount >= 108, `108 Materials preserved (Found: ${matCount})`);
    assert(vendCount >= 43, `43 Vendors preserved (Found: ${vendCount})`);
    assert(mpnCount >= 86, `86 MPNs preserved (Found: ${mpnCount})`);
    assert(bomCount >= 22, `22 BOM Recipes preserved (Found: ${bomCount})`);

    // -------------------------------------------------------------
    // TEST 2: BOM BATCH PARAMETERS & LOCATION ASSIGNMENT
    // -------------------------------------------------------------
    console.log('\n--- 2. BOM BATCH PARAMETERS & LOCATION ---');
    const bomsList = bomsRes.data.data || bomsRes.data.boms || [];
    const sampleBom = bomsList[0];
    assert(sampleBom !== undefined, 'Active BOM recipe retrieved');
    assert(sampleBom.batchSize !== undefined, `BOM batchSize present: ${sampleBom.batchSize}`);
    assert(sampleBom.expectedOutputQty !== undefined, `BOM expectedOutputQty present: ${sampleBom.expectedOutputQty}`);
    assert(sampleBom.batchUOM !== undefined, `BOM batchUOM present: ${sampleBom.batchUOM}`);

    // -------------------------------------------------------------
    // TEST 3: CENTRALIZED INVENTORY INWARD, OUTWARD & RECONCILIATION
    // -------------------------------------------------------------
    console.log('\n--- 3. CENTRALIZED INVENTORY INWARD & OUTWARD ---');
    const sitesRes = await client.get('/sites');
    const whRes = await client.get('/warehouses');
    const sites = sitesRes.data.sites || sitesRes.data.data || [];
    const warehouses = whRes.data.warehouses || whRes.data.data || [];

    const site = sites[0];
    const warehouse = warehouses.find(w => (w.siteId?._id || w.siteId) === site?._id) || warehouses[0];
    const rawMats = (matsRes.data.data || matsRes.data.materials || []).filter(m => m.type === 'Raw Material');
    const targetMat = rawMats[0] || matsRes.data.data[0];

    const testLotNumber = `LOT-VERIFY-${Date.now().toString().slice(-5)}`;

    // Inward stock
    const inwardPayload = {
      materialId: targetMat._id,
      lotNumber: testLotNumber,
      quantity: 500,
      warehouseId: warehouse._id,
      siteId: site._id,
      mfgDate: '2026-01-10',
      expiryDate: '2027-01-10',
      reason: 'PO Receipt Inward'
    };
    const inwardRes = await client.post('/inventory/inward', inwardPayload);
    assert(inwardRes.data.success === true, `Inward stock posted for lot ${testLotNumber}`);

    // Outward stock with specific lot removal
    const outwardPayload = {
      materialId: targetMat._id,
      quantity: 150,
      warehouseId: warehouse._id,
      siteId: site._id,
      lotNumber: testLotNumber,
      reason: 'Production Stage Dispatch'
    };
    const outwardRes = await client.post('/inventory/outward', outwardPayload);
    assert(outwardRes.data.success === true, `Outward stock deducted from lot ${testLotNumber}`);

    // -------------------------------------------------------------
    // TEST 4: INTER-WAREHOUSE STOCK TRANSFER
    // -------------------------------------------------------------
    console.log('\n--- 4. INTER-WAREHOUSE TRANSFER ---');
    const destWh = warehouses.find(w => w._id !== warehouse._id) || warehouses[1];
    if (destWh) {
      const transferPayload = {
        materialId: targetMat._id,
        lotNumber: testLotNumber,
        fromWarehouseId: warehouse._id,
        toWarehouseId: destWh._id,
        sourceWarehouseId: warehouse._id,
        destinationWarehouseId: destWh._id,
        quantity: 50,
        reason: 'Inter-plant transfer'
      };
      const transferRes = await client.post('/inventory/transfer', transferPayload);
      assert(transferRes.data.success === true, `Stock transfer succeeded from ${warehouse.name} to ${destWh.name}`);
    } else {
      console.log('  [SKIP] Only one warehouse available, transfer skipped');
    }

    // -------------------------------------------------------------
    // TEST 5: LOT ADJUSTMENT / EDIT (PHYSICAL COUNT RECONCILIATION)
    // -------------------------------------------------------------
    console.log('\n--- 5. LOT EDIT & PHYSICAL RECONCILIATION ---');
    const adjustPayload = {
      materialId: targetMat._id,
      warehouseId: warehouse._id,
      lotNumber: testLotNumber,
      newQuantity: 280, // Physical count adjustment
      reason: 'Physical inventory cycle count reconciliation'
    };
    const adjustRes = await client.post('/inventory/adjust-lot', adjustPayload);
    assert(adjustRes.data.success === true, `Lot stock reconciled with audit delta: ${adjustRes.data.message}`);

    // -------------------------------------------------------------
    // TEST 6: PLANNING MRP DEMAND SIMULATION (SHEET 3 BLUEPRINT)
    // -------------------------------------------------------------
    console.log('\n--- 6. PLANNING MRP DEMAND SIMULATION (SHEET 3) ---');
    const fgMaterials = (matsRes.data.data || matsRes.data.materials || []).filter(m => m.type === 'Finished' || m.makeOrBuy === 'MAKE');
    const fgMat = fgMaterials[0] || matsRes.data.data[0];

    const simPayload = {
      productId: fgMat._id,
      demandQty: 4000,
      siteId: site._id
    };
    const simRes = await client.post('/production-plans/simulate', simPayload);
    assert(simRes.data.success === true, `Demand planning simulation executed for ${fgMat.name}`);

    const sim = simRes.data.data;
    assert(sim.planSummary && sim.planSummary.length > 0, 'Tier 1 Plan Summary generated');
    console.log(`    Plan: Demand=${sim.planSummary[0].demandQty}, Batches=${sim.planSummary[0].noOfBatches}, Output=${sim.planSummary[0].targetOutputQty} ${sim.planSummary[0].uom}`);

    assert(sim.batchSummary && sim.batchSummary.length === sim.planSummary[0].noOfBatches, `Tier 2 Batch Summary has ${sim.batchSummary.length} discrete scheduled batches`);

    assert(sim.materialSummary && sim.materialSummary.length > 0, `Tier 3 Material Summary exploded ${sim.materialSummary.length} components with availability & shortages`);

    assert(sim.maxProducible !== undefined, 'Computed Maximum Producible Quantity and bottleneck ingredient');
    console.log(`    Max Producible Qty: ${sim.maxProducible.maxProducibleQty} ${sim.maxProducible.uom} (${sim.maxProducible.maxBatches} batches)`);
    console.log(`    Bottleneck: ${sim.maxProducible.bottleneckMaterial} (Deficit: ${sim.maxProducible.bottleneckDeficit})`);

    // -------------------------------------------------------------
    // TEST 7: MANUFACTURING BATCH EXECUTION & 5% VARIANCE GATE
    // -------------------------------------------------------------
    console.log('\n--- 7. MANUFACTURING BATCH EXECUTION & 5% GATE ---');
    const activeBom = bomsList.find(b => (b.productId?._id || b.productId) === fgMat._id || (b.product?._id || b.product) === fgMat._id) || sampleBom;

    // 7A: Verify 5% gate blocks >5% variance without justification
    let blockedByGate = false;
    try {
      await client.post('/batches/execute', {
        batchNumber: `GATE-TEST-${Date.now().toString().slice(-4)}`,
        productId: fgMat._id,
        bomId: activeBom._id,
        planOutputQty: 1000,
        actualOutputQty: 1100, // +10% variance without reason!
        varianceReason: '',
        warehouseId: warehouse._id,
        siteId: site._id
      });
    } catch (gateErr) {
      if (gateErr.response?.status === 400 && gateErr.response.data?.error?.includes('5% tolerance')) {
        blockedByGate = true;
      }
    }
    assert(blockedByGate, '5% Variance Gate successfully blocked excessive output variance without justification');

    // 7B: Execute batch with variance within tolerance or with reason
    const execBatchNo = `BATCH-LIVE-${Date.now().toString().slice(-5)}`;
    const execPayload = {
      batchNumber: execBatchNo,
      productId: fgMat._id,
      bomId: activeBom._id,
      planOutputQty: 1000,
      actualOutputQty: 1020, // 2% variance
      consumeLots: true,
      warehouseId: warehouse._id,
      siteId: site._id,
      inputs: (activeBom.components || []).map(c => ({
        materialId: c.materialId?._id || c.materialId,
        planInputQty: c.quantity || 10,
        actualInputQty: c.quantity || 10
      }))
    };
    const execRes = await client.post('/batches/execute', execPayload);
    assert(execRes.data.success === true, `Batch ${execBatchNo} executed and posted to inventory`);

    const executedOrderId = execRes.data.data?._id;

    // -------------------------------------------------------------
    // TEST 8: DYNAMIC IP/OP POST-ENTRY ADJUSTMENT
    // -------------------------------------------------------------
    console.log('\n--- 8. DYNAMIC IP/OP POST-ENTRY CORRECTION ---');
    if (executedOrderId) {
      const dynamicPayload = {
        actualOutputQty: 1040, // Adjust output from 1020 to 1040 (+20 kg)
        adjustmentReason: 'Post-cooling scale weight calibration',
        inputs: (activeBom.components || []).map(c => ({
          materialId: c.materialId?._id || c.materialId,
          actualInputQty: (c.quantity || 10) + 1 // Adjust ingredient by +1 kg
        }))
      };
      const dynamicRes = await client.put(`/batches/${executedOrderId}/dynamic-ip-op`, dynamicPayload);
      assert(dynamicRes.data.success === true, 'Dynamic IP/OP post-entry adjustment applied and inventory ledger adjusted');
      assert(dynamicRes.data.data?.actualQuantity === 1040, `Batch order updated to 1040 units`);
    }

    console.log('\n===============================================================');
    console.log(`VERIFICATION COMPLETE: ${results.passed} PASSED, ${results.failed} FAILED`);
    console.log('===============================================================\n');

    process.exit(results.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal test error:', error.response?.data || error.message);
    results.failed++;
    process.exit(1);
  }
}

runLiveApiVerification();
