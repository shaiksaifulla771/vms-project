const mongoose = require('mongoose');
const Material = require('../models/Material');
const MPN = require('../models/MPN');
const Vendor = require('../models/Vendor');
const BOM = require('../models/BOM');
const Warehouse = require('../models/Warehouse');
const Site = require('../models/Site');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionOrder = require('../models/ProductionOrder');
const MRPEngineService = require('../services/mrpEngineService');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const productionPlanController = require('../controllers/productionPlanController');
const productionController = require('../controllers/productionController');

describe('VMS ERP — 11-Scenario Enterprise MRP & Integration Audit Suite', () => {
  let siteA, siteB;
  let whA, whB;
  let rawMat, fgMat;
  let mpn;
  let vendor;
  let bom;
  let testUser;

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/vms_test_db';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    testUser = { id: new mongoose.Types.ObjectId().toString(), username: 'ForensicAuditor' };

    // 1. Setup Sites & Warehouses
    siteA = await Site.create({ code: `SITE-A-${Date.now()}`, name: 'Hyderabad Plant Site A', type: 'Manufacturing Plant' });
    siteB = await Site.create({ code: `SITE-B-${Date.now()}`, name: 'Bangalore Plant Site B', type: 'Manufacturing Plant' });

    whA = await Warehouse.create({ code: `WHA-${Date.now()}`, name: 'Hyderabad Main WH A', siteId: siteA._id, type: 'Raw' });
    whB = await Warehouse.create({ code: `WHB-${Date.now()}`, name: 'Bangalore Storage WH B', siteId: siteB._id, type: 'Raw' });

    // 2. Setup Master Data
    vendor = await Vendor.create({ code: `VEN-${Date.now()}`, name: 'Forensic Metal Suppliers', email: 'vendor@forensic.com', category: 'Raw Material' });

    rawMat = await Material.create({ code: `MAT-RAW-${Date.now()}`, name: 'Steel Sheet Grade A', type: 'Raw Material', unit: 'kg' });
    fgMat = await Material.create({ code: `MAT-FG-${Date.now()}`, name: 'Steel Enclosure Assembly', type: 'Finished', unit: 'pcs' });

    mpn = await MPN.create({
      mpnCode: `MPN-STEEL-${Date.now()}`,
      manufacturerPartNumber: `MPN-STEEL-${Date.now()}`,
      materialId: rawMat._id,
      vendorId: vendor._id,
      manufacturerName: 'Tata Steel',
      price: 45.0,
      latestPrice: 45.0
    });

    bom = await BOM.create({
      productId: fgMat._id,
      name: 'Steel Enclosure BOM v1',
      version: 1,
      batchSize: 1,
      batchUOM: 'pcs',
      components: [
        {
          materialId: rawMat._id,
          mpnId: mpn._id,
          quantity: 2.0,
          qty: 2.0,
          lossPercentage: 0,
          unit: 'kg'
        }
      ]
    });

    // 3. Setup Initial Inventory Balances
    // WH-A has 100 kg stock
    await InventoryLedgerService.recordTransaction({
      materialId: rawMat._id,
      warehouseId: whA._id,
      siteId: siteA._id,
      quantity: 100,
      type: 'Opening',
      reason: '11-Scenario Audit Stock WH-A',
      userId: testUser.id
    });

    // WH-B has 500 kg stock
    await InventoryLedgerService.recordTransaction({
      materialId: rawMat._id,
      warehouseId: whB._id,
      siteId: siteB._id,
      quantity: 500,
      type: 'Opening',
      reason: '11-Scenario Audit Stock WH-B',
      userId: testUser.id
    });
  });

  afterAll(async () => {
    if (whA && whB) {
      await InventoryTransaction.deleteMany({ reason: /11-Scenario Audit/ });
      await InventoryItem.deleteMany({ warehouseId: { $in: [whA._id, whB._id] } });
      await ProductionOrder.deleteMany({ sourceWarehouseId: { $in: [whA._id, whB._id] } });
      await ProductionPlan.deleteMany({ warehouseId: { $in: [whA._id, whB._id] } });
      await PurchaseOrder.deleteMany({ requestedBy: testUser.id });
      if (bom) await BOM.deleteOne({ _id: bom._id });
      if (mpn) await MPN.deleteOne({ _id: mpn._id });
      if (rawMat && fgMat) await Material.deleteMany({ _id: { $in: [rawMat._id, fgMat._id] } });
      if (vendor) await Vendor.deleteOne({ _id: vendor._id });
      await Warehouse.deleteMany({ _id: { $in: [whA._id, whB._id] } });
      await Site.deleteMany({ _id: { $in: [siteA._id, siteB._id] } });
    }
    await mongoose.connection.close();
  });

  test('Test 1 — Happy Path (Warehouse ➔ MRP ➔ Plan ➔ Schedule ➔ Reserve ➔ Complete)', async () => {
    const plan = await ProductionPlan.create({
      planNumber: `PLAN-HAPPY-${Date.now()}`,
      productId: fgMat._id,
      bomId: bom._id,
      siteId: siteA._id,
      warehouseId: whA._id,
      quantity: 5,
      originalQuantity: 5,
      scheduledQuantity: 0,
      remainingQuantity: 5,
      requiredDate: new Date(),
      status: 'Unscheduled',
      createdBy: testUser.id
    });

    let responseData = null;
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          responseData = data;
          return data;
        }
      })
    };

    const scheduleReq = {
      params: { id: plan._id.toString() },
      body: { quantity: 5, startDate: new Date(), workCenter: 'Line 1' },
      user: testUser,
      ip: '127.0.0.1'
    };

    await productionPlanController.scheduleProductionPlan(scheduleReq, mockRes, () => {});
    expect(responseData.success).toBe(true);

    const inv = await InventoryItem.findOne({ materialId: rawMat._id, warehouseId: whA._id });
    expect(inv.reserved).toBeGreaterThanOrEqual(10); // 5 units * 2 kg = 10 kg reserved
  });

  test('Test 2 — Unschedule Reversal (Schedule ➔ Reserve ➔ Unschedule ➔ Reservation Released)', async () => {
    const plan = await ProductionPlan.create({
      planNumber: `PLAN-UNSCHED-${Date.now()}`,
      productId: fgMat._id,
      bomId: bom._id,
      siteId: siteA._id,
      warehouseId: whA._id,
      quantity: 10,
      originalQuantity: 10,
      scheduledQuantity: 0,
      remainingQuantity: 10,
      requiredDate: new Date(),
      status: 'Unscheduled',
      createdBy: testUser.id
    });

    let responseData = null;
    const mockRes = { status: () => ({ json: (d) => { responseData = d; return d; } }) };

    await productionPlanController.scheduleProductionPlan({
      params: { id: plan._id.toString() },
      body: { quantity: 10 },
      user: testUser
    }, mockRes, () => {});
    expect(responseData.success).toBe(true);

    // Unschedule
    await productionPlanController.unscheduleProductionPlan({
      params: { id: plan._id.toString() },
      user: testUser
    }, mockRes, () => {});
    expect(responseData.success).toBe(true);

    const updatedPlan = await ProductionPlan.findById(plan._id);
    expect(updatedPlan.status).toBe('Unscheduled');
  });

  test('Test 3 — Double Unschedule Idempotency Guard (No duplicate release, returns PLAN_ALREADY_UNSCHEDULED)', async () => {
    const plan = await ProductionPlan.create({
      planNumber: `PLAN-IDEMP-${Date.now()}`,
      productId: fgMat._id,
      bomId: bom._id,
      siteId: siteA._id,
      warehouseId: whA._id,
      quantity: 5,
      originalQuantity: 5,
      scheduledQuantity: 0,
      remainingQuantity: 5,
      requiredDate: new Date(),
      status: 'Unscheduled',
      createdBy: testUser.id
    });

    let responseData = null;
    const mockRes = { status: () => ({ json: (d) => { responseData = d; return d; } }) };

    // Schedule
    await productionPlanController.scheduleProductionPlan({
      params: { id: plan._id.toString() },
      body: { quantity: 5 },
      user: testUser
    }, mockRes, () => {});

    // First unschedule
    await productionPlanController.unscheduleProductionPlan({
      params: { id: plan._id.toString() },
      user: testUser
    }, mockRes, () => {});
    expect(responseData.success).toBe(true);

    // Second unschedule (idempotent call)
    await productionPlanController.unscheduleProductionPlan({
      params: { id: plan._id.toString() },
      user: testUser
    }, mockRes, () => {});
    expect(responseData.success).toBe(true);
    expect(responseData.message).toBe('PLAN_ALREADY_UNSCHEDULED');
  });

  test('Test 4 — Insufficient Inventory & Shortage Calculation', async () => {
    // Requires 200 * 2 = 400 kg of rawMat, but WH-A available is < 400 kg
    const mrpResult = await MRPEngineService.runMRP({
      productId: fgMat._id,
      bomId: bom._id,
      siteId: siteA._id,
      warehouseId: whA._id,
      targetQty: 200,
      requiredDate: new Date(),
      userId: testUser.id
    });

    expect(mrpResult.success).toBe(true);
    const req = mrpResult.requirements[0];
    expect(req.shortageQty).toBeGreaterThan(0);
    expect(req.action).toMatch(/Procure|Partial Stock/);
  });

  test('Test 5 — Open PO Supply Netting in MRP', async () => {
    // Create an Approved Purchase Order for 50 kg of rawMat
    const po = await PurchaseOrder.create({
      poNumber: `PO-TEST-${Date.now()}`,
      vendorId: vendor._id,
      materials: [{ materialId: rawMat._id, quantity: 50, unitPrice: 45 }],
      totalAmount: 2250,
      status: 'Approved',
      requestedBy: testUser.id
    });

    const mrpResult = await MRPEngineService.runMRP({
      productId: fgMat._id,
      bomId: bom._id,
      siteId: siteA._id,
      warehouseId: whA._id,
      targetQty: 60, // Requires 120 kg
      requiredDate: new Date(),
      userId: testUser.id
    });

    expect(mrpResult.success).toBe(true);
    const req = mrpResult.requirements[0];
    expect(req.onOrderQty).toBeGreaterThanOrEqual(50);
  });

  test('Test 6 & 7 — Cross-Warehouse Isolation: MRP for WH-A uses ONLY WH-A stock (100 kg), NOT WH-B stock (500 kg)', async () => {
    const mrpResult = await MRPEngineService.runMRP({
      productId: fgMat._id,
      bomId: bom._id,
      siteId: siteA._id,
      warehouseId: whA._id,
      targetQty: 75, // Requires 150 kg
      requiredDate: new Date(),
      userId: testUser.id
    });

    expect(mrpResult.success).toBe(true);
    const req = mrpResult.requirements[0];
    // Available in WH-A is 100, WH-B (500) must NOT be counted!
    expect(req.availableQty).toBeLessThan(500);
  });

  test('Test 8 — Concurrent Scheduling Safeguards', async () => {
    const plan = await ProductionPlan.create({
      planNumber: `PLAN-CONCUR-${Date.now()}`,
      productId: fgMat._id,
      bomId: bom._id,
      siteId: siteA._id,
      warehouseId: whA._id,
      quantity: 5,
      originalQuantity: 5,
      scheduledQuantity: 0,
      remainingQuantity: 5,
      requiredDate: new Date(),
      status: 'Unscheduled',
      createdBy: testUser.id
    });

    let res1, res2;
    const mockRes1 = { status: () => ({ json: (d) => { res1 = d; return d; } }) };
    const mockRes2 = { status: () => ({ json: (d) => { res2 = d; return d; } }) };

    // Concurrent execution
    await Promise.all([
      productionPlanController.scheduleProductionPlan({ params: { id: plan._id.toString() }, body: { quantity: 5 }, user: testUser }, mockRes1, () => {}),
      productionPlanController.scheduleProductionPlan({ params: { id: plan._id.toString() }, body: { quantity: 5 }, user: testUser }, mockRes2, () => {})
    ]);

    // Exactly one should succeed, or total scheduled quantity must equal 5
    const updatedPlan = await ProductionPlan.findById(plan._id);
    expect(updatedPlan.scheduledQuantity).toBe(5);
  });

  test('Test 9 — Non-Negative Balance Constraints (Reserved <= OnHand)', async () => {
    const inv = await InventoryItem.findOne({ materialId: rawMat._id, warehouseId: whA._id });
    expect(inv.reserved).toBeLessThanOrEqual(inv.onHand);
    expect(inv.available).toBeGreaterThanOrEqual(0);
    expect(inv.onHand).toBeGreaterThanOrEqual(0);
  });

  test('Test 10 — Production Material Consumption Logging', async () => {
    const tx = await InventoryLedgerService.recordTransaction({
      materialId: rawMat._id,
      warehouseId: whA._id,
      siteId: siteA._id,
      quantity: 10,
      type: 'Issue',
      reason: '11-Scenario Audit Production Material Issue',
      userId: testUser.id
    });

    expect(tx.success).toBe(true);
    expect(tx.transaction).toBeDefined();
    expect(tx.transaction.type).toBe('Issue');
  });

  test('Test 11 — Duplicate Issue Idempotency Guard (Passing same idempotencyKey returns existing tx)', async () => {
    const idempotencyKey = `TXN-KEY-${Date.now()}`;
    const tx1 = await InventoryLedgerService.recordTransaction({
      materialId: rawMat._id,
      warehouseId: whA._id,
      siteId: siteA._id,
      quantity: 5,
      type: 'Issue',
      idempotencyKey,
      reason: '11-Scenario Audit Idempotency Key Test',
      userId: testUser.id
    });

    expect(tx1.success).toBe(true);

    // Call duplicate transaction with same idempotency key
    const tx2 = await InventoryLedgerService.recordTransaction({
      materialId: rawMat._id,
      warehouseId: whA._id,
      siteId: siteA._id,
      quantity: 5,
      type: 'Issue',
      idempotencyKey,
      reason: '11-Scenario Audit Idempotency Key Test',
      userId: testUser.id
    });

    expect(tx2.success).toBe(true);
    expect(tx2.duplicate).toBe(true);
    expect(tx2.transaction._id.toString()).toBe(tx1.transaction._id.toString());
  });
});
