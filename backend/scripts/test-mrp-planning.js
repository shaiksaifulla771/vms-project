const mongoose = require('mongoose');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const InventoryItem = require('../models/InventoryItem');

mongoose.connect('mongodb://127.0.0.1:27017/vms').then(async () => {
  try {
    console.log('Starting MRP feasibility diagnostic test...');
    
    // Get all finished goods
    const fgs = await Material.find({ type: 'Finished' });
    console.log(`Found ${fgs.length} Finished Goods in Database.`);
    
    if (fgs.length === 0) {
      console.log('No finished goods found to plan. Database requires seeding.');
      return;
    }

    const fg = fgs[0];
    console.log(`Targeting product: ${fg.name} (${fg.code})`);

    const bom = await BOM.findOne({ productId: fg._id }).populate('components.materialId');
    if (!bom) {
      console.log(`No BOM recipe configuration exists for ${fg.name}. Please configure one.`);
      return;
    }
    
    console.log(`Loaded BOM Recipe containing ${bom.components.length} components.`);

    let canProduce = true;
    const targetQuantity = 50; // Plan production run of 50 pieces

    for (let comp of bom.components) {
      const rawMaterial = comp.materialId;
      if (!rawMaterial) {
        console.warn('WARNING: Component references a null material.');
        continue;
      }
      const required = comp.quantity * targetQuantity;
      const stock = await InventoryItem.findOne({ materialId: rawMaterial._id });
      const available = stock ? stock.balance : 0;
      const shortfall = Math.max(0, required - available);
      
      if (shortfall > 0) {
        canProduce = false;
      }
      console.log(` - Material [${rawMaterial.code}] ${rawMaterial.name}: Required: ${required} ${rawMaterial.unit}, Stock: ${available} ${rawMaterial.unit}, Shortfall: ${shortfall}`);
    }

    console.log(`MRP Calculation Feasibility: ${canProduce ? 'SUCCESS (Production Feasible)' : 'FAILED (Insufficient Components)'}`);
  } catch (err) {
    console.error('Diagnostic error:', err);
  } finally {
    mongoose.connection.close();
  }
});
