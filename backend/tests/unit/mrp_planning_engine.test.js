const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Material = require('../../models/Material');
const BOM = require('../../models/BOM');
const InventoryItem = require('../../models/InventoryItem');
const PurchaseOrder = require('../../models/PurchaseOrder');
const Warehouse = require('../../models/Warehouse');
const ProductionPlan = require('../../models/ProductionPlan');
const PurchaseRequirement = require('../../models/PurchaseRequirement');
const Sequence = require('../../models/Sequence');
const MRPEngineService = require('../../services/mrpEngineService');

describe('MRP Planning Module Unit Tests', () => {
  let mongoServer;
  let warehouse;
  let rawMat1, rawMat2, subAssembly, finishedProduct;
  let subBom, rootBom;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();

    // 1. Create Warehouse
    warehouse = await Warehouse.create({
      code: 'WH-MAIN',
      name: 'Main Plant Warehouse',
      type: 'General',
      isActive: true,
    });

    // 2. Create Materials
    rawMat1 = await Material.create({
      code: 'RM-STEEL-01',
      name: 'Steel Sheet 2mm',
      type: 'Raw Material',
      makeOrBuy: 'BUY',
      unit: 'kg',
      leadTimeDays: 7,
      safetyStock: 10,
      moq: 50,
      lotSize: 25,
      isActive: true,
    });

    rawMat2 = await Material.create({
      code: 'RM-BOLT-01',
      name: 'M8 Hex Bolt',
      type: 'Raw Material',
      makeOrBuy: 'BUY',
      unit: 'pcs',
      leadTimeDays: 5,
      safetyStock: 20,
      moq: 100,
      lotSize: 50,
      isActive: true,
    });

    subAssembly = await Material.create({
      code: 'SA-FRAME-01',
      name: 'Chassis Frame Assembly',
      type: 'Semi-Finished',
      makeOrBuy: 'MAKE',
      unit: 'pcs',
      leadTimeDays: 3,
      safetyStock: 0,
      isActive: true,
    });

    finishedProduct = await Material.create({
      code: 'FG-ROBOT-01',
      name: 'Industrial Robot V1',
      type: 'Finished',
      makeOrBuy: 'MAKE',
      unit: 'pcs',
      leadTimeDays: 2,
      safetyStock: 0,
      isActive: true,
    });

    // 3. Create Multi-Level BOMs
    // Sub-assembly BOM: 1 Frame = 5kg Steel + 8 Bolts (batchSize: 1)
    subBom = await BOM.create({
      productId: subAssembly._id,
      bomNumber: 'BOM-SA-01',
      batchSize: 1,
      batchUOM: 'pcs',
      status: 'Active',
      version: 1,
      components: [
        { materialId: rawMat1._id, quantity: 5, uom: 'kg', lossPercentage: 0 },
        { materialId: rawMat2._id, quantity: 8, uom: 'pcs', lossPercentage: 0 },
      ]
    });

    // Root BOM: 1 Robot = 1 Frame Subassembly + 4 Bolts (batchSize: 1)
    rootBom = await BOM.create({
      productId: finishedProduct._id,
      bomNumber: 'BOM-FG-01',
      batchSize: 1,
      batchUOM: 'pcs',
      status: 'Active',
      version: 1,
      components: [
        { materialId: subAssembly._id, quantity: 1, uom: 'pcs', lossPercentage: 0 },
        { materialId: rawMat2._id, quantity: 4, uom: 'pcs', lossPercentage: 0 },
      ]
    });
  });

  test('Multi-level BOM explosion traverses down to raw materials correctly', async () => {
    const exploded = await MRPEngineService.explodeBOMRecursively(finishedProduct._id, 10);
    
    // Expect components: Subassembly (10), Bolts from Root (40), Steel from Sub (50), Bolts from Sub (80)
    expect(exploded.length).toBeGreaterThanOrEqual(3);
    
    const steelComp = exploded.find(c => c.materialCode === 'RM-STEEL-01');
    expect(steelComp).toBeDefined();
    expect(steelComp.grossRequiredQty).toBe(50); // 10 robots * 1 frame * 5 kg

    const subComp = exploded.find(c => c.materialCode === 'SA-FRAME-01');
    expect(subComp).toBeDefined();
    expect(subComp.grossRequiredQty).toBe(10);
  });

  test('Material availability check accurately flags READY, PARTIAL, and SHORTAGE', async () => {
    // Zero inventory -> status should be SHORTAGE
    const check1 = await MRPEngineService.checkMaterialAvailability(rootBom._id, 5, warehouse._id);
    expect(check1.status).toBe('SHORTAGE');
    expect(check1.shortages.length).toBe(2);

    // Provide partial inventory for Frame
    await InventoryItem.create({
      materialId: subAssembly._id,
      warehouseId: warehouse._id,
      onHand: 2,
      reserved: 0,
      available: 2,
    });

    const check2 = await MRPEngineService.checkMaterialAvailability(rootBom._id, 5, warehouse._id);
    expect(check2.status).toBe('PARTIAL');

    // Provide full inventory for both components
    await InventoryItem.create({
      materialId: rawMat2._id,
      warehouseId: warehouse._id,
      onHand: 100,
      reserved: 0,
      available: 100,
    });
    await InventoryItem.findOneAndUpdate(
      { materialId: subAssembly._id, warehouseId: warehouse._id },
      { $set: { onHand: 10, available: 10 } }
    );

    const check3 = await MRPEngineService.checkMaterialAvailability(rootBom._id, 5, warehouse._id);
    expect(check3.status).toBe('READY');
    expect(check3.shortages.length).toBe(0);
  });

  test('runMRP generates UNSCHEDULED ProductionPlan and PurchaseRequirements with lot sizing', async () => {
    // Inventory: 10 units Steel available, 0 Bolts
    await InventoryItem.create({
      materialId: rawMat1._id,
      warehouseId: warehouse._id,
      onHand: 10,
      reserved: 0,
      available: 10,
    });

    const result = await MRPEngineService.runMRP({
      productId: finishedProduct._id,
      bomId: rootBom._id,
      warehouseId: warehouse._id,
      targetQty: 10,
      requiredDate: new Date(Date.now() + 14 * 86400000),
    });

    expect(result.success).toBe(true);
    expect(result.mrpRun).toBeDefined();
    expect(result.productionPlans.length).toBe(1);

    const rootPlan = result.productionPlans[0];
    expect(rootPlan.status).toBe('UNSCHEDULED');
    expect(rootPlan.quantity).toBe(10);
    expect(rootPlan.planSource).toBe('MRP');
    expect(rootPlan.materialStatus.status).toBe('SHORTAGE');

    // Purchase requirements generated for raw materials
    expect(result.purchaseRequirements.length).toBeGreaterThan(0);
    const steelPR = result.purchaseRequirements.find(p => p.materialCode === 'RM-STEEL-01');
    expect(steelPR).toBeDefined();
    expect(steelPR.status).toBe('OPEN');
    // Required: 50 - 10 available = 40 shortage
    expect(steelPR.quantity).toBe(40);
  });
});
