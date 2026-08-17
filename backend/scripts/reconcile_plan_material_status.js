const mongoose = require('mongoose');
require('dotenv').config();

const ProductionPlan = require('../models/ProductionPlan');
const BOM = require('../models/BOM');
const MRPEngineService = require('../services/mrpEngineService');
require('../models/Warehouse');
require('../models/Site');
require('../models/Material');
require('../models/InventoryItem');

async function reconcilePlans() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vms');
  console.log('Reconciling ProductionPlan materialStatus in database...');

  const plans = await ProductionPlan.find();
  console.log(`Found ${plans.length} total production plans.`);

  let updatedCount = 0;
  for (const plan of plans) {
    if (plan.bomId) {
      const matCheck = await MRPEngineService.checkMaterialAvailability(
        plan.bomId,
        plan.quantity || plan.totalPlans || 1,
        plan.warehouseId,
        plan.siteId
      );

      plan.materialStatus = matCheck;
      await plan.save();
      updatedCount++;
      console.log(`  -> Plan ${plan.planNumber}: Status is now [${matCheck.status}] (Shortages: ${matCheck.shortages.length})`);
    } else {
      plan.materialStatus = {
        status: 'Not Evaluated',
        shortages: [],
        components: [],
        checkedAt: new Date()
      };
      await plan.save();
    }
  }

  console.log(`Successfully reconciled ${updatedCount} production plans with live material status.`);
  await mongoose.disconnect();
}

reconcilePlans().catch(console.error);
