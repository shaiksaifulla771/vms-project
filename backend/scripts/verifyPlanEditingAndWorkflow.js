const mongoose = require('mongoose');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const Warehouse = require('../models/Warehouse');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionOrder = require('../models/ProductionOrder');
const InventoryItem = require('../models/InventoryItem');
const { updateProductionPlan, createManualPlan } = require('../controllers/productionPlanController');
require('dotenv').config();

async function runVerification() {
  console.log('======================================================');
  console.log('🧪 TESTING PRODUCTION PLAN CREATION, EDITING & WORKFLOW');
  console.log('======================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/vms_enterprise';
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  try {
    // 1. Setup Test Material & BOM
    const testProduct = await Material.findOneAndUpdate(
      { code: 'TEST-FG-EDIT-001' },
      {
        name: 'Precision Control Unit',
        code: 'TEST-FG-EDIT-001',
        type: 'Finished',
        makeOrBuy: 'MAKE',
        unit: 'pcs',
        cost: 250,
      },
      { upsert: true, new: true }
    );

    const testRawMat = await Material.findOneAndUpdate(
      { code: 'TEST-RAW-RES-001' },
      {
        name: 'Resistor 10k Ohm',
        code: 'TEST-RAW-RES-001',
        type: 'Raw',
        makeOrBuy: 'BUY',
        unit: 'pcs',
        cost: 2.5,
      },
      { upsert: true, new: true }
    );

    const testWarehouse = await Warehouse.findOneAndUpdate(
      { code: 'WH-CENTRAL-MAIN' },
      {
        name: 'Central Main Warehouse',
        code: 'WH-CENTRAL-MAIN',
        type: 'Warehouse',
        status: 'Active',
      },
      { upsert: true, new: true }
    );

    // Create BOM: 4 Resistors per 1 Precision Control Unit
    const testBOM = await BOM.findOneAndUpdate(
      { bomNumber: 'BOM-PCU-V1' },
      {
        bomNumber: 'BOM-PCU-V1',
        name: 'Precision Control Unit Standard Recipe',
        productId: testProduct._id,
        version: 1,
        status: 'Active',
        batchSize: 1,
        components: [
          {
            materialId: testRawMat._id,
            quantity: 4,
            uom: 'pcs',
            lossPercentage: 5,
          }
        ]
      },
      { upsert: true, new: true }
    );

    console.log(`✓ Test Master Data ready (Product: ${testProduct.code}, BOM: ${testBOM.bomNumber})`);

    // 2. Create Initial Plan with 10 units
    let mockReq = {
      body: {
        planName: 'Precision Control Initial Run',
        productId: testProduct._id,
        bomId: testBOM._id,
        totalPlans: 10,
        warehouseId: testWarehouse._id,
        requiredDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        priority: 'MEDIUM',
        workCenter: 'Electronics Line 1',
        shiftId: 'Morning Shift',
        notes: 'Initial production target',
      },
      user: { id: new mongoose.Types.ObjectId() }
    };

    let planResponseData = null;
    let mockRes = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        planResponseData = data;
        return this;
      }
    };

    await createManualPlan(mockReq, mockRes);
    if (!planResponseData || !planResponseData.success) {
      throw new Error(`Plan creation failed: ${JSON.stringify(planResponseData)}`);
    }

    const createdPlan = planResponseData.data;
    console.log(`✓ Initial Plan created: ${createdPlan.planNumber} with totalPlans = ${createdPlan.totalPlans}`);
    console.log(`  Ingredients count: ${createdPlan.ingredients.length}`);
    console.log(`  Total ingredient required qty for 10 units (with 5% scrap): ${createdPlan.ingredients[0].totalQuantity} (Expected: 42)`);
    if (createdPlan.ingredients[0].totalQuantity !== 42) {
      throw new Error(`Expected 42 totalQuantity, got ${createdPlan.ingredients[0].totalQuantity}`);
    }

    // 3. Edit Plan: Planner realized target should be 50 units (not 10), changed shift to Night Shift
    console.log('\n--- Testing Direct Plan Edit (Updating Quantity & Shift) ---');
    mockReq = {
      params: { id: createdPlan._id.toString() },
      body: {
        planName: 'Precision Control Scaled Batch',
        totalPlans: 50,
        quantity: 50,
        bomId: testBOM._id,
        warehouseId: testWarehouse._id,
        requiredDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        priority: 'HIGH',
        workCenter: 'High-Speed SMT Line',
        shiftId: 'Night Shift',
        notes: 'Accelerated order fulfillment - adjusted target quantity to 50',
      },
      user: { id: mockReq.user.id }
    };

    let editResponseData = null;
    mockRes = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        editResponseData = data;
        return this;
      }
    };

    await updateProductionPlan(mockReq, mockRes);
    if (!editResponseData || !editResponseData.success) {
      throw new Error(`Plan edit failed: ${JSON.stringify(editResponseData)}`);
    }

    const updatedPlan = editResponseData.data;
    console.log(`✓ Plan successfully updated: ${updatedPlan.planNumber}`);
    console.log(`  Updated totalPlans: ${updatedPlan.totalPlans} (Expected: 50)`);
    console.log(`  Updated priority: ${updatedPlan.priority} (Expected: HIGH)`);
    console.log(`  Updated shift: ${updatedPlan.schedule?.shiftId || updatedPlan.schedule?.shift} (Expected: Night Shift)`);
    console.log(`  Updated total ingredient required qty for 50 units: ${updatedPlan.ingredients[0].totalQuantity} (Expected: 210)`);

    if (updatedPlan.totalPlans !== 50) {
      throw new Error(`Expected totalPlans 50, got ${updatedPlan.totalPlans}`);
    }
    if (updatedPlan.ingredients[0].totalQuantity !== 210) {
      throw new Error(`Expected 210 totalQuantity, got ${updatedPlan.ingredients[0].totalQuantity}`);
    }

    // 4. Test Invariant: Disallow reducing totalPlans below already released plans
    console.log('\n--- Testing Invariant: Protection Against Invalid Reductions ---');
    // Simulate plan having 20 released plans
    await ProductionPlan.findByIdAndUpdate(updatedPlan._id, { releasedPlans: 20 });

    mockReq.body.totalPlans = 15; // Try to reduce to 15 when 20 are released
    let invalidEditData = null;
    mockRes = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        invalidEditData = data;
        return this;
      }
    };

    await updateProductionPlan(mockReq, mockRes);
    if (mockRes.statusCode === 400 && invalidEditData && !invalidEditData.success) {
      console.log(`✓ Invariant successfully enforced: ${invalidEditData.error}`);
    } else {
      throw new Error('Expected 400 error when reducing quantity below released plans');
    }

    // Clean up test records
    await ProductionPlan.findByIdAndDelete(createdPlan._id);
    await Material.deleteMany({ code: { $in: ['TEST-FG-EDIT-001', 'TEST-RAW-RES-001'] } });
    await BOM.deleteOne({ bomNumber: 'BOM-PCU-V1' });

    console.log('\n======================================================');
    console.log('🎉 ALL PLAN CREATION & EDITING CHECKS PASSED (100%)');
    console.log('======================================================');
  } finally {
    await mongoose.disconnect();
  }
}

runVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
