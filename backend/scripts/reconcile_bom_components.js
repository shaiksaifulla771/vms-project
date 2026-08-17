const mongoose = require('mongoose');
require('dotenv').config();

async function reconcileBOMComponents() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vms');
  const BOM = require('../models/BOM');
  const MPN = require('../models/MPN');
  const Material = require('../models/Material');

  console.log('Reconciling BOM components materialId in database...');
  const boms = await BOM.find({});
  let reconciledCount = 0;

  for (const bom of boms) {
    let modified = false;
    for (const comp of bom.components) {
      if (!comp.materialId && comp.mpnId) {
        const mpnDoc = await MPN.findById(comp.mpnId).select('materialId');
        if (mpnDoc && mpnDoc.materialId) {
          comp.materialId = mpnDoc.materialId;
          modified = true;
        }
      }
      if (!comp.quantity && comp.qty) {
        comp.quantity = comp.qty;
        modified = true;
      }
      if (!comp.lossPercentage && comp.lossPercent) {
        comp.lossPercentage = comp.lossPercent;
        modified = true;
      }
    }

    if (modified) {
      await BOM.updateOne({ _id: bom._id }, { $set: { components: bom.components } });
      reconciledCount++;
      console.log(`✓ Reconciled BOM: ${bom.bomNumber} (${bom._id})`);
    }
  }

  console.log(`\nDone. Successfully reconciled ${reconciledCount} BOM(s).`);
  await mongoose.disconnect();
}

reconcileBOMComponents().catch(console.error);
