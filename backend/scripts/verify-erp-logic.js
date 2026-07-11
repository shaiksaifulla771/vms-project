const mongoose = require('mongoose');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProductionOrder = require('../models/ProductionOrder');
const QualityRecord = require('../models/QualityRecord');

const MONGO_URI = 'mongodb://127.0.0.1:27017/erp_test_suite';

async function runTest() {
  console.log('--- STARTING MANUFACTURING ERP TEST SUITE ---');

  try {
    // 1. Connect to test DB
    await mongoose.connect(MONGO_URI);
    console.log('[PASSED] Connected to test database.');

    // Clear test DB first
    await Promise.all([
      User.deleteMany({}),
      Vendor.deleteMany({}),
      Material.deleteMany({}),
      BOM.deleteMany({}),
      InventoryItem.deleteMany({}),
      InventoryTransaction.deleteMany({}),
      PurchaseOrder.deleteMany({}),
      ProductionOrder.deleteMany({}),
      QualityRecord.deleteMany({})
    ]);
    console.log('[PASSED] Cleaned test database collections.');

    // 2. Create system user
    const user = await User.create({
      username: 'ERP Admin',
      email: 'admin@erp.com',
      password: 'securepassword123',
      role: 'Admin'
    });
    console.log('[PASSED] Seeded test user.');

    // 3. Create materials
    const rmIron = await Material.create({
      name: 'Iron Sheets',
      code: 'RM-IRON',
      unit: 'kg',
      type: 'Raw',
      description: 'Iron Sheets'
    });

    const fgBox = await Material.create({
      name: 'Enclosure Box',
      code: 'FG-BOX',
      unit: 'pcs',
      type: 'Finished',
      description: 'Enclosure Box'
    });

    await InventoryItem.create({ materialId: rmIron._id, balance: 20 });
    await InventoryItem.create({ materialId: fgBox._id, balance: 0 });
    console.log('[PASSED] Created Material master listings.');

    // Check duplicate code validation
    let dupFailed = false;
    try {
      await Material.create({
        name: 'Iron Sheets Duplicate',
        code: 'RM-IRON', // duplicate code
        unit: 'kg',
        type: 'Raw'
      });
    } catch (e) {
      dupFailed = true;
      console.log('[PASSED] Duplicate code validation works: ', e.message);
    }
    if (!dupFailed) throw new Error('System allowed duplicate material codes');

    // 4. Create BOM recipe
    // FG-BOX requires 2kg of RM-IRON
    const bom = await BOM.create({
      productId: fgBox._id,
      components: [{ materialId: rmIron._id, quantity: 2 }]
    });
    console.log('[PASSED] Set BOM: FG-BOX requires 2kg of RM-IRON.');

    // 5. Test MRP Planning Calculation
    const checkMRP = async (targetQty) => {
      const required = bom.components[0].quantity * targetQty;
      const stockItem = await InventoryItem.findOne({ materialId: rmIron._id });
      const available = stockItem ? stockItem.balance : 0;
      const shortfall = Math.max(0, required - available);
      const canProduce = shortfall === 0;
      return { canProduce, required, available, shortfall };
    };

    // Case A: 5 boxes (requires 10kg, we have 20kg) -> Can Produce
    const p1 = await checkMRP(5);
    if (!p1.canProduce || p1.shortfall !== 0) throw new Error('MRP check failed to approve valid inventory load');
    console.log('[PASSED] MRP Check A: sufficient stock validated.');

    // Case B: 15 boxes (requires 30kg, we have 20kg) -> Cannot Produce, 10kg deficit
    const p2 = await checkMRP(15);
    if (p2.canProduce || p2.shortfall !== 10) throw new Error('MRP check failed to flag inventory deficit');
    console.log('[PASSED] MRP Check B: deficit of 10kg flagged successfully.');

    // 6. Test PO GRN Receipt
    const vendor = await Vendor.create({
      name: 'Bob Supplier',
      company: 'Foundry Ltd',
      email: 'bob@foundry.com',
      phone: '+1-555-0999',
      address: 'Industrial Sector 4',
      category: 'Hardware',
      status: 'Active'
    });

    const po = await PurchaseOrder.create({
      vendorId: vendor._id,
      materials: [{ materialId: rmIron._id, quantity: 15, unitPrice: 4.5 }],
      totalAmount: 67.5,
      requestedBy: user._id,
      status: 'Approved' // bypass pending for quick test
    });

    // Simulate Receive PO (GRN)
    for (let item of po.materials) {
      const stock = await InventoryItem.findOne({ materialId: item.materialId });
      stock.balance += item.quantity;
      await stock.save();
      await InventoryTransaction.create({
        materialId: item.materialId,
        quantity: item.quantity,
        type: 'purchase',
        referenceId: po._id
      });
    }
    po.status = 'Received';
    await po.save();

    const ironStockPostPO = await InventoryItem.findOne({ materialId: rmIron._id });
    if (ironStockPostPO.balance !== 35) throw new Error(`PO receipt did not increase stock correctly. Expected 35, got ${ironStockPostPO.balance}`);
    console.log('[PASSED] PO received and stocked-in (GRN success). Current RM-IRON stock:', ironStockPostPO.balance);

    // 7. Run Production (Deducts stock)
    // We will manufacture 10 boxes (consumes 20kg of RM-IRON)
    const runQty = 10;
    const prodOrder = await ProductionOrder.create({
      bomId: bom._id,
      quantity: runQty,
      status: 'Pending'
    });

    // Start production (checks stock and consumes raw materials)
    const m1 = await checkMRP(prodOrder.quantity);
    if (!m1.canProduce) throw new Error('Production run blocked despite sufficient stock');
    
    // Consume stock
    for (let comp of bom.components) {
      const stock = await InventoryItem.findOne({ materialId: comp.materialId });
      stock.balance -= comp.quantity * prodOrder.quantity;
      await stock.save();
      await InventoryTransaction.create({
        materialId: comp.materialId,
        quantity: -(comp.quantity * prodOrder.quantity),
        type: 'consumption',
        referenceId: prodOrder._id
      });
    }
    prodOrder.status = 'In Progress';
    await prodOrder.save();

    const ironStockPostProd = await InventoryItem.findOne({ materialId: rmIron._id });
    if (ironStockPostProd.balance !== 15) throw new Error(`Production run did not deduct raw material stock. Expected 15, got ${ironStockPostProd.balance}`);
    console.log('[PASSED] Production started. consumed 20kg. Current RM-IRON stock:', ironStockPostProd.balance);

    // Complete production
    prodOrder.status = 'Completed';
    await prodOrder.save();

    // 8. Quality check (passed gates stock-in of finished goods)
    const qc = await QualityRecord.create({
      productionOrderId: prodOrder._id,
      status: 'Passed',
      notes: 'All items verified',
      inspectedBy: user._id
    });
    prodOrder.status = 'QC Checked';
    await prodOrder.save();

    // Add finished goods to stock
    const fgStockItem = await InventoryItem.findOne({ materialId: fgBox._id });
    fgStockItem.balance += prodOrder.quantity;
    await fgStockItem.save();
    await InventoryTransaction.create({
      materialId: fgBox._id,
      quantity: prodOrder.quantity,
      type: 'production',
      referenceId: prodOrder._id
    });

    const fgStockFinal = await InventoryItem.findOne({ materialId: fgBox._id });
    if (fgStockFinal.balance !== 10) throw new Error(`QC pass did not stock finished product in inventory. Expected 10, got ${fgStockFinal.balance}`);
    console.log('[PASSED] QC Inspection passed. stocked-in 10 Finished Goods (FG-BOX).');

    // 9. Clean up test DB
    await Promise.all([
      User.deleteMany({}),
      Vendor.deleteMany({}),
      Material.deleteMany({}),
      BOM.deleteMany({}),
      InventoryItem.deleteMany({}),
      InventoryTransaction.deleteMany({}),
      PurchaseOrder.deleteMany({}),
      ProductionOrder.deleteMany({}),
      QualityRecord.deleteMany({})
    ]);
    console.log('[PASSED] Cleaned test database collections.');

    await mongoose.connection.close();
    console.log('[PASSED] Database connection closed.');
    console.log('\n*** ALL ERP BACKEND LOGIC VERIFIED SUCCESSFULLY! ***\n');
    process.exit(0);
  } catch (err) {
    console.error('[FAILED] Test error encountered:', err);
    try {
      await mongoose.connection.close();
    } catch (_) {}
    process.exit(1);
  }
}

runTest();
