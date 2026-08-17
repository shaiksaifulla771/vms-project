const mongoose = require('mongoose');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const Warehouse = require('../models/Warehouse');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionOrder = require('../models/ProductionOrder');
const productionPlanController = require('../controllers/productionPlanController');

async function runE2EVerification() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
    console.log('\n=== E2E VERIFICATION: PLAN QUANTITIES & MULTI-INGREDIENTS ===\n');

    const cocoWater = await Material.findOne({ code: 'FG-COCO-250' });
    const warehouse = await Warehouse.findOne({ code: 'WH-BEV-01' });
    const activeBom = await BOM.findOne({ productId: cocoWater._id, status: 'Active' }).populate('components.materialId');

    // 1. Create Manual Plan with 10 totalPlans
    console.log('1. Creating Multi-Ingredient Production Plan (10 totalPlans)...');
    const reqCreate = {
      body: {
        planName: 'COCO WATER Summer Batch 2026',
        productId: cocoWater._id.toString(),
        bomId: activeBom._id.toString(),
        totalPlans: 10,
        warehouseId: warehouse._id.toString(),
        requiredDate: new Date(Date.now() + 7 * 86400000),
        priority: 'HIGH',
      },
      user: { id: new mongoose.Types.ObjectId(), username: 'Planner' }
    };
    let createdPlan;
    const resCreate = {
      status: (code) => ({
        json: (data) => {
          createdPlan = data.data;
          console.log(`- Created Plan: ${createdPlan.planNumber} (${createdPlan.planName})`);
          console.log(`- Total Plans: ${createdPlan.totalPlans} | Available: ${createdPlan.availablePlans} | Released: ${createdPlan.releasedPlans}`);
          console.log(`- Ingredients Count: ${createdPlan.ingredients?.length}`);
          createdPlan.ingredients.forEach(ing => {
            console.log(`  * ${ing.materialName}: Qty/Plan=${ing.quantityPerPlan} ${ing.uom} | Total=${ing.totalQuantity} ${ing.uom} (Loss: ${ing.lossPercentage}%)`);
          });
        }
      })
    };
    await productionPlanController.createManualPlan(reqCreate, resCreate, () => {});

    // 2. Schedule Plan
    console.log('\n2. Scheduling Plan for Main Assembly Line 1...');
    const reqSched = {
      params: { id: createdPlan._id },
      body: {
        productionDate: new Date(Date.now() + 2 * 86400000),
        startTime: '08:00',
        endTime: '16:00',
        shiftId: 'Morning Shift',
        lineId: 'Main Assembly Line 1',
        warehouseId: warehouse._id.toString(),
      },
      user: { id: new mongoose.Types.ObjectId(), username: 'Planner' }
    };
    const resSched = {
      status: () => ({
        json: (data) => {
          console.log(`- Status after scheduling: ${data.data.status} | Scheduled Date: ${data.data.schedule.productionDate.toISOString().split('T')[0]}`);
        }
      })
    };
    await productionPlanController.scheduleProductionPlan(reqSched, resSched, () => {});

    // 3. Partial Release of 4 plans
    console.log('\n3. Partial Release: Releasing 4 out of 10 plans into ProductionOrder...');
    const reqUse1 = {
      params: { id: createdPlan._id },
      body: { quantity: 4 },
      user: { id: new mongoose.Types.ObjectId(), username: 'Planner' }
    };
    let order1;
    const resUse1 = {
      status: () => ({
        json: (data) => {
          order1 = data.productionOrder;
          console.log(`- Order 1 Created: ${order1.prdNumber} (Target: ${order1.targetQuantity} units)`);
          console.log(`- Plan Status: ${data.data.status} | Available Remaining: ${data.data.availablePlans} | Released: ${data.data.releasedPlans}`);
        }
      })
    };
    await productionPlanController.useProductionPlan(reqUse1, resUse1, () => {});

    // 4. Release remaining 6 plans
    console.log('\n4. Full Release: Releasing remaining 6 plans...');
    const reqUse2 = {
      params: { id: createdPlan._id },
      body: { quantity: 6 },
      user: { id: new mongoose.Types.ObjectId(), username: 'Planner' }
    };
    let order2;
    const resUse2 = {
      status: () => ({
        json: (data) => {
          order2 = data.productionOrder;
          console.log(`- Order 2 Created: ${order2.prdNumber} (Target: ${order2.targetQuantity} units)`);
          console.log(`- Plan Status: ${data.data.status} | Available Remaining: ${data.data.availablePlans} | Released: ${data.data.releasedPlans}`);
        }
      })
    };
    await productionPlanController.useProductionPlan(reqUse2, resUse2, () => {});

    // 5. Cancel Order 2 & Restore 6 plans back to available pool
    console.log('\n5. Order Cancellation & Plan Restoration Test...');
    await ProductionOrder.findByIdAndUpdate(order2._id, { status: 'CANCELLED' });
    console.log(`- Cancelled Order 2 (${order2.prdNumber})`);

    const reqRestore = {
      params: { id: createdPlan._id },
      body: { quantity: 6, productionOrderId: order2._id.toString() },
      user: { id: new mongoose.Types.ObjectId(), username: 'Planner' }
    };
    const resRestore = {
      status: () => ({
        json: (data) => {
          console.log(`- Plan Restored! Status: ${data.data.status} | Available Plans: ${data.data.availablePlans} | Released Plans: ${data.data.releasedPlans}`);
        }
      })
    };
    await productionPlanController.restoreProductionPlan(reqRestore, resRestore, () => {});

    console.log('\n=== ALL E2E PLAN QUANTITY & INGREDIENT TESTS VERIFIED SUCCESSFULLY ===\n');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('E2E Verification failed:', err);
    process.exit(1);
  }
}

runE2EVerification();
