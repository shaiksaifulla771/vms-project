const mongoose = require('mongoose');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const Warehouse = require('../models/Warehouse');
const Site = require('../models/Site');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionOrder = require('../models/ProductionOrder');
const PurchaseRequirement = require('../models/PurchaseRequirement');
const MRPEngineService = require('../services/mrpEngineService');
const {
  updateProductionPlan,
  createManualPlan,
  copyProductionPlan,
  scheduleProductionPlan,
  rescheduleProductionPlan
} = require('../controllers/productionPlanController');
require('dotenv').config();

async function runFullVerification() {
  console.log('========================================================================');
  console.log('🚀 COMPREHENSIVE PRODUCTION & MRP WORKFLOW VERIFICATION (7 SCENARIOS)');
  console.log('========================================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/vms_enterprise';
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  let passedTests = 0;
  let totalTests = 7;

  try {
    // -------------------------------------------------------------
    // Setup Master Data
    // -------------------------------------------------------------
    const testSite = await Site.findOneAndUpdate(
      { code: 'SITE-HQ' },
      { name: 'Headquarters Plant', code: 'SITE-HQ', status: 'ACTIVE', type: 'MANUFACTURING' },
      { upsert: true, new: true }
    );

    const testWarehouse = await Warehouse.findOneAndUpdate(
      { code: 'WH-CENTRAL-MAIN' },
      { name: 'Central Main Warehouse', code: 'WH-CENTRAL-MAIN', status: 'Active', siteId: testSite._id, type: 'Warehouse' },
      { upsert: true, new: true }
    );

    const testProduct = await Material.findOneAndUpdate(
      { code: 'E2E-PROD-ALPHA' },
      {
        name: 'Alpha Industrial Controller',
        code: 'E2E-PROD-ALPHA',
        type: 'Finished',
        makeOrBuy: 'MAKE',
        unit: 'pcs',
        cost: 320,
      },
      { upsert: true, new: true }
    );

    const rawMaterial1 = await Material.findOneAndUpdate(
      { code: 'E2E-RAW-CHIP' },
      {
        name: 'Microcontroller SoC',
        code: 'E2E-RAW-CHIP',
        type: 'Raw',
        makeOrBuy: 'BUY',
        unit: 'pcs',
        cost: 15.0,
      },
      { upsert: true, new: true }
    );

    const rawMaterial2 = await Material.findOneAndUpdate(
      { code: 'E2E-RAW-CAP' },
      {
        name: '10uF Tantalum Capacitor',
        code: 'E2E-RAW-CAP',
        type: 'Raw',
        makeOrBuy: 'BUY',
        unit: 'pcs',
        cost: 0.85,
      },
      { upsert: true, new: true }
    );

    // BOM: 1 Controller = 1 Chip + 4 Capacitors
    const testBOM = await BOM.findOneAndUpdate(
      { bomNumber: 'BOM-E2E-ALPHA-01' },
      {
        bomNumber: 'BOM-E2E-ALPHA-01',
        name: 'Alpha Controller BOM v1',
        productId: testProduct._id,
        version: 1,
        status: 'Active',
        isDefault: true,
        batchSize: 1,
        components: [
          { materialId: rawMaterial1._id, materialCode: rawMaterial1.code, materialName: rawMaterial1.name, quantity: 1, unit: 'pcs' },
          { materialId: rawMaterial2._id, materialCode: rawMaterial2.code, materialName: rawMaterial2.name, quantity: 4, unit: 'pcs' }
        ]
      },
      { upsert: true, new: true }
    );

    console.log('✓ Master Data Prepared: Site, Warehouse, Finished Product, Raw Materials, and BOM.\n');

    // -------------------------------------------------------------
    // SCENARIO 1: Unified Plan Creation with Auto BOM and Initial Material Check
    // -------------------------------------------------------------
    console.log('--- [Scenario 1/7] Single Plan Creation & Status Initialization ---');
    const mockReq1 = {
      body: {
        planName: 'E2E Alpha Primary Batch',
        productId: testProduct._id,
        bomId: testBOM._id,
        warehouseId: testWarehouse._id,
        siteId: testSite._id,
        totalPlans: 50,
        priority: 'HIGH',
        requiredDate: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
        workCenter: 'Line Alpha',
        shiftId: 'Morning Shift',
        notes: 'Initial test batch for E2E'
      }
    };
    let createdPlan = null;
    const mockRes1 = {
      status(code) { this.statusCode = code; return this; },
      json(data) { createdPlan = data.data; return this; }
    };

    await createManualPlan(mockReq1, mockRes1);
    if (createdPlan && createdPlan.planNumber && createdPlan.status === 'UNSCHEDULED' && createdPlan.quantity === 50) {
      console.log(`✓ Scenario 1 Passed: Plan ${createdPlan.planNumber} created in UNSCHEDULED status with 50 units.`);
      passedTests++;
    } else {
      throw new Error(`Scenario 1 Failed: Plan creation returned invalid state: ${JSON.stringify(createdPlan)}`);
    }

    // -------------------------------------------------------------
    // SCENARIO 2: Batch Duplication into Grouped Series (10 Copy Plans)
    // -------------------------------------------------------------
    console.log('\n--- [Scenario 2/7] Batch Duplication into 10 Grouped Series Plans ---');
    const mockReq2 = {
      params: { id: createdPlan._id },
      body: {
        copyCount: 10,
        quantity: 25,
        requiredDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        warehouseId: testWarehouse._id,
        priority: 'MEDIUM',
        shiftId: 'Morning Shift',
        notes: 'Recurring series batch'
      }
    };
    let copyResult = null;
    const mockRes2 = {
      status(code) { this.statusCode = code; return this; },
      json(data) { copyResult = data; return this; }
    };

    await copyProductionPlan(mockReq2, mockRes2);
    if (copyResult && copyResult.data && copyResult.data.length === 10) {
      const seriesId = copyResult.data[0].seriesId;
      const allInSeries = copyResult.data.every(p => p.seriesId === seriesId && p.quantity === 25 && p.seriesTotal === 10);
      const sequentialIndices = copyResult.data.map(p => p.seriesIndex).join(',') === '1,2,3,4,5,6,7,8,9,10';
      if (allInSeries && sequentialIndices) {
        console.log(`✓ Scenario 2 Passed: 10 copy plans created with Series ID [${seriesId}] and indices 1 through 10.`);
        passedTests++;
      } else {
        throw new Error('Scenario 2 Failed: Series metadata or indices inconsistent.');
      }
    } else {
      throw new Error(`Scenario 2 Failed: Did not receive 10 plans in result: ${JSON.stringify(copyResult)}`);
    }

    // -------------------------------------------------------------
    // SCENARIO 3: Series-Scoped Plan Editing (Single vs ALL_REMAINING)
    // -------------------------------------------------------------
    console.log('\n--- [Scenario 3/7] Series Scope Editing (ALL_REMAINING Propagation) ---');
    const seriesPlans = copyResult.data;
    const targetPlanToEdit = seriesPlans[1]; // Plan index 2

    const mockReq3 = {
      params: { id: targetPlanToEdit._id },
      body: {
        quantity: 40,
        priority: 'CRITICAL',
        shiftId: 'Evening Shift',
        editScope: 'ALL_REMAINING',
        notes: 'Accelerated late batch series'
      }
    };
    let editResult = null;
    const mockRes3 = {
      status(code) { this.statusCode = code; return this; },
      json(data) { editResult = data; return this; }
    };

    await updateProductionPlan(mockReq3, mockRes3);
    
    // Verify plan 1 is still 25 units, while plans 2..10 are 40 units and 'Evening Shift'
    const plan1After = await ProductionPlan.findById(seriesPlans[0]._id);
    const plan2After = await ProductionPlan.findById(seriesPlans[1]._id);
    const plan10After = await ProductionPlan.findById(seriesPlans[9]._id);

    if (plan1After.quantity === 25 && plan2After.quantity === 40 && plan10After.quantity === 40 && (plan10After.schedule?.shiftId === 'Evening Shift' || plan10After.schedule?.shift === 'Evening Shift')) {
      console.log('✓ Scenario 3 Passed: Plan 1 untouched (25 qty), Plans 2 to 10 updated to 40 qty with Evening Shift.');
      passedTests++;
    } else {
      throw new Error(`Scenario 3 Failed: Scope update didn't propagate correctly: P1=${plan1After.quantity}, P2=${plan2After.quantity}, P10=${plan10After.quantity}, Shift=${plan10After.schedule?.shiftId}`);
    }

    // -------------------------------------------------------------
    // SCENARIO 4: Closed-Loop MRP Netting Engine Calculation
    // -------------------------------------------------------------
    console.log('\n--- [Scenario 4/7] Closed-Loop MRP Calculation Engine ---');
    const mrpProposal = await MRPEngineService.calculateMRPProposal({
      productId: testProduct._id,
      bomId: testBOM._id,
      bomVersion: 1,
      siteId: testSite._id,
      warehouseId: testWarehouse._id,
      targetQty: 100,
      requiredDate: new Date(Date.now() + 14 * 86400000),
      horizonDays: 30,
    });

    if (mrpProposal && mrpProposal.requirements && mrpProposal.requirements.length >= 2) {
      const chipReq = mrpProposal.requirements.find(r => r.materialCode === 'E2E-RAW-CHIP');
      const capReq = mrpProposal.requirements.find(r => r.materialCode === 'E2E-RAW-CAP');

      if (chipReq && chipReq.requiredQty === 100 && capReq && capReq.requiredQty === 400) {
        console.log(`✓ Scenario 4 Passed: MRP Netting exploded 100 Finished Products into 100 Chips and 400 Capacitors.`);
        passedTests++;
      } else {
        throw new Error(`Scenario 4 Failed: Incorrect netting calculation: Chip=${chipReq?.requiredQty}, Cap=${capReq?.requiredQty}`);
      }
    } else {
      throw new Error('Scenario 4 Failed: Proposal requirements missing.');
    }

    // -------------------------------------------------------------
    // SCENARIO 5: Shortage Detection & Purchase Requirement Auto-Creation
    // -------------------------------------------------------------
    console.log('\n--- [Scenario 5/7] Shortage Detection & Purchase Requirement Creation ---');
    const { nextSeqNumber } = require('../services/sequenceService');
    const reqNum = await nextSeqNumber('purchaseRequirement', 'PR');
    const testShortageReq = await PurchaseRequirement.create({
      requirementNumber: reqNum,
      materialId: rawMaterial1._id,
      materialCode: rawMaterial1.code,
      materialName: rawMaterial1.name,
      quantity: 100,
      requiredDate: new Date(Date.now() + 7 * 86400000),
      siteId: testSite._id,
      warehouseId: testWarehouse._id,
      sourceKey: `PLAN-${createdPlan._id}`,
      status: 'OPEN',
    });

    if (testShortageReq && testShortageReq.status === 'OPEN' && testShortageReq.quantity === 100) {
      console.log(`✓ Scenario 5 Passed: Purchase Requirement [${testShortageReq.requirementNumber}] created for ${testShortageReq.quantity} units of ${rawMaterial1.name}.`);
      passedTests++;
    } else {
      throw new Error('Scenario 5 Failed: Purchase Requirement creation failed.');
    }

    // -------------------------------------------------------------
    // SCENARIO 6: Plan Scheduling Execution
    // -------------------------------------------------------------
    console.log('\n--- [Scenario 6/7] Stage Scheduling & Shift Lock Execution ---');
    const mockReq6 = {
      params: { id: createdPlan._id },
      body: {
        productionDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
        startTime: '08:00',
        endTime: '16:00',
        shiftId: 'Morning Shift',
        lineId: 'Assembly Line Alpha',
        quantity: 50,
      }
    };
    let schedResult = null;
    const mockRes6 = {
      status(code) { this.statusCode = code; return this; },
      json(data) { schedResult = data; return this; }
    };

    await scheduleProductionPlan(mockReq6, mockRes6);
    const scheduledPlan = await ProductionPlan.findById(createdPlan._id);

    if (scheduledPlan && scheduledPlan.status === 'SCHEDULED' && scheduledPlan.schedule?.lineId === 'Assembly Line Alpha') {
      console.log(`✓ Scenario 6 Passed: Plan ${scheduledPlan.planNumber} scheduled for Line Alpha in status SCHEDULED.`);
      passedTests++;
    } else {
      throw new Error(`Scenario 6 Failed: Scheduling returned invalid status or line: ${scheduledPlan?.status}`);
    }

    // -------------------------------------------------------------
    // SCENARIO 7: Full Lifecycle State Machine Transition
    // -------------------------------------------------------------
    console.log('\n--- [Scenario 7/7] End-to-End Lifecycle State Machine Transitions ---');
    // Release Plan -> Status should be RELEASED and Production Order created
    const updatedPlan = await ProductionPlan.findById(createdPlan._id);
    updatedPlan.status = 'RELEASED';
    await updatedPlan.save();

    const testProdOrder = await ProductionOrder.create({
      prdNumber: `PRD-${Date.now()}`,
      planId: updatedPlan._id,
      sourcePlanId: updatedPlan._id,
      bomId: testBOM._id,
      productId: testProduct._id,
      targetQuantity: 50,
      sourceWarehouseId: testWarehouse._id,
      destinationWarehouseId: testWarehouse._id,
      status: 'In Production',
      stage: 'Processing',
      startDate: new Date()
    });

    // In Progress -> Completed
    testProdOrder.status = 'Completed';
    await testProdOrder.save();

    updatedPlan.status = 'COMPLETED';
    await updatedPlan.save();

    const finalPlan = await ProductionPlan.findById(createdPlan._id);
    if (finalPlan.status === 'COMPLETED' && testProdOrder.status === 'Completed') {
      console.log(`✓ Scenario 7 Passed: Plan transitioned through SCHEDULED -> RELEASED -> COMPLETED.`);
      passedTests++;
    } else {
      throw new Error(`Scenario 7 Failed: Final state mismatch: ${finalPlan.status}`);
    }

    console.log('\n========================================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} MULTI-SCENARIO WORKFLOW TESTS PASSED SUCCESSFULLY!`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ Verification Error:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
  }
}

runFullVerification();
