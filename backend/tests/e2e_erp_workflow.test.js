const mongoose = require('mongoose');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const ProductionPlan = require('../models/ProductionPlan');
const QualityRecord = require('../models/QualityRecord');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const MRPEngineService = require('../services/mrpEngineService');

describe('Phase 14 — End-to-End Manufacturing ERP Connected Workflow', () => {
  let site;
  let warehouse;
  let matRice;
  let matGhee;
  let matPkg;
  let matFinishedGood;
  let bom;

  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms_test_e2e';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.db) {
      await mongoose.connection.db.dropDatabase();
    }
    await mongoose.disconnect();
  });

  test('Step 1: Setup Site, Warehouse, Materials, and BOM', async () => {
    site = await Site.create({
      code: 'BLR-001',
      name: 'Bengaluru Manufacturing Plant',
      type: 'Manufacturing Plant',
      address: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
    });
    expect(site.code).toBe('BLR-001');

    warehouse = await Warehouse.create({
      code: 'WH-RAW-001',
      name: 'Main Sourcing Warehouse',
      siteId: site._id,
      type: 'Raw',
    });
    expect(warehouse.code).toBe('WH-RAW-001');

    matRice = await Material.create({ name: 'Basmati Rice', code: 'RM-RICE-01', unit: 'kg', type: 'Raw Material' });
    matGhee = await Material.create({ name: 'Pure Cow Ghee', code: 'RM-GHEE-01', unit: 'kg', type: 'Raw Material' });
    matPkg = await Material.create({ name: 'Food Spout Pouch', code: 'RM-PKG-01', unit: 'pcs', type: 'Raw Material' });
    matFinishedGood = await Material.create({ name: 'Rice Ghee Meal Pouch 250g', code: 'FG-MEAL-01', unit: 'pcs', type: 'Finished' });

    bom = await BOM.create({
      productId: matFinishedGood._id,
      version: 1,
      batchSize: 1,
      batchUOM: 'pcs',
      components: [
        { materialId: matRice._id, qty: 2, quantity: 2, uom: 'kg', lossPercentage: 0 },
        { materialId: matGhee._id, qty: 0.5, quantity: 0.5, uom: 'kg', lossPercentage: 0 },
        { materialId: matPkg._id, qty: 1, quantity: 1, uom: 'pcs', lossPercentage: 0 },
      ],
    });
    expect(bom.components.length).toBe(3);
  });

  test('Step 2: Post Opening Stock Balances via Inventory Ledger', async () => {
    await InventoryLedgerService.recordTransaction({
      materialId: matRice._id,
      warehouseId: warehouse._id,
      siteId: site._id,
      quantity: 150,
      type: 'Opening',
      reason: 'Opening stock seeding',
    });

    await InventoryLedgerService.recordTransaction({
      materialId: matGhee._id,
      warehouseId: warehouse._id,
      siteId: site._id,
      quantity: 20,
      type: 'Opening',
      reason: 'Opening stock seeding',
    });

    await InventoryLedgerService.recordTransaction({
      materialId: matPkg._id,
      warehouseId: warehouse._id,
      siteId: site._id,
      quantity: 80,
      type: 'Opening',
      reason: 'Opening stock seeding',
    });

    const invRice = await InventoryItem.findOne({ materialId: matRice._id, warehouseId: warehouse._id });
    expect(invRice.onHand).toBe(150);
    expect(invRice.available).toBe(150);

    const invGhee = await InventoryItem.findOne({ materialId: matGhee._id, warehouseId: warehouse._id });
    expect(invGhee.onHand).toBe(20);

    const invPkg = await InventoryItem.findOne({ materialId: matPkg._id, warehouseId: warehouse._id });
    expect(invPkg.onHand).toBe(80);
  });

  test('Step 3: Run Deterministic MRP for 100 Finished Units & Assert Shortages', async () => {
    const mrpResult = await MRPEngineService.runMRP({
      productId: matFinishedGood._id,
      bomId: bom._id,
      siteId: site._id,
      warehouseId: warehouse._id,
      targetQty: 100,
      requiredDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });

    expect(mrpResult.success).toBe(true);
    expect(mrpResult.summary.hasShortage).toBe(true);

    const reqRice = mrpResult.requirements.find(r => r.materialCode === 'RM-RICE-01');
    expect(reqRice.requiredQty).toBe(200); // 100 * 2kg
    expect(reqRice.availableQty).toBe(150);
    expect(reqRice.shortageQty).toBe(50);

    const reqGhee = mrpResult.requirements.find(r => r.materialCode === 'RM-GHEE-01');
    expect(reqGhee.requiredQty).toBe(50); // 100 * 0.5kg
    expect(reqGhee.availableQty).toBe(20);
    expect(reqGhee.shortageQty).toBe(30);

    const reqPkg = mrpResult.requirements.find(r => r.materialCode === 'RM-PKG-01');
    expect(reqPkg.requiredQty).toBe(100);
    expect(reqPkg.availableQty).toBe(80);
    expect(reqPkg.shortageQty).toBe(20);
  });

  test('Step 4: Create Production Plan (10 Units), Reserve Materials & Produce 3 Units', async () => {
    const plan = await ProductionPlan.create({
      planNumber: 'PLAN-TEST-001',
      productId: matFinishedGood._id,
      bomId: bom._id,
      warehouseId: warehouse._id,
      quantity: 10,
      requiredDate: new Date(Date.now() + 3 * 24 * 3600 * 1000),
      status: 'Unscheduled',
    });
    expect(plan.status).toBe('Unscheduled');

    // Soft Reserve Materials for 10 units
    for (const comp of bom.components) {
      await InventoryLedgerService.recordTransaction({
        materialId: comp.materialId,
        warehouseId: warehouse._id,
        quantity: comp.quantity * plan.quantity,
        type: 'Reservation',
        referenceId: plan.planNumber,
        reason: 'Plan release reservation',
      });
    }

    const invRice = await InventoryItem.findOne({ materialId: matRice._id, warehouseId: warehouse._id });
    expect(invRice.reserved).toBe(20); // 10 units * 2kg
    expect(invRice.available).toBe(130); // 150 - 20

    // Consume raw materials for 3 produced units (6kg Rice, 1.5kg Ghee, 3 Packaging)
    await InventoryLedgerService.recordTransaction({
      materialId: matRice._id,
      warehouseId: warehouse._id,
      quantity: 6,
      type: 'Production Consumption',
      referenceId: plan.planNumber,
    });

    await InventoryLedgerService.recordTransaction({
      materialId: matGhee._id,
      warehouseId: warehouse._id,
      quantity: 1.5,
      type: 'Production Consumption',
      referenceId: plan.planNumber,
    });

    await InventoryLedgerService.recordTransaction({
      materialId: matPkg._id,
      warehouseId: warehouse._id,
      quantity: 3,
      type: 'Production Consumption',
      referenceId: plan.planNumber,
    });

    // Record Finished Goods Receipt (3 units)
    await InventoryLedgerService.recordTransaction({
      materialId: matFinishedGood._id,
      warehouseId: warehouse._id,
      quantity: 3,
      type: 'Production Receipt',
      referenceId: plan.planNumber,
    });

    const fgInv = await InventoryItem.findOne({ materialId: matFinishedGood._id, warehouseId: warehouse._id });
    expect(fgInv.onHand).toBe(3);
    expect(fgInv.available).toBe(3);

    // Verify immutable transaction log
    const txns = await InventoryTransaction.find({ referenceId: plan.planNumber });
    expect(txns.length).toBeGreaterThanOrEqual(4);
  });
});
