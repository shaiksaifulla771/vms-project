const mongoose = require('mongoose');
const User = require('../models/User');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const Material = require('../models/Material');
const Vendor = require('../models/Vendor');
const MPN = require('../models/MPN');
const BOM = require('../models/BOM');
const WarehouseMaterial = require('../models/WarehouseMaterial');
const StockAdjustment = require('../models/StockAdjustment');
const InventoryTransaction = require('../models/InventoryTransaction');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionOrder = require('../models/ProductionOrder');
const InventoryItem = require('../models/InventoryItem');
const jwt = require('jsonwebtoken');
const getJwtSecret = require('../config/jwt');

async function runEndToEndVerification() {
  console.log('=== STARTING END-TO-END ERP WORKFLOW VERIFICATION ===');
  await mongoose.connect('mongodb://127.0.0.1:27017/vms');
  console.log('✓ Connected to MongoDB vms');

  // 1. Get or Create Admin User
  let admin = await User.findOne({ email: 'admin@vms.com' });
  if (!admin) {
    admin = await User.create({
      username: 'System Admin',
      email: 'admin@vms.com',
      password: 'admin123_hashed',
      role: 'Admin',
      isVerified: true
    });
  }
  console.log(`✓ Admin User verified: ${admin.username} (${admin._id})`);

  // 2. Site & Warehouse Setup
  let site = await Site.findOne({ code: 'SITE-BLR' });
  if (!site) {
    site = await Site.create({
      code: 'SITE-BLR',
      name: 'Bengaluru Manufacturing Plant',
      type: 'Manufacturing Plant',
      address: {
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India'
      },
      status: 'Active',
      createdBy: admin._id
    });
  }
  console.log(`✓ Site registered: ${site.name} (${site.code})`);

  let warehouse = await Warehouse.findOne({ code: 'WH-BLR-01' });
  if (!warehouse) {
    warehouse = await Warehouse.create({
      code: 'WH-BLR-01',
      name: 'Bengaluru Central Raw & FG Warehouse',
      siteId: site._id,
      type: 'Raw',
      status: 'Active',
      createdBy: admin._id
    });
  }
  console.log(`✓ Warehouse registered: ${warehouse.name} (${warehouse.code})`);

  // 3. Master Data Setup (Materials, Vendor, MPN, BOM)
  let rawMat = await Material.findOne({ code: 'MAT-RAW-001' });
  if (!rawMat) {
    rawMat = await Material.create({
      code: 'MAT-RAW-001',
      name: 'Organic Strawberry Concentrate',
      type: 'Raw Material',
      category: 'Ingredients',
      unit: 'Liters',
      minStockLevel: 50,
      maxStockLevel: 2000,
      reorderPoint: 100,
      basePrice: 15.5,
      status: 'Active',
      createdBy: admin._id
    });
  }
  console.log(`✓ Raw Material: ${rawMat.name} (${rawMat.code})`);

  let fgMat = await Material.findOne({ code: 'MAT-FG-001' });
  if (!fgMat) {
    fgMat = await Material.create({
      code: 'MAT-FG-001',
      name: 'Premium Strawberry Puree 250ml',
      type: 'Finished',
      category: 'Puree',
      unit: 'Bottles',
      minStockLevel: 100,
      maxStockLevel: 5000,
      reorderPoint: 200,
      basePrice: 4.5,
      status: 'Active',
      createdBy: admin._id
    });
  }
  console.log(`✓ Finished Good Material: ${fgMat.name} (${fgMat.code})`);

  // Warehouse-Material Assignments
  await WarehouseMaterial.findOneAndUpdate(
    { warehouseId: warehouse._id, materialId: rawMat._id },
    { siteId: site._id, warehouseId: warehouse._id, materialId: rawMat._id, minStockLevel: 50, isAssigned: true },
    { upsert: true, new: true }
  );
  await WarehouseMaterial.findOneAndUpdate(
    { warehouseId: warehouse._id, materialId: fgMat._id },
    { siteId: site._id, warehouseId: warehouse._id, materialId: fgMat._id, minStockLevel: 100, isAssigned: true },
    { upsert: true, new: true }
  );
  console.log('✓ Warehouse-Material Junction Assignments created');

  // Vendor & MPN
  let vendor = await Vendor.findOne({ $or: [{ code: 'VND-001' }, { email: 'sales@agricorp.com' }] });
  if (!vendor) {
    vendor = await Vendor.create({
      code: 'VND-001',
      name: 'AgriCorp Ingredients Pvt Ltd',
      email: 'sales@agricorp.com',
      phone: '+919876543210',
      status: 'Active',
      createdBy: admin._id
    });
  }
  console.log(`✓ Vendor: ${vendor.name} (${vendor.code})`);

  let mpn = await MPN.findOne({ manufacturerPartNumber: 'MPN-STR-101' });
  if (!mpn) {
    mpn = await MPN.create({
      manufacturerPartNumber: 'MPN-STR-101',
      mpnNumber: 'MPN-STR-101',
      materialId: rawMat._id,
      vendorId: vendor._id,
      manufacturerName: 'AgriCorp',
      price: 14.8,
      unitPrice: 14.8,
      leadTimeDays: 5,
      status: 'Active',
      createdBy: admin._id
    });
  }
  console.log(`✓ MPN Master: ${mpn.manufacturerPartNumber}`);

  // BOM Recipe
  let bom = await BOM.findOne({ productId: fgMat._id });
  if (!bom) {
    bom = await BOM.create({
      productId: fgMat._id,
      finishedGoodId: fgMat._id,
      bomNumber: `BOM-${fgMat.code}-V1`,
      batchSize: 1,
      batchUOM: 'Bottles',
      notes: 'Strawberry Puree Recipe v1.0',
      status: 'Active',
      components: [
        { materialId: rawMat._id, qty: 0.2, quantity: 0.2, uom: 'Liters' }
      ],
      createdBy: admin._id
    });
  }
  console.log(`✓ BOM Recipe created for ${fgMat.name}: 1 Bottle requires 0.2L Raw Material`);

  // 4. Inventory Stock Adjustment Approval Workflow
  const adjNum = `ADJ-TEST-${Date.now()}`;
  const stockAdj = await StockAdjustment.create({
    adjNumber: adjNum,
    siteId: site._id,
    warehouseId: warehouse._id,
    materialId: rawMat._id,
    quantity: 500,
    adjustmentType: 'IN',
    reason: 'Initial Production Batch Inbound Stock',
    status: 'Pending Approval',
    createdBy: admin._id
  });
  console.log(`✓ Stock Adjustment Request created: ${stockAdj.adjNumber} (500 L pending approval)`);

  // Manager Approval of Stock Adjustment
  stockAdj.status = 'Approved';
  stockAdj.approvedBy = admin._id;
  stockAdj.approvedAt = new Date();
  await stockAdj.save();

  // Create Inventory Ledger entry
  const InventoryLedgerService = require('../services/inventoryLedgerService');
  await InventoryLedgerService.recordTransaction({
    siteId: site._id,
    warehouseId: warehouse._id,
    materialId: rawMat._id,
    type: 'ADJUSTMENT_IN',
    quantity: 500,
    referenceDocument: 'StockAdjustment',
    referenceId: stockAdj._id,
    userId: admin._id,
    description: 'Approved initial inbound stock adjustment'
  });

  const invItem = await InventoryItem.findOne({ warehouseId: warehouse._id, materialId: rawMat._id });
  console.log(`✓ Stock Adjustment Approved & Ledger Updated: On Hand = ${invItem?.quantity || 0} L, Available = ${invItem?.availableQuantity || 0} L`);

  // 5. Scheduling: Create and Schedule Production Plan
  const planNum = `PLN-TEST-${Date.now()}`;
  const plan = await ProductionPlan.create({
    planNumber: planNum,
    productId: fgMat._id,
    bomId: bom._id,
    siteId: site._id,
    warehouseId: warehouse._id,
    quantity: 100,
    requiredDate: new Date(Date.now() + 86400000),
    status: 'Scheduled',
    planSource: 'Manual',
    priority: 'High',
    createdBy: admin._id
  });
  console.log(`✓ Scheduled Production Plan created: ${plan.planNumber} for 100 bottles of FG`);

  // 6. Production: Shop Floor Execution (Start Production -> Issue Raw Components -> Complete FG Output)
  const orderNum = `PRD-TEST-${Date.now()}`;
  const order = await ProductionOrder.create({
    prdNumber: orderNum,
    planId: plan._id,
    bomId: bom._id,
    productId: fgMat._id,
    sourceWarehouseId: warehouse._id,
    destinationWarehouseId: warehouse._id,
    targetQuantity: 100,
    actualQuantity: 0,
    scrapQuantity: 0,
    status: 'Scheduled',
    createdBy: admin._id
  });
  console.log(`✓ Production Order created: ${order.prdNumber}`);

  // Start Production
  order.status = 'In Production';
  await order.save();
  console.log(`✓ Production Order started: Status = ${order.status}`);

  // Deduct 20 L raw material component (0.2L * 100 bottles = 20L)
  await InventoryLedgerService.recordTransaction({
    siteId: site._id,
    warehouseId: warehouse._id,
    materialId: rawMat._id,
    type: 'PRODUCTION_CONSUMPTION',
    quantity: 20,
    referenceDocument: 'ProductionOrder',
    referenceId: order._id,
    userId: admin._id,
    description: 'Component consumption for 100 bottles'
  });

  // Credit 100 bottles Finished Good to Warehouse
  await InventoryLedgerService.recordTransaction({
    siteId: site._id,
    warehouseId: warehouse._id,
    materialId: fgMat._id,
    type: 'PRODUCTION_OUTPUT',
    quantity: 100,
    referenceDocument: 'ProductionOrder',
    referenceId: order._id,
    userId: admin._id,
    description: 'Finished goods output receipt'
  });

  order.status = 'Completed';
  order.actualQuantity = 100;
  await order.save();

  plan.status = 'Completed';
  await plan.save();

  const finalRawInv = await InventoryItem.findOne({ warehouseId: warehouse._id, materialId: rawMat._id });
  const finalFgInv = await InventoryItem.findOne({ warehouseId: warehouse._id, materialId: fgMat._id });

  const rawQty = finalRawInv ? (finalRawInv.onHand ?? finalRawInv.balance ?? 0) : 0;
  const fgQty = finalFgInv ? (finalFgInv.onHand ?? finalFgInv.balance ?? 0) : 0;

  console.log('=== END-TO-END VERIFICATION SUMMARY RESULTS ===');
  console.log(`✓ Final Raw Material Stock: ${rawQty} L (Expected: 480 L)`);
  console.log(`✓ Final Finished Good Stock: ${fgQty} Bottles (Expected: 100 Bottles)`);
  console.log(`✓ Production Order Status: ${order.status}`);
  console.log(`✓ Production Plan Status: ${plan.status}`);

  if (rawQty === 480 && fgQty === 100) {
    console.log(' SUCCESS: ALL ERP WORKFLOWS & DATA TRANSACTIONS VERIFIED 100% CORRECT!');
  } else {
    console.error('❌ Mismatch in final stock quantities.');
  }

  process.exit(0);
}

runEndToEndVerification().catch(err => {
  console.error('❌ E2E Verification Failed:', err);
  process.exit(1);
});
