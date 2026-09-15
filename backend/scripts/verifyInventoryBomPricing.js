const mongoose = require('mongoose');
const InventoryItem = require('../models/InventoryItem');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const Warehouse = require('../models/Warehouse');
const inventoryController = require('../controllers/inventoryController');

async function testInventoryBomPricing() {
  console.log('=== VERIFYING INVENTORY UNIT PRICE & TOTAL VALUE RESOLUTION (FROM BOM & MASTERS) ===\n');

  await mongoose.connect('mongodb://localhost:27017/vms_db');
  console.log('✓ Connected to MongoDB');

  // 1. Create / Ensure a Test Component Raw Material
  let rawMat = await Material.findOne({ code: 'RAW-FLOUR-01' });
  if (!rawMat) {
    rawMat = await Material.create({
      name: 'Organic Wheat Flour',
      code: 'RAW-FLOUR-01',
      category: 'Raw Material',
      unit: 'kg',
      type: 'Raw Material',
      basePrice: 50,
      standardCost: 50
    });
  } else {
    rawMat.basePrice = 50;
    await rawMat.save();
  }

  // 2. Create / Ensure a Finished Good Product
  let fgProd = await Material.findOne({ code: 'FG-BREAD-01' });
  if (!fgProd) {
    fgProd = await Material.create({
      name: 'Artisan Sourdough Bread 500g',
      code: 'FG-BREAD-01',
      category: 'Finished Goods',
      unit: 'pcs',
      type: 'Finished',
      basePrice: 0 // Intentionally 0 in material master so price MUST come from BOM!
    });
  }

  // 3. Create / Ensure an Active BOM for the Finished Good
  // Recipe: 2 kg Flour @ ₹50/kg = ₹100. Packaging: ₹10, Processing: ₹10, Overhead: ₹5 => Total: ₹125 for batchSize = 1 => Unit Cost = ₹125
  let testBom = await BOM.findOne({ productId: fgProd._id });
  if (!testBom) {
    testBom = await BOM.create({
      productId: fgProd._id,
      bomNumber: 'BOM-BREAD-01',
      batchSize: 1,
      batchUOM: 'pcs',
      components: [
        { materialId: rawMat._id, quantity: 2, uom: 'kg', lossPercentage: 0 }
      ],
      packagingCost: 10,
      processingCost: 10,
      overheadCost: 5,
      status: 'Active'
    });
  } else {
    testBom.components = [{ materialId: rawMat._id, quantity: 2, uom: 'kg', lossPercentage: 0 }];
    testBom.packagingCost = 10;
    testBom.processingCost = 10;
    testBom.overheadCost = 5;
    testBom.batchSize = 1;
    testBom.status = 'Active';
    await testBom.save();
  }

  // 4. Create / Ensure Warehouse & Inventory Items
  let wh = await Warehouse.findOne({ code: 'WH-HYD-01' });
  if (!wh) {
    wh = await Warehouse.findOne();
  }

  // FG Inventory record with 20 on hand
  let fgInventory = await InventoryItem.findOne({ materialId: fgProd._id, warehouseId: wh._id });
  if (!fgInventory) {
    fgInventory = await InventoryItem.create({
      materialId: fgProd._id,
      warehouseId: wh._id,
      onHand: 20,
      balance: 20,
      reserved: 0
    });
  } else {
    fgInventory.onHand = 20;
    fgInventory.balance = 20;
    await fgInventory.save();
  }

  // Raw Material Inventory record with 100 on hand
  let rawInventory = await InventoryItem.findOne({ materialId: rawMat._id, warehouseId: wh._id });
  if (!rawInventory) {
    rawInventory = await InventoryItem.create({
      materialId: rawMat._id,
      warehouseId: wh._id,
      onHand: 100,
      balance: 100,
      reserved: 0
    });
  } else {
    rawInventory.onHand = 100;
    rawInventory.balance = 100;
    await rawInventory.save();
  }

  // 5. Invoke getInventoryBalances controller
  const mockReq = { query: {} };
  let responseData = null;
  const mockRes = {
    status: (code) => ({
      json: (data) => {
        responseData = data;
        return data;
      }
    })
  };

  await inventoryController.getInventoryBalances(mockReq, mockRes, (err) => {
    if (err) console.error('Controller error:', err);
  });

  if (!responseData || !responseData.success) {
    console.error('Failed to get inventory response');
    process.exit(1);
  }

  const fgItem = responseData.data.find(d => d.materialId?.code === 'FG-BREAD-01');
  const rawItem = responseData.data.find(d => d.materialId?.code === 'RAW-FLOUR-01');

  console.log('\n--- 1. FINISHED GOOD WITH BOM RESOLUTION ---');
  console.log(`Product: ${fgItem?.materialId?.name} (${fgItem?.materialId?.code})`);
  console.log(`BOM Number: ${fgItem?.bomNumber}`);
  console.log(`Unit Cost from BOM: ₹${fgItem?.unitPrice} (Expected: ₹125)`);
  console.log(`On-Hand Qty: ${fgItem?.onHand || fgItem?.balance}`);
  console.log(`Total Inventory Value: ₹${fgItem?.totalValue} (Expected: ₹2500)`);
  console.log(`Price Source: ${fgItem?.priceSource}`);

  console.log('\n--- 2. RAW MATERIAL MASTER PRICE RESOLUTION ---');
  console.log(`Material: ${rawItem?.materialId?.name} (${rawItem?.materialId?.code})`);
  console.log(`Unit Price from Master: ₹${rawItem?.unitPrice} (Expected: ₹50)`);
  console.log(`On-Hand Qty: ${rawItem?.onHand || rawItem?.balance}`);
  console.log(`Total Inventory Value: ₹${rawItem?.totalValue} (Expected: ₹5000)`);
  console.log(`Price Source: ${rawItem?.priceSource}`);

  console.log('\n--- 3. SYSTEM-WIDE VALUATION AGGREGATION ---');
  console.log(`Total System SKUs: ${responseData.summary.totalSKUs}`);
  console.log(`Total Stock Valuation: ₹${responseData.summary.totalStockValuation}`);

  // Assertions
  if (fgItem && fgItem.unitPrice === 125 && fgItem.totalValue === 2500 && fgItem.hasBom) {
    console.log('\n✓ [PASS] Finished Good BOM Unit Cost and Total Value resolved accurately from BOM recipe!');
  } else {
    console.error('\n✗ [FAIL] Finished Good BOM Unit Cost did not match expected ₹125.');
    process.exit(1);
  }

  if (rawItem && rawItem.unitPrice === 50 && rawItem.totalValue === 5000) {
    console.log('✓ [PASS] Raw Material Unit Price and Total Value resolved from Material Master!');
  } else {
    console.error('\n✗ [FAIL] Raw Material unit price did not match expected ₹50.');
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('ALL INVENTORY BOM PRICING VERIFICATIONS PASSED (100%)');
  console.log('======================================================');
  process.exit(0);
}

testInventoryBomPricing().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
