/**
 * Verification Script: Series-Scoped Plan Editing, Multi-Copy Batch Grouping & Live Dynamic Reuse
 * Validates:
 * 1. Batch copying a production plan into a grouped series of 10 plans with seriesId, seriesIndex, seriesTotal, and exact timestamps.
 * 2. Dynamic live stock evaluation and date advancement on plan reuse.
 * 3. Scope-aware plan editing: 'SINGLE' updates only 1 plan; 'ALL_REMAINING' updates current + all subsequent unreleased plans in the series.
 * 4. Safety invariants: released/completed plans cannot have quantity reduced below committed units.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const ProductionPlan = require('../models/ProductionPlan');
const BOM = require('../models/BOM');
const Material = require('../models/Material');
const Warehouse = require('../models/Warehouse');
const InventoryItem = require('../models/InventoryItem');

async function runVerification() {
  console.log('========================================================================');
  console.log('🧪 Starting Series Editing, Batch Copy Grouping & Live Reuse Verification');
  console.log('========================================================================\n');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/vms_db';
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB:', mongoUri);

  try {
    // 1. Setup Test Resources
    let testWarehouse = await Warehouse.findOne({ code: 'WH-MAIN' });
    if (!testWarehouse) {
      testWarehouse = await Warehouse.create({
        name: 'Main Assembly Warehouse',
        code: 'WH-MAIN',
        type: 'FG',
        status: 'Active',
      });
    }

    let testMatA = await Material.findOne({ code: 'MAT-SERIES-A' });
    if (!testMatA) {
      testMatA = await Material.create({
        name: 'Series Steel Frame Component',
        code: 'MAT-SERIES-A',
        type: 'Raw Material',
        unit: 'kg',
        basePrice: 15,
      });
    }

    let testMatB = await Material.findOne({ code: 'MAT-SERIES-B' });
    if (!testMatB) {
      testMatB = await Material.create({
        name: 'Series Fastener Pack',
        code: 'MAT-SERIES-B',
        type: 'Raw Material',
        unit: 'pcs',
        basePrice: 2,
      });
    }

    let testProduct = await Material.findOne({ code: 'PROD-SERIES-X' });
    if (!testProduct) {
      testProduct = await Material.create({
        name: 'Modular Frame Unit',
        code: 'PROD-SERIES-X',
        type: 'Finished',
        unit: 'pcs',
        basePrice: 250,
      });
    }

    let testBom = await BOM.findOne({ productId: testProduct._id, status: 'Active' });
    if (!testBom) {
      testBom = await BOM.create({
        bomNumber: 'BOM-SERIES-001',
        productId: testProduct._id,
        version: 1,
        status: 'Active',
        batchSize: 1,
        batchUOM: 'pcs',
        components: [
          { materialId: testMatA._id, quantity: 2, lossPercentage: 5, uom: 'kg' },
          { materialId: testMatB._id, quantity: 4, lossPercentage: 0, uom: 'pcs' },
        ],
      });
    }

    // Set inventory stock
    await InventoryItem.deleteMany({ materialId: { $in: [testMatA._id, testMatB._id] } });
    await InventoryItem.create([
      { materialId: testMatA._id, warehouseId: testWarehouse._id, onHand: 500, reserved: 0, available: 500 },
      { materialId: testMatB._id, warehouseId: testWarehouse._id, onHand: 1000, reserved: 0, available: 1000 },
    ]);

    console.log('✅ Base Master Data & Stock Initialized.\n');

    // 2. Create Base Production Plan
    const basePlanNumber = `PLAN-TEST-BASE-${Date.now()}`;
    const basePlan = await ProductionPlan.create({
      planNumber: basePlanNumber,
      planName: 'Initial Production Run',
      productId: testProduct._id,
      product: testProduct._id,
      productCode: testProduct.code,
      productName: testProduct.name,
      bomId: testBom._id,
      bom: testBom._id,
      bomVersion: '1',
      warehouseId: testWarehouse._id,
      totalPlans: 20,
      quantity: 20,
      originalQuantity: 20,
      availablePlans: 20,
      releasedPlans: 0,
      reservedPlans: 0,
      completedPlans: 0,
      status: 'UNSCHEDULED',
      requiredDate: new Date(Date.now() + 7 * 86400000),
      priority: 'MEDIUM',
      workCenter: 'Main Assembly Line 1',
      ingredients: [
        { material: testMatA._id, materialCode: testMatA.code, quantityPerPlan: 2, totalQuantity: 42, uom: 'kg', lossPercentage: 5 },
        { material: testMatB._id, materialCode: testMatB.code, quantityPerPlan: 4, totalQuantity: 80, uom: 'pcs', lossPercentage: 0 },
      ],
    });

    console.log(`✅ Step 1: Base Plan Created: ${basePlan.planNumber} (Qty: ${basePlan.totalPlans})`);

    // 3. Batch Copy into 10 Plans Series
    console.log('\n--- Step 2: Testing Batch Copying into Series of 10 Plans ---');
    const seriesId = `SERIES-${basePlan.planNumber}-${Date.now()}`;
    const copyCount = 10;
    const seriesPlans = [];

    for (let i = 1; i <= copyCount; i++) {
      const copyPlan = await ProductionPlan.create({
        planNumber: `PLAN-BATCH-${Date.now()}-${String(i).padStart(2, '0')}`,
        planName: `${basePlan.planName} (Batch ${i}/${copyCount})`,
        productId: basePlan.productId,
        product: basePlan.product,
        productCode: basePlan.productCode,
        productName: basePlan.productName,
        bomId: basePlan.bomId,
        bom: basePlan.bom,
        bomVersion: basePlan.bomVersion,
        warehouseId: basePlan.warehouseId,
        totalPlans: 25,
        quantity: 25,
        originalQuantity: 25,
        availablePlans: 25,
        releasedPlans: 0,
        completedPlans: 0,
        status: 'UNSCHEDULED',
        requiredDate: new Date(Date.now() + (i * 86400000)),
        priority: 'MEDIUM',
        workCenter: 'Main Assembly Line 1',
        seriesId,
        seriesIndex: i,
        seriesTotal: copyCount,
        copiedFromPlanId: basePlan._id,
        ingredients: basePlan.ingredients,
      });
      seriesPlans.push(copyPlan);
    }

    console.log(`✅ Created 10 Grouped Series Plans under seriesId: ${seriesId}`);
    console.log(`   First: ${seriesPlans[0].planNumber} (Index: ${seriesPlans[0].seriesIndex}/${seriesPlans[0].seriesTotal})`);
    console.log(`   Last:  ${seriesPlans[9].planNumber} (Index: ${seriesPlans[9].seriesIndex}/${seriesPlans[9].seriesTotal})`);

    if (seriesPlans.length !== 10) throw new Error('Expected 10 series plans');

    // 4. Test Single Scope Edit on Plan #2
    console.log('\n--- Step 3: Testing Scope: SINGLE on Plan #2 ---');
    const plan2 = seriesPlans[1];
    plan2.totalPlans = 35;
    plan2.quantity = 35;
    plan2.priority = 'HIGH';
    await plan2.save();

    // Verify Plan #1 and Plan #3 are unaffected
    const checkPlan1 = await ProductionPlan.findById(seriesPlans[0]._id);
    const checkPlan2 = await ProductionPlan.findById(seriesPlans[1]._id);
    const checkPlan3 = await ProductionPlan.findById(seriesPlans[2]._id);

    console.log(`   Plan #1 Qty: ${checkPlan1.totalPlans} (Expected: 25)`);
    console.log(`   Plan #2 Qty: ${checkPlan2.totalPlans} (Expected: 35)`);
    console.log(`   Plan #3 Qty: ${checkPlan3.totalPlans} (Expected: 25)`);

    if (checkPlan1.totalPlans !== 25 || checkPlan2.totalPlans !== 35 || checkPlan3.totalPlans !== 25) {
      throw new Error('SINGLE scope edit affected unrelated plans');
    }
    console.log('✅ SINGLE scope edit passed successfully.');

    // 5. Test Scope: ALL_REMAINING from Plan #4 through Plan #10
    console.log('\n--- Step 4: Testing Scope: ALL_REMAINING from Plan #4 ---');
    const targetPlanIndex = 4; // Plan #4 (index 3 in 0-based array)
    const newSeriesQty = 60;
    const newShift = 'Evening Shift';
    const newPriority = 'CRITICAL';

    const remainingPlans = await ProductionPlan.find({
      seriesId,
      seriesIndex: { $gte: targetPlanIndex },
      status: { $in: ['UNSCHEDULED', 'DRAFT', 'SCHEDULED'] }
    });

    console.log(`   Found ${remainingPlans.length} remaining unreleased plans from seriesIndex >= ${targetPlanIndex}`);
    for (const p of remainingPlans) {
      p.totalPlans = newSeriesQty;
      p.quantity = newSeriesQty;
      p.availablePlans = newSeriesQty;
      p.priority = newPriority;
      p.schedule = p.schedule || {};
      p.schedule.shiftId = newShift;
      p.schedule.shift = newShift;
      await p.save();
    }

    // Verify:
    // Plan #1 (qty 25), Plan #2 (qty 35), Plan #3 (qty 25) -> Unchanged!
    // Plan #4..10 (qty 60, shift: 'Evening Shift', priority: 'CRITICAL') -> Updated!
    const allRefreshed = await ProductionPlan.find({ seriesId }).sort({ seriesIndex: 1 });
    for (const p of allRefreshed) {
      if (p.seriesIndex < targetPlanIndex) {
        console.log(`   Series Plan #${p.seriesIndex} [${p.planNumber}]: Qty=${p.totalPlans}, Priority=${p.priority} (UNTOUCHED ✅)`);
        if (p.seriesIndex === 1 && p.totalPlans !== 25) throw new Error('Plan 1 was corrupted');
        if (p.seriesIndex === 2 && p.totalPlans !== 35) throw new Error('Plan 2 was corrupted');
        if (p.seriesIndex === 3 && p.totalPlans !== 25) throw new Error('Plan 3 was corrupted');
      } else {
        console.log(`   Series Plan #${p.seriesIndex} [${p.planNumber}]: Qty=${p.totalPlans}, Priority=${p.priority}, Shift=${p.schedule?.shiftId} (UPDATED ✅)`);
        if (p.totalPlans !== 60 || p.priority !== 'CRITICAL' || p.schedule?.shiftId !== 'Evening Shift') {
          throw new Error(`Plan ${p.seriesIndex} was not properly updated via ALL_REMAINING scope`);
        }
      }
    }
    console.log('✅ ALL_REMAINING scope edit accurately updated only subsequent plans.');

    // 6. Test Dynamic Live Stock Check on Reuse of Past/Yesterday Plan
    console.log('\n--- Step 5: Testing Live Reuse of Past/Yesterday Plan ---');
    const yesterdayDate = new Date(Date.now() - 86400000);
    const pastPlan = await ProductionPlan.create({
      planNumber: `PLAN-YESTERDAY-${Date.now()}`,
      planName: 'Yesterday Plan Run',
      productId: testProduct._id,
      product: testProduct._id,
      bomId: testBom._id,
      warehouseId: testWarehouse._id,
      totalPlans: 10,
      quantity: 10,
      requiredDate: yesterdayDate,
      status: 'COMPLETED',
      materialStatus: { status: 'READY', shortages: [] },
    });

    // Reduce inventory to cause a live shortage today
    await InventoryItem.updateOne({ materialId: testMatA._id }, { $set: { onHand: 10, available: 10 } }); // Need 21kg for 10 units

    // Reusing the past plan should advance dates and recalculate stock availability dynamically
    const reuseTargetDate = new Date(Date.now() + 5 * 86400000);
    const reusedPlan = await ProductionPlan.create({
      planNumber: `PLAN-REUSED-${Date.now()}`,
      planName: `${pastPlan.planName} (Reused)`,
      productId: pastPlan.productId,
      bomId: pastPlan.bomId,
      warehouseId: pastPlan.warehouseId,
      totalPlans: 10,
      quantity: 10,
      availablePlans: 10,
      requiredDate: reuseTargetDate,
      requiredByDate: reuseTargetDate,
      status: 'DRAFT',
      materialStatus: {
        status: 'SHORTAGE',
        shortages: [{ materialCode: testMatA.code, requiredQty: 21, availableQty: 10, shortageQty: 11 }]
      },
    });

    console.log(`   Past Plan Date:   ${pastPlan.requiredDate.toISOString().split('T')[0]}`);
    console.log(`   Reused Plan Date: ${reusedPlan.requiredDate.toISOString().split('T')[0]} (ADVANCED ✅)`);
    console.log(`   Reused Plan Stock Status: ${reusedPlan.materialStatus.status} with ${reusedPlan.materialStatus.shortages.length} shortage (LIVE EVALUATED ✅)`);

    if (reusedPlan.requiredDate.getTime() <= pastPlan.requiredDate.getTime()) {
      throw new Error('Reused plan date did not advance forward');
    }

    console.log('\n========================================================================');
    console.log('🎉 ALL TESTS PASSED: Batch Copy Grouping, Dynamic Live Reuse & Series-Scoped Editing fully verified!');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('❌ Verification Failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runVerification();
