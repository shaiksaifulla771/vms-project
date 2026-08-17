const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Material = require('../models/Material');
const BOM = require('../models/BOM');
const InventoryItem = require('../models/InventoryItem');

async function seedAndCalculatePrices() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vms');
  console.log('Connected to MongoDB');

  // Default market base prices in INR (₹) for materials with 0 price
  const samplePrices = {
    'M1096': 85.00, // Apple Puree ₹85/unit
    'M1095': 45.00, // Glucose Powder ₹45/kg
    'M1094': 120.00, // Turmeric Powder ₹120/kg
    'M1093': 450.00, // Almonds Powder ₹450/kg
    'RM-ALPHONSO-MANGO-P': 110.00,
    'RM-STRAWBERRY': 140.00,
    'RM-CHICKOO': 60.00,
    'RM-ROASTED-PUMPKIN': 40.00,
    'RM-PONNI-RICE': 55.00,
    'RM-SPLIT-TOOR-DAL': 130.00,
    'RM-ROLLED-OATS': 90.00,
    'RM-CASHEW-NUTS': 650.00,
    'RM-SEEDLESS-RED-DAT': 220.00,
    'RM-COCO-01': 35.00,
    'RM-SUGAR-01': 42.00,
    'PM-PACK-250': 4.50,
    'RM-PACKAGING-ROLL': 8.00,
    'RM-BIB-BOXES-RL2': 12.00,
    'RM-SCOOPS': 2.50,
    'RM-DATES-POWDER-SPR': 280.00,
    'RM-BANANA-POWDER-SP': 260.00,
    'RM-YOGURT-FREEZE-DR': 500.00,
    'RM-TAPIOCA-STARCH': 65.00,
    'RM-PRINTED-POUCHES-': 3.50,
    'RM-PUNNET': 5.00,
    'FG-COCO-250': 65.00,
  };

  const materials = await Material.find();
  for (const mat of materials) {
    let price = mat.basePrice || 0;
    if (price === 0) {
      if (samplePrices[mat.code]) {
        price = samplePrices[mat.code];
      } else if (mat.type === 'Raw Material') {
        price = 75.00; // default ₹75/kg
      } else if (mat.type === 'Packaged Material') {
        price = 6.00; // default ₹6/unit
      } else if (mat.type === 'Finished') {
        price = 120.00; // default ₹120/unit
      }
      mat.basePrice = price;
      await mat.save();
      console.log(`Updated [${mat.code}] ${mat.name} basePrice -> ₹${price}`);
    }
  }

  // Calculate BOM costs for Finished goods with BOMs
  const boms = await BOM.find().populate('components.materialId');
  for (const bom of boms) {
    let totalCost = 0;
    for (const comp of bom.components) {
      const compPrice = comp.materialId?.basePrice || 50;
      totalCost += (comp.quantity || 0) * compPrice;
    }
    const batchQty = bom.batchQuantity || 1;
    const unitCost = totalCost / batchQty;
    bom.totalCost = totalCost;
    bom.unitCost = unitCost;
    await bom.save();

    if (bom.productId) {
      await Material.findByIdAndUpdate(bom.productId, {
        $set: { basePrice: Math.round(unitCost * 1.35) } // Standard retail/finished price with margin
      });
      console.log(`Updated BOM for Product ${bom.productId} -> Total: ₹${totalCost}, Unit Cost: ₹${unitCost}`);
    }
  }

  console.log('Price initialization complete.');
  await mongoose.disconnect();
}

seedAndCalculatePrices().catch(console.error);
