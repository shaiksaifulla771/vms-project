const mongoose = require('mongoose');
const Material = require('../models/Material');
const MPN = require('../models/MPN');
const Vendor = require('../models/Vendor');
const BOM = require('../models/BOM');
const Warehouse = require('../models/Warehouse');
const Site = require('../models/Site');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionOrder = require('../models/ProductionOrder');
const MRPEngineService = require('../services/mrpEngineService');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const productionPlanController = require('../controllers/productionPlanController');

describe('VMS ERP — End-to-End MRP → Scheduling → Production → Inventory Integration Forensic Audit', () => {
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

    // 3. Setup Inventory Balances for Cross-Warehouse Isolation Test
    // WH-A has 100 kg stock
    await InventoryLedgerService.recordTransaction({
      materialId: rawMat._id,
      warehouseId: whA._id,
      siteId: siteA._id,
      quantity: 100,
      type: 'Opening',
      reason: 'Forensic Audit Initial Stock WH-A',
      userId: testUser.id
    });

    // WH-B has 500 kg stock
    await InventoryLedgerService.recordTransaction({
      materialId: rawMat._id,
      warehouseId: whB._id,
      siteId: siteB._id,
      quantity: 500,
      type: 'Opening',
      reason: 'Forensic Audit Initial Stock WH-B',
      userId: testUser.id
    });
  });

  afterAll(async () => {
    if (whA && whB) {
      await InventoryTransaction.deleteMany({ reason: /Forensic Audit/ });
      await InventoryItem.deleteMany({ warehouseId: { $in: [whA._id, whB._id] } });
      await ProductionOrder.deleteMany({ sourceWarehouseId: { $in: [whA._id, whB._id] } });
      await ProductionPlan.deleteMany({ warehouseId: { $in: [whA._id, whB._id] } });
      if (bom) await BOM.deleteOne({ _id: bom._id });
      if (mpn) await MPN.deleteOne({ _id: mpn._id });
      if (rawMat && fgMat) await Material.deleteMany({ _id: { $in: [rawMat._id, fgMat._id] } });
      if (vendor) await Vendor.deleteOne({ _id: vendor._id });
      await Warehouse.deleteMany({ _id: { $in: [whA._id, whB._id] } });
      await Site.deleteMany({ _id: { $in: [siteA._id, siteB._id] } });
    }
    await mongoose.connection.close();
  });

  test('1. Cross-Warehouse Isolation Test: MRP for WH-A uses ONLY WH-A stock (100 kg), NOT WH-B stock (500 kg)', async () => {
    const mrpResult = await MRPEngineService.runMRP({
      productId: fgMat._id,
      bomId: bom._id,
      siteId: siteA._id,
      warehouseId: whA._id,
      targetQty: 75, // Requires 75 * 2 = 150 kg of rawMat
      requiredDate: new Date(),
      userId: testUser.id
    });

    expect(mrpResult.success).toBe(true);
    const req = mrpResult.requirements[0];
    expect(req.materialId.toString()).toBe(rawMat._id.toString());
    expect(req.requiredQty).toBe(150);
    // MUST be 100 kg (WH-A stock), NOT 500 kg or 600 kg!
    expect(req.availableQty).toBe(100);
    expect(req.netQty).toBe(50);
    expect(req.shortageQty).toBe(50);
  });

  test('2. Generate 10 MRP Planning Proposals in WH-A (all Unscheduled)', async () => {
    const plans = [];
    for (let i = 1; i <= 10; i++) {
      const plan = await ProductionPlan.create({
        planNumber: `PLAN-FORENSIC-${Date.now()}-${i}`,
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
      plans.push(plan);
    }

    expect(plans.length).toBe(10);
    const unscheduledCount = await ProductionPlan.countDocuments({ warehouseId: whA._id, status: 'Unscheduled' });
    expect(unscheduledCount).toBe(10);

    // 3. Schedule EXACTLY 1 Plan (PLAN #1)
    const targetPlan = plans[0];
    const mockReq = {
      params: { id: targetPlan._id.toString() },
      body: { quantity: 10 },
      user: testUser,
      ip: '127.0.0.1'
    };

    let responseData = null;
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          responseData = data;
          return data;
        }
      })
    };

    await productionPlanController.scheduleProductionPlan(mockReq, mockRes, () => {});
    expect(responseData.success).toBe(true);

    // Verify 1 plan scheduled, EXACTLY 9 plans remain unscheduled
    const remainingUnscheduled = await ProductionPlan.countDocuments({
      _id: { $in: plans.map(p => p._id) },
      status: 'Unscheduled'
    });
    expect(remainingUnscheduled).toBe(9);

    const updatedPlan = await ProductionPlan.findById(targetPlan._id);
    expect(updatedPlan.status).toBe('Scheduled');

    // Verify Production Order created
    const createdOrder = await ProductionOrder.findOne({ planId: targetPlan._id });
    expect(createdOrder).not.toBeNull();
    expect(createdOrder.status).toBe('Scheduled');
    expect(createdOrder.sourceWarehouseId.toString()).toBe(whA._id.toString());

    // Verify Soft Reservation in WH-A Inventory
    const invItem = await InventoryItem.findOne({ materialId: rawMat._id, warehouseId: whA._id });
    expect(invItem.reserved).toBe(20); // 10 units * 2 kg/unit = 20 kg reserved
    expect(invItem.available).toBe(80); // 100 - 20 = 80 kg available

    // 4. Unschedule PLAN #1
    const unscheduleReq = {
      params: { id: targetPlan._id.toString() },
      user: testUser
    };
    await productionPlanController.unscheduleProductionPlan(unscheduleReq, mockRes, () => {});
    expect(responseData.success).toBe(true);

    // Verify Reservation Released & Plan returns to Unscheduled
    const invItemAfterUnschedule = await InventoryItem.findOne({ materialId: rawMat._id, warehouseId: whA._id });
    expect(invItemAfterUnschedule.reserved).toBe(0);
    expect(invItemAfterUnschedule.available).toBe(100);

    const unplanAfter = await ProductionPlan.findById(targetPlan._id);
    expect(unplanAfter.status).toBe('Unscheduled');

    // 5. DOUBLE-UNSCHEDULE SAFETY TEST (Idempotency & Non-Negative Balances)
    await productionPlanController.unscheduleProductionPlan(unscheduleReq, mockRes, () => {});
    expect(responseData.success).toBe(true);

    const invItemAfterDoubleUnschedule = await InventoryItem.findOne({ materialId: rawMat._id, warehouseId: whA._id });
    expect(invItemAfterDoubleUnschedule.reserved).toBe(0);
    expect(invItemAfterDoubleUnschedule.available).toBe(100);
    expect(invItemAfterDoubleUnschedule.onHand).toBe(100);

    // 6. Schedule PLAN #2 after PLAN #1 unscheduled
    const plan2 = plans[1];
    const scheduleReq2 = {
      params: { id: plan2._id.toString() },
      body: { quantity: 10 },
      user: testUser,
      ip: '127.0.0.1'
    };
    await productionPlanController.scheduleProductionPlan(scheduleReq2, mockRes, () => {});
    expect(responseData.success).toBe(true);

    const plan2After = await ProductionPlan.findById(plan2._id);
    expect(plan2After.status).toBe('Scheduled');

    const invItemPlan2 = await InventoryItem.findOne({ materialId: rawMat._id, warehouseId: whA._id });
    expect(invItemPlan2.reserved).toBe(20);
    expect(invItemPlan2.available).toBe(80);
  });
});
