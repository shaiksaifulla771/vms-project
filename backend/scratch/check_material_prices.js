const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const BOM = require('../models/BOM');

async function checkPrices() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vms');
  console.log('Connected to MongoDB');

  const materials = await Material.find().lean();
  console.log(`Total Materials: ${materials.length}`);
  materials.forEach(m => {
    console.log(`[${m.code}] ${m.name} | Type: ${m.type} | basePrice: ₹${m.basePrice}`);
  });

  const boms = await BOM.find().populate('components.materialId').populate('productId').lean();
  console.log(`\nTotal BOMs: ${boms.length}`);
  boms.forEach(b => {
    console.log(`BOM for [${b.productId?.code}] ${b.productId?.name} | BatchQty: ${b.batchQuantity} | Total Cost: ₹${b.totalCost}`);
  });

  const invItems = await InventoryItem.find().populate('materialId').lean();
  console.log(`\nTotal Inventory Items: ${invItems.length}`);
  invItems.slice(0, 10).forEach(i => {
    console.log(`Item ${i.materialId?.code} ${i.materialId?.name} | onHand: ${i.onHand} | unitPrice: ₹${i.materialId?.basePrice}`);
  });

  await mongoose.disconnect();
}

checkPrices().catch(console.error);
