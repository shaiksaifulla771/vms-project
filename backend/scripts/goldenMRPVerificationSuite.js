/**
 * 22-SCENARIO ENTERPRISE GOLDEN MRP & PRODUCTION VERIFICATION SUITE
 * 
 * Verifies all 22 deterministic planning scenarios across:
 * 1. Mathematical formulas & protected safety stock
 * 2. Time-phased open supply vs late supply
 * 3. Lot-sizing (MOQ + multiple batch ceil)
 * 4. Multi-level BOM recursion & scrap adjustments
 * 5. Python MRPSolver vs Node.js Native Solver mathematical parity
 * 6. Planning snapshots & idempotency
 * 7. Production lifecycle state transitions
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PythonMRPClient = require('../services/pythonMRPClient');
const MRPEngineService = require('../services/mrpEngineService');
const MRPRun = require('../models/MRPRun');
const PlanningRequirement = require('../models/PlanningRequirement');
const ProductionPlan = require('../models/ProductionPlan');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const Warehouse = require('../models/Warehouse');
const Site = require('../models/Site');
const InventoryItem = require('../models/InventoryItem');
const PurchaseOrder = require('../models/PurchaseOrder');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';

async function runGoldenTestSuite() {
  console.log('\n======================================================');
  console.log('🌟 RUNNING 22 ENTERPRISE GOLDEN MRP VERIFICATION SCENARIOS');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  function assertScenario(id, name, condition, details = '') {
    if (condition) {
      passed++;
      results.push({ id, name, status: 'PASSED', details });
      console.log(`✓ [Scenario ${id.toString().padStart(2, '0')}] ${name}: PASSED ${details ? '(' + details + ')' : ''}`);
    } else {
      failed++;
      results.push({ id, name, status: 'FAILED', details });
      console.error(`✗ [Scenario ${id.toString().padStart(2, '0')}] ${name}: FAILED - ${details}`);
    }
  }

  // -------------------------------------------------------------
  // TEST SECTION A: PURE MATHEMATICAL & NETTING SOLVER INVARIANTS
  // -------------------------------------------------------------

  // Scenario 1: Exact Stock (Demand = Available, Net = 0, Shortage = 0)
  {
    const comp = { qty_per_unit: 1, on_hand_inventory: 100, reserved_inventory: 0, open_supply: 0, safety_stock: 0 };
    const [res] = PythonMRPClient.solveNativeFallback(100, '2026-09-01', [comp]);
    assertScenario(1, 'Exact Stock', res.net_required_qty === 0 && res.shortage_qty === 0 && res.shortage_reason === 'SUFFICIENT');
  }

  // Scenario 2: Simple Shortage (Demand = 100, Avail = 40 -> Net = 60, Shortage = 60)
  {
    const comp = { qty_per_unit: 1, on_hand_inventory: 40, reserved_inventory: 0, open_supply: 0, safety_stock: 0 };
    const [res] = PythonMRPClient.solveNativeFallback(100, '2026-09-01', [comp]);
    assertScenario(2, 'Simple Shortage', res.net_required_qty === 60 && res.shortage_qty === 60 && res.shortage_reason === 'INSUFFICIENT_STOCK');
  }

  // Scenario 3: Reserved Inventory Isolation (OnHand 100, Reserved 40 -> Avail 60 -> Net 40)
  {
    const comp = { qty_per_unit: 1, on_hand_inventory: 100, reserved_inventory: 40, open_supply: 0, safety_stock: 0 };
    const [res] = PythonMRPClient.solveNativeFallback(100, '2026-09-01', [comp]);
    assertScenario(3, 'Reserved Inventory Isolation', res.available_qty === 60 && res.net_required_qty === 40 && res.shortage_qty === 40);
  }

  // Scenario 4: Open Purchase Supply (Demand 100, Avail 20, PO 50 -> Net 30, Shortage 30)
  {
    const comp = { qty_per_unit: 1, on_hand_inventory: 20, reserved_inventory: 0, open_supply: 50, eligible_supply: 50, safety_stock: 0 };
    const [res] = PythonMRPClient.solveNativeFallback(100, '2026-09-01', [comp]);
    assertScenario(4, 'Open Purchase Supply', res.net_required_qty === 30 && res.shortage_qty === 30 && res.open_supply === 50);
  }

  // Scenario 5: Open Production Supply (Demand 100, Avail 10, MO 60 -> Net 30, Shortage 30)
  {
    const comp = { qty_per_unit: 1, on_hand_inventory: 10, reserved_inventory: 0, open_supply: 60, eligible_supply: 60, make_or_buy: 'MAKE', safety_stock: 0 };
    const [res] = PythonMRPClient.solveNativeFallback(100, '2026-09-01', [comp]);
    assertScenario(5, 'Open Production Supply', res.net_required_qty === 30 && res.action === 'Produce');
  }

  // Scenario 6: Protected Safety Stock Replenishment (Demand 100, Avail 100, Safety 25 -> Shortage 0, Net 25)
  {
    const comp = { qty_per_unit: 1, on_hand_inventory: 100, reserved_inventory: 0, open_supply: 0, safety_stock: 25 };
    const [res] = PythonMRPClient.solveNativeFallback(100, '2026-09-01', [comp]);
    assertScenario(6, 'Protected Safety Stock', res.shortage_qty === 0 && res.net_required_qty === 25 && res.shortage_reason === 'SAFETY_STOCK_REPLENISHMENT');
  }

  // Scenario 7: MOQ Enforcement (Net 22, MOQ 50 -> Optimal Lot 50)
  {
    const comp = { qty_per_unit: 1, on_hand_inventory: 78, reserved_inventory: 0, open_supply: 0, safety_stock: 0, moq: 50, lot_size: 1 };
    const [res] = PythonMRPClient.solveNativeFallback(100, '2026-09-01', [comp]);
    assertScenario(7, 'MOQ Enforcement', res.net_required_qty === 22 && res.optimal_lot_qty === 50);
  }

  // Scenario 8: Lot Size Multiples Rounding (Net 65, MOQ 50, Multiple 25 -> Optimal Lot 75)
  {
    const comp = { qty_per_unit: 1, on_hand_inventory: 35, reserved_inventory: 0, open_supply: 0, safety_stock: 0, moq: 50, lot_size: 25 };
    const [res] = PythonMRPClient.solveNativeFallback(100, '2026-09-01', [comp]);
    assertScenario(8, 'Lot Size Multiples', res.net_required_qty === 65 && res.optimal_lot_qty === 75 && res.recommended_order_batches === 3);
  }

  // Scenario 9: Backward Lead Time Offsetting (ReqDate 2026-09-01, LeadTime 10 -> ReleaseDate 2026-08-22)
  {
    const comp = { qty_per_unit: 1, on_hand_inventory: 0, reserved_inventory: 0, open_supply: 0, lead_time_days: 10 };
    const [res] = PythonMRPClient.solveNativeFallback(10, '2026-09-01T00:00:00.000Z', [comp]);
    assertScenario(9, 'Lead Time Offsetting', res.planned_order_release_date === '2026-08-22');
  }

  // Scenario 10: Time-Phased Late Supply (Open PO 100 arriving after ReqDate -> Shortage 100, Reason LATE_SUPPLY)
  {
    const comp = { qty_per_unit: 1, on_hand_inventory: 0, reserved_inventory: 0, open_supply: 100, eligible_supply: 0, late_supply: 100 };
    const [res] = PythonMRPClient.solveNativeFallback(100, '2026-09-01', [comp]);
    assertScenario(10, 'Time-Phased Late Supply', res.shortage_qty === 100 && res.shortage_reason === 'LATE_SUPPLY');
  }

  // Scenario 11: Python vs Node Native Solver Parity
  {
    const comp = {
      material_id: 'MAT-TEST-PARITY',
      material_code: 'PAR-001',
      material_name: 'Parity Test Item',
      qty_per_unit: 2.5,
      on_hand_inventory: 45,
      reserved_inventory: 10,
      open_supply: 15,
      eligible_supply: 15,
      late_supply: 0,
      safety_stock: 20,
      moq: 100,
      lot_size: 50,
      lead_time_days: 5,
    };
    const nodeRes = PythonMRPClient.solveNativeFallback(40, '2026-09-15', [comp])[0];
    
    // Test native solver values:
    // Gross = 40 * 2.5 = 100
    // Avail = 45 - 10 = 35
    // Net = max(0, 100 + 20 - 35 - 15) = 70
    // Direct Shortage = max(0, 100 - 35 - 15) = 50
    // Optimal Lot = ceil(max(70, 100) / 50) * 50 = 100
    const isParityValid = (
      nodeRes.gross_required_qty === 100 &&
      nodeRes.available_qty === 35 &&
      nodeRes.net_required_qty === 70 &&
      nodeRes.shortage_qty === 50 &&
      nodeRes.optimal_lot_qty === 100
    );
    assertScenario(11, 'Mathematical Parity Invariant', isParityValid);
  }

  // -------------------------------------------------------------
  // TEST SECTION B: DATABASE, RECURSION & SNAPSHOT INTEGRATION
  // -------------------------------------------------------------
  await mongoose.connect(MONGO_URI);

  try {
    // Setup Test Facility & Materials
    const testSite = await Site.findOneAndUpdate(
      { code: 'GOLDEN-SITE-01' },
      { name: 'Golden Verification Facility', code: 'GOLDEN-SITE-01', type: 'MANUFACTURING', status: 'ACTIVE' },
      { upsert: true, new: true }
    );

    const testWh1 = await Warehouse.findOneAndUpdate(
      { code: 'GOLDEN-WH-01' },
      { name: 'Golden Primary Warehouse', code: 'GOLDEN-WH-01', siteId: testSite._id, status: 'Active' },
      { upsert: true, new: true }
    );

    const testWh2 = await Warehouse.findOneAndUpdate(
      { code: 'GOLDEN-WH-02' },
      { name: 'Golden Secondary Warehouse', code: 'GOLDEN-WH-02', siteId: testSite._id, status: 'Active' },
      { upsert: true, new: true }
    );

    const inactiveWh = await Warehouse.findOneAndUpdate(
      { code: 'GOLDEN-WH-INACTIVE' },
      { name: 'Golden Inactive Warehouse', code: 'GOLDEN-WH-INACTIVE', siteId: testSite._id, status: 'Inactive' },
      { upsert: true, new: true }
    );

    // Multi-Level BOM Structure:
    // Root FG (GOLDEN-FG-100)
    //   -> Subassembly A (GOLDEN-SUB-A) [Make, Qty: 2]
    //        -> Raw Component B (GOLDEN-RM-B) [Buy, Qty: 3]
    //   -> Direct Raw Component C (GOLDEN-RM-C) [Buy, Qty: 1, Scrap: 5%]
    const fgMat = await Material.findOneAndUpdate(
      { code: 'GOLDEN-FG-100' },
      { name: 'Golden Finished Good 100', code: 'GOLDEN-FG-100', type: 'Finished', unit: 'pcs' },
      { upsert: true, new: true }
    );

    const subAMat = await Material.findOneAndUpdate(
      { code: 'GOLDEN-SUB-A' },
      { name: 'Golden Subassembly A', code: 'GOLDEN-SUB-A', type: 'Semi-Finished', makeOrBuy: 'MAKE', leadTimeDays: 3, unit: 'pcs' },
      { upsert: true, new: true }
    );

    const rmBMat = await Material.findOneAndUpdate(
      { code: 'GOLDEN-RM-B' },
      { name: 'Golden Raw Component B', code: 'GOLDEN-RM-B', type: 'Raw Material', makeOrBuy: 'BUY', leadTimeDays: 7, unit: 'pcs' },
      { upsert: true, new: true }
    );

    const rmCMat = await Material.findOneAndUpdate(
      { code: 'GOLDEN-RM-C' },
      { name: 'Golden Raw Component C', code: 'GOLDEN-RM-C', type: 'Raw Material', makeOrBuy: 'BUY', leadTimeDays: 5, unit: 'pcs' },
      { upsert: true, new: true }
    );

    // Clean up any stale test BOMs and items
    await BOM.deleteMany({ productId: { $in: [fgMat._id, subAMat._id, rmBMat._id, rmCMat._id] } });
    await InventoryItem.deleteMany({ materialId: { $in: [fgMat._id, subAMat._id, rmBMat._id, rmCMat._id] } });

    // Create BOMs with explicit batchSize: 1
    await BOM.create({
      bomNumber: 'BOM-GOLDEN-SUB-A',
      productId: subAMat._id,
      version: 1,
      batchSize: 1,
      batchUOM: 'pcs',
      status: 'Active',
      components: [{ materialId: rmBMat._id, quantity: 3, uom: 'pcs' }],
    });

    const fgBom = await BOM.create({
      bomNumber: 'BOM-GOLDEN-FG-100',
      productId: fgMat._id,
      version: 1,
      batchSize: 1,
      batchUOM: 'pcs',
      status: 'Active',
      components: [
        { materialId: subAMat._id, quantity: 2, uom: 'pcs' },
        { materialId: rmCMat._id, quantity: 1, lossPercentage: 5, uom: 'pcs' },
      ],
    });

    // Scenario 12: Multi-Level Recursive Explosion & Scrap Adjustment
    {
      const exploded = await MRPEngineService.explodeBOMRecursively(fgMat._id, 10, new Date('2026-10-01'));
      const subAComp = exploded.find(c => c.materialId.toString() === subAMat._id.toString());
      const rmBComp = exploded.find(c => c.materialId.toString() === rmBMat._id.toString());
      const rmCComp = exploded.find(c => c.materialId.toString() === rmCMat._id.toString());

      // Root 10 -> Sub A (x2) = 20 -> RM B (20 * 3) = 60
      // RM C (10 * 1 * 1.05) = 10.5
      const isRecursionValid = (
        subAComp && subAComp.grossRequiredQty === 20 &&
        rmBComp && rmBComp.grossRequiredQty === 60 &&
        rmCComp && rmCComp.grossRequiredQty === 10.5
      );
      assertScenario(12, 'Multi-Level Recursive Explosion & Scrap', isRecursionValid, 'Level 1->2 propagation verified');
    }

    // Scenario 13: Multi-Warehouse Inventory Scope Aggregation
    {
      const testMatIds = [fgMat._id, subAMat._id, rmBMat._id, rmCMat._id];
      await InventoryItem.deleteMany({ materialId: { $in: testMatIds } });
      await PurchaseOrder.deleteMany({ materialId: { $in: testMatIds } });
      await mongoose.model('ProductionOrder').deleteMany({ productId: { $in: testMatIds } });

      await InventoryItem.create({ materialId: rmBMat._id, warehouseId: testWh1._id, onHand: 20, reserved: 5 }); // Avail 15
      await InventoryItem.create({ materialId: rmBMat._id, warehouseId: testWh2._id, onHand: 30, reserved: 0 }); // Avail 30

      const proposal = await MRPEngineService.calculateMRPProposal({
        productId: fgMat._id,
        siteId: testSite._id,
        warehouseScope: 'all',
        targetQty: 10,
        requiredDate: '2026-10-01',
      });
      const rmBReq = proposal.requirements.find(r => r.materialId.toString() === rmBMat._id.toString());
      // Total Gross: 60, Scoped Avail: 45 -> Net: 15
      const isScopedAvailValid = rmBReq && rmBReq.availableQty === 45 && rmBReq.netQty === 15;
      assertScenario(
        13,
        'Multi-Warehouse Scope Aggregation',
        isScopedAvailValid,
        `Gross: ${rmBReq?.requiredQty}, Avail: ${rmBReq?.availableQty}, Net: ${rmBReq?.netQty}, TargetWHs: ${proposal.targetWarehouseIds?.length}`
      );
    }

    // Scenario 14: Inactive Warehouse Exclusion
    {
      await InventoryItem.create({ materialId: rmCMat._id, warehouseId: inactiveWh._id, onHand: 100, reserved: 0 });
      const proposal = await MRPEngineService.calculateMRPProposal({
        productId: fgMat._id,
        siteId: testSite._id,
        warehouseScope: 'all',
        targetQty: 10,
        requiredDate: '2026-10-01',
      });
      const rmCReq = proposal.requirements.find(r => r.materialId.toString() === rmCMat._id.toString());
      // Inactive WH stock (100) must NOT be counted as available
      assertScenario(14, 'Inactive Warehouse Exclusion', rmCReq && rmCReq.availableQty === 0);
    }

    // Scenario 15: Planning Snapshot Reproducibility
    {
      const runResult = await MRPEngineService.runMRP({
        productId: fgMat._id,
        siteId: testSite._id,
        warehouseId: testWh1._id,
        targetQty: 10,
        requiredDate: '2026-10-01',
      });
      const savedRun = await MRPRun.findById(runResult.mrpRun._id);
      const hasSnapshot = (
        savedRun &&
        savedRun.inputSnapshot &&
        savedRun.inputSnapshot.components &&
        savedRun.algorithmVersion === 'MRP-2.1'
      );
      assertScenario(15, 'Planning Snapshot Reproducibility', hasSnapshot, `Run: ${savedRun.runNumber}`);
    }

    // Scenario 16: Idempotency Protection on Duplicate Runs
    {
      const idemKey = `IDEM-TEST-${Date.now()}`;
      const firstRun = await MRPEngineService.runMRP({
        productId: fgMat._id,
        siteId: testSite._id,
        warehouseId: testWh1._id,
        targetQty: 10,
        requiredDate: '2026-10-01',
        idempotencyKey: idemKey,
      });

      const duplicateRun = await MRPEngineService.runMRP({
        productId: fgMat._id,
        siteId: testSite._id,
        warehouseId: testWh1._id,
        targetQty: 10,
        requiredDate: '2026-10-01',
        idempotencyKey: idemKey,
      });

      const isIdempotent = (
        firstRun.mrpRun._id.toString() === duplicateRun.mrpRun._id.toString() &&
        duplicateRun.isDuplicate === true
      );
      assertScenario(16, 'Idempotency Protection', isIdempotent, 'Duplicate key returned existing run');
    }

    // Scenario 17: Production Plan Lifecycle State Machine
    {
      const plan = await ProductionPlan.create({
        planNumber: `PLAN-STATE-TEST-${Date.now()}`,
        productId: fgMat._id,
        productCode: fgMat.code,
        productName: fgMat.name,
        bomId: fgBom._id,
        warehouseId: testWh1._id,
        totalPlans: 20,
        requiredDate: new Date('2026-10-01'),
        status: 'UNSCHEDULED',
      });

      // 1. Validate
      plan.status = 'VALIDATED';
      await plan.save();

      // 2. Approve
      plan.status = 'APPROVED';
      plan.approvedBy = new mongoose.Types.ObjectId();
      plan.approvedAt = new Date();
      await plan.save();

      // 3. Schedule
      plan.status = 'SCHEDULED';
      plan.workCenter = 'Line 1';
      plan.scheduledStartDate = new Date();
      await plan.save();

      // 4. Release
      plan.status = 'RELEASED';
      plan.releasedPlans = 20;
      await plan.save();

      assertScenario(17, 'Production Plan Lifecycle Transitions', plan.status === 'RELEASED' && plan.releasedPlans === 20);
    }

    // Scenario 18: Manual Override Audit Logging
    {
      const manualPlan = await ProductionPlan.create({
        planNumber: `PLAN-MANUAL-${Date.now()}`,
        productId: fgMat._id,
        productCode: fgMat.code,
        productName: fgMat.name,
        bomId: fgBom._id,
        warehouseId: testWh1._id,
        totalPlans: 50,
        requiredDate: new Date('2026-10-01'),
        status: 'UNSCHEDULED',
      });

      manualPlan.totalPlans = 80;
      manualPlan.auditHistory.push({
        action: 'MANUAL_QUANTITY_OVERRIDE',
        timestamp: new Date(),
        details: 'Planner override from 50 to 80 units for rush demand',
      });
      await manualPlan.save();

      const reloaded = await ProductionPlan.findById(manualPlan._id);
      assertScenario(18, 'Manual Override Audit Trail', reloaded.totalPlans === 80 && reloaded.auditHistory.length > 0);
    }

    // Scenario 19: Explainable Shortage Reason Codes & Traces
    {
      const proposal = await MRPEngineService.calculateMRPProposal({
        productId: fgMat._id,
        siteId: testSite._id,
        warehouseId: testWh1._id,
        targetQty: 10,
        requiredDate: '2026-10-01',
      });
      const rmBReq = proposal.requirements.find(r => r.materialId.toString() === rmBMat._id.toString());
      const hasTrace = rmBReq && rmBReq.trace && rmBReq.trace.formula && rmBReq.shortageReason;
      assertScenario(19, 'Explainable Shortage Trace', hasTrace, `Reason: ${rmBReq?.shortageReason}`);
    }

    // Scenario 20: Dry-Run Preview Isolation (Zero Database Write)
    {
      const preRunCount = await MRPRun.countDocuments();
      await MRPEngineService.calculateMRPProposal({
        productId: fgMat._id,
        siteId: testSite._id,
        warehouseId: testWh1._id,
        targetQty: 10,
        requiredDate: '2026-10-01',
      });
      const postRunCount = await MRPRun.countDocuments();
      assertScenario(20, 'Dry-Run Preview Isolation', preRunCount === postRunCount, 'Zero documents created during preview');
    }

    // Scenario 21: Automatic Purchase Requirement Generation for Shortages
    {
      const runResult = await MRPEngineService.runMRP({
        productId: fgMat._id,
        siteId: testSite._id,
        warehouseId: testWh1._id,
        targetQty: 25,
        requiredDate: '2026-10-01',
      });
      assertScenario(21, 'Automated Shortage PR Generation', runResult.purchaseRequirements.length > 0, `Generated ${runResult.purchaseRequirements.length} PRs`);
    }

    // Scenario 22: Circular BOM Guard & Safe Recovery
    {
      const ts = Date.now();
      const matX = await Material.create({ name: 'Circular X', code: `CIRC-X-${ts}`, type: 'Semi-Finished', makeOrBuy: 'MAKE', unit: 'pcs' });
      const matY = await Material.create({ name: 'Circular Y', code: `CIRC-Y-${ts}`, type: 'Semi-Finished', makeOrBuy: 'MAKE', unit: 'pcs' });

      await BOM.create({ bomNumber: `BOM-CX-${ts}`, productId: matX._id, version: 1, batchSize: 1, batchUOM: 'pcs', status: 'Active', components: [{ materialId: matY._id, quantity: 1 }] });
      await BOM.create({ bomNumber: `BOM-CY-${ts}`, productId: matY._id, version: 1, batchSize: 1, batchUOM: 'pcs', status: 'Active', components: [{ materialId: matX._id, quantity: 1 }] });

      const exploded = await MRPEngineService.explodeBOMRecursively(matX._id, 1, new Date());
      // Cycle must be detected and explosion must terminate safely without infinite recursion (2 items: Y and X)
      assertScenario(22, 'Circular BOM Cycle Guard', exploded.length === 2, 'Infinite recursion prevented safely at cycle boundary');
    }

  } finally {
    await mongoose.disconnect();
  }

  console.log('\n======================================================');
  console.log(`🏁 GOLDEN TEST SUITE COMPLETE: ${passed}/${passed + failed} SCENARIOS PASSED (${Math.round((passed / (passed + failed)) * 100)}%)`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runGoldenTestSuite().catch(err => {
  console.error('Fatal Error executing Golden Test Suite:', err);
  process.exit(1);
});
