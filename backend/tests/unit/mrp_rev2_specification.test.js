const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Material = require('../../models/Material');
const BOM = require('../../models/BOM');
const Warehouse = require('../../models/Warehouse');
const InventoryItem = require('../../models/InventoryItem');
const PurchaseOrder = require('../../models/PurchaseOrder');
const ProductionOrder = require('../../models/ProductionOrder');
const ProductionPlan = require('../../models/ProductionPlan');
const ProductionPlanInstance = require('../../models/ProductionPlanInstance');
const Sequence = require('../../models/Sequence');

const MRPEngineService = require('../../services/mrpEngineService');
const ProductionPlanningEngine = require('../../services/productionPlanningEngine');

jest.setTimeout(60000);

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
});

afterAll(async () => {
  try {
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  } catch (_) {}
  try {
    if (mongoServer) {
      await mongoServer.stop();
    }
  } catch (_) {}
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  await Sequence.create({ _id: 'productionPlan', seq: 1000 });
  await Sequence.create({ _id: 'productionOrder', seq: 2000 });
  await Sequence.create({ _id: 'mrpRun', seq: 3000 });
  await Sequence.create({ _id: 'purchaseRequirement', seq: 4000 });
});

describe('MRP, Production Planning & Reusable Execution (Rev. 2 Specification Tests)', () => {
  let warehouse, rawLegs, rawTop, rawScrews, finishedTable, bom;

  beforeEach(async () => {
    warehouse = await Warehouse.create({
      name: 'Main Factory Warehouse',
      code: 'WH-MAIN-01',
      status: 'Active',
    });

    rawLegs = await Material.create({
      name: 'Table Leg (Wood)',
      code: 'RAW-LEG-01',
      type: 'Raw Material',
      unit: 'pcs',
      makeOrBuy: 'BUY',
      isActive: true,
    });

    rawTop = await Material.create({
      name: 'Table Top Board',
      code: 'RAW-TOP-01',
      type: 'Raw Material',
      unit: 'pcs',
      makeOrBuy: 'BUY',
      isActive: true,
    });

    rawScrews = await Material.create({
      name: 'Assembly Screw (M8)',
      code: 'RAW-SCR-01',
      type: 'Raw Material',
      unit: 'pcs',
      makeOrBuy: 'BUY',
      isActive: true,
    });

    finishedTable = await Material.create({
      name: 'Executive Office Table',
      code: 'FG-TBL-100',
      type: 'Finished',
      unit: 'pcs',
      makeOrBuy: 'MAKE',
      isActive: true,
    });

    // BOM: 1 Table = 4 Legs + 1 Top + 8 Screws
    bom = await BOM.create({
      bomNumber: 'BOM-TBL-100',
      productId: finishedTable._id,
      version: '1',
      status: 'Active',
      batchSize: 1,
      batchUOM: 'pcs',
      components: [
        { materialId: rawLegs._id, quantity: 4, uom: 'pcs' },
        { materialId: rawTop._id, quantity: 1, uom: 'pcs' },
        { materialId: rawScrews._id, quantity: 8, uom: 'pcs' },
      ],
    });
  });

  // TEST 1: Rev. 2 Net Requirement & ATP Formula
  test('1. ATP & Net Requirement formula accounts for onHand, reserved, and open PO supply', async () => {
    // 100 Tables -> Gross requirements: 400 Legs, 100 Tops, 800 Screws
    // Inventory setup:
    // Legs: OnHand 200, Reserved 50 -> Avail 150. Open PO = 150. Total ATP = 300. Net Req = 400 - 300 = 100.
    // Tops: OnHand 100, Reserved 0 -> Avail 100. Total ATP = 100. Net Req = 0.
    // Screws: OnHand 500, Reserved 0 -> Avail 500. Total ATP = 500. Net Req = 800 - 500 = 300.

    await InventoryItem.create({
      materialId: rawLegs._id,
      warehouseId: warehouse._id,
      onHand: 200,
      reserved: 50,
    });

    await InventoryItem.create({
      materialId: rawTop._id,
      warehouseId: warehouse._id,
      onHand: 100,
      reserved: 0,
    });

    await InventoryItem.create({
      materialId: rawScrews._id,
      warehouseId: warehouse._id,
      onHand: 500,
      reserved: 0,
    });

    const dummyUser = new mongoose.Types.ObjectId();
    const dummyVendor = new mongoose.Types.ObjectId();

    await PurchaseOrder.create({
      poNumber: 'PO-2026-001',
      vendorId: dummyVendor,
      requestedBy: dummyUser,
      materials: [{
        materialId: rawLegs._id,
        quantity: 150,
        unitPrice: 10,
      }],
      totalAmount: 1500,
      status: 'Approved',
    });

    const mrpResult = await MRPEngineService.runMRP({
      productId: finishedTable._id,
      bomId: bom._id,
      warehouseId: warehouse._id,
      targetQty: 100,
      requiredDate: new Date(),
    });

    expect(mrpResult.success).toBe(true);

    const legReq = mrpResult.requirements.find(r => r.materialId.toString() === rawLegs._id.toString());
    const topReq = mrpResult.requirements.find(r => r.materialId.toString() === rawTop._id.toString());
    const scrReq = mrpResult.requirements.find(r => r.materialId.toString() === rawScrews._id.toString());

    expect(legReq.requiredQty).toBe(400);
    expect(legReq.shortageQty).toBe(100); // 400 - (150 avail + 150 open PO) = 100

    expect(topReq.requiredQty).toBe(100);
    expect(topReq.shortageQty).toBe(0); // 100 - 100 = 0

    expect(scrReq.requiredQty).toBe(800);
    expect(scrReq.shortageQty).toBe(300); // 800 - 500 = 300
  });

  // TEST 2: Canonical State Machine Transitions (Part C1 & Test 13)
  test('2. Canonical State Machine enforces valid transitions and rejects invalid state jumps', async () => {
    expect(ProductionPlanningEngine.validateTransition('UNSCHEDULED', 'DRAFT').valid).toBe(true);
    expect(ProductionPlanningEngine.validateTransition('DRAFT', 'VALIDATED').valid).toBe(true);
    expect(ProductionPlanningEngine.validateTransition('VALIDATED', 'PENDING_APPROVAL').valid).toBe(true);
    expect(ProductionPlanningEngine.validateTransition('PENDING_APPROVAL', 'APPROVED').valid).toBe(true);
    expect(ProductionPlanningEngine.validateTransition('APPROVED', 'RELEASED').valid).toBe(true);
    expect(ProductionPlanningEngine.validateTransition('RELEASED', 'IN_PROGRESS').valid).toBe(true);
    expect(ProductionPlanningEngine.validateTransition('IN_PROGRESS', 'COMPLETED').valid).toBe(true);

    // Invalid transitions
    const invalidJump1 = ProductionPlanningEngine.validateTransition('DRAFT', 'IN_PROGRESS');
    expect(invalidJump1.valid).toBe(false);
    expect(invalidJump1.error).toContain("Invalid status transition from 'DRAFT' to 'IN_PROGRESS'");

    const invalidJump2 = ProductionPlanningEngine.validateTransition('COMPLETED', 'DRAFT');
    expect(invalidJump2.valid).toBe(false);
  });

  // TEST 3: Shortage Execution Guard (Part C1 & Test 9)
  test('3. Server-side canExecute guard strictly blocks execution when unresolved shortages exist', async () => {
    // Inventory has 0 stock of raw legs and screws
    const plan = await ProductionPlan.create({
      planNumber: 'PLAN-TEST-100',
      productId: finishedTable._id,
      bomId: bom._id,
      warehouseId: warehouse._id,
      totalPlans: 50,
      quantity: 50,
      requiredDate: new Date(),
      status: 'APPROVED',
    });

    const guardCheck = await ProductionPlanningEngine.canExecute(plan);
    expect(guardCheck.allowed).toBe(false);
    expect(guardCheck.reason).toContain('Execution blocked due to unresolved material shortages');
    expect(guardCheck.shortages.length).toBeGreaterThan(0);
  });

  // TEST 4: Unified Batch Splitting Engine (Part B5)
  test('4. Unified Splitting Engine splits by count and by batch size with exact sum validation', () => {
    // Split 100 by COUNT into 4 batches -> 25, 25, 25, 25
    const countBatches = ProductionPlanningEngine.splitPlanIntoBatches({
      totalQuantity: 100,
      splitMode: 'COUNT',
      splitValue: 4,
    });
    expect(countBatches.length).toBe(4);
    expect(countBatches.reduce((acc, b) => acc + b.quantity, 0)).toBe(100);
    expect(countBatches[0].quantity).toBe(25);

    // Split 100 by SIZE of 30 -> 30, 30, 30, 10
    const sizeBatches = ProductionPlanningEngine.splitPlanIntoBatches({
      totalQuantity: 100,
      splitMode: 'SIZE',
      splitValue: 30,
    });
    expect(sizeBatches.length).toBe(4);
    expect(sizeBatches.reduce((acc, b) => acc + b.quantity, 0)).toBe(100);
    expect(sizeBatches[0].quantity).toBe(30);
    expect(sizeBatches[3].quantity).toBe(10);

    // Rejection on invalid custom split sum when allowPartial is false
    expect(() => {
      ProductionPlanningEngine.splitPlanIntoBatches({
        totalQuantity: 100,
        splitMode: 'CUSTOM',
        customSplits: [{ quantity: 40 }, { quantity: 40 }], // sum 80 != 100
        allowPartial: false,
      });
    }).toThrow(/Split quantities sum/);
  });

  // TEST 5: Master Plan & Instance Separation with Dynamic Aggregate (Part A3 & B6)
  test('5. Master Plan remaining and completed counts are dynamically synced from DB instances', async () => {
    const masterPlan = await ProductionPlan.create({
      planNumber: 'PLAN-MASTER-101',
      productId: finishedTable._id,
      warehouseId: warehouse._id,
      totalPlans: 100,
      quantity: 100,
      availablePlans: 100,
      releasedPlans: 0,
      completedPlans: 0,
      requiredDate: new Date(),
      status: 'APPROVED',
    });

    const inst1 = await ProductionPlanInstance.create({
      instanceNumber: 'PLAN-MASTER-101-A',
      planId: masterPlan._id,
      planNumber: masterPlan.planNumber,
      productId: finishedTable._id,
      warehouseId: warehouse._id,
      quantity: 50,
      plannedStartDate: new Date(),
      status: 'COMPLETED',
      completedQuantity: 50,
    });

    const inst2 = await ProductionPlanInstance.create({
      instanceNumber: 'PLAN-MASTER-101-B',
      planId: masterPlan._id,
      planNumber: masterPlan.planNumber,
      productId: finishedTable._id,
      warehouseId: warehouse._id,
      quantity: 50,
      plannedStartDate: new Date(),
      status: 'APPROVED',
    });

    await ProductionPlanningEngine.syncPlanProgressFromInstances(masterPlan._id);

    const updatedPlan = await ProductionPlan.findById(masterPlan._id);
    expect(updatedPlan.completedPlans).toBe(50);
    expect(updatedPlan.availablePlans).toBe(50);
    expect(updatedPlan.status).toBe('PARTIALLY_COMPLETED');

    // Complete second instance -> parent plan status becomes COMPLETED
    inst2.status = 'COMPLETED';
    inst2.completedQuantity = 50;
    await inst2.save();

    await ProductionPlanningEngine.syncPlanProgressFromInstances(masterPlan._id);
    const finalPlan = await ProductionPlan.findById(masterPlan._id);
    expect(finalPlan.completedPlans).toBe(100);
    expect(finalPlan.status).toBe('COMPLETED');
  });

  // TEST 6: Plan Reuse & Staleness Check (Part B7 & Test 15)
  test('6. Plan Reuse detects updated BOM version and flags staleness for planner revalidation', async () => {
    const sourcePlan = await ProductionPlan.create({
      planNumber: 'PLAN-OLD-001',
      productId: finishedTable._id,
      bomId: bom._id,
      bomVersion: '1',
      warehouseId: warehouse._id,
      totalPlans: 50,
      requiredDate: new Date(),
      status: 'COMPLETED',
    });

    // Create a new BOM version v2
    bom.status = 'Draft';
    await bom.save();

    const bomV2 = await BOM.create({
      bomNumber: 'BOM-TBL-100',
      productId: finishedTable._id,
      version: '2',
      status: 'Active',
      batchSize: 1,
      batchUOM: 'pcs',
      components: [
        { materialId: rawLegs._id, quantity: 4, uom: 'pcs' },
        { materialId: rawTop._id, quantity: 1, uom: 'pcs' },
        { materialId: rawScrews._id, quantity: 10, uom: 'pcs' }, // 10 screws in v2
      ],
    });

    const staleness = await ProductionPlanningEngine.checkReuseStaleness(sourcePlan._id);
    expect(staleness.isStale).toBe(true);
    expect(staleness.diffs.some(d => d.includes('BOM version updated from v1 to v2'))).toBe(true);
    expect(String(staleness.currentActiveBom.version)).toBe('2');
  });

  // TEST 7: Custom Materials & Substitutions (Part B8)
  test('7. Custom materials and substitutions are safely stored on plan without altering standard BOM', async () => {
    const customGlue = await Material.create({
      name: 'Wood Adhesive Glue',
      code: 'RAW-GLUE-01',
      type: 'Raw Material',
      unit: 'ml',
      isActive: true,
    });

    const plan = await ProductionPlan.create({
      planNumber: 'PLAN-CUSTOM-001',
      productId: finishedTable._id,
      bomId: bom._id,
      warehouseId: warehouse._id,
      totalPlans: 20,
      requiredDate: new Date(),
      customMaterials: [
        {
          materialId: customGlue._id,
          materialCode: customGlue.code,
          materialName: customGlue.name,
          quantity: 200,
          uom: 'ml',
          reason: 'Reinforced wood joints',
          isApproved: true,
        }
      ],
      substitutions: [
        {
          originalMaterialId: rawScrews._id,
          originalMaterialCode: rawScrews.code,
          substituteMaterialId: rawScrews._id,
          substituteMaterialCode: 'RAW-SCR-STAINLESS',
          originalQuantity: 160,
          substituteQuantity: 160,
          conversionFactor: 1.0,
          reason: 'Stainless steel screw upgrade',
          isApproved: true,
        }
      ],
    });

    expect(plan.customMaterials.length).toBe(1);
    expect(plan.customMaterials[0].materialCode).toBe('RAW-GLUE-01');
    expect(plan.substitutions.length).toBe(1);

    // Standard BOM remains unmutated
    const cleanBom = await BOM.findById(bom._id);
    expect(cleanBom.components.length).toBe(3);
  });

  // TEST 8: Maker-Checker Segregation Rule (Part D1)
  test('8. Pre-release validator enforces maker-checker segregation when configured', async () => {
    const plannerUserId = new mongoose.Types.ObjectId();

    const plan = await ProductionPlan.create({
      planNumber: 'PLAN-GOV-001',
      productId: finishedTable._id,
      bomId: bom._id,
      warehouseId: warehouse._id,
      totalPlans: 10,
      requiredDate: new Date(),
      requireDifferentApprover: true,
      createdBy: plannerUserId,
    });

    // Attempt validation/approval with same planner user ID
    const valResult = await ProductionPlanningEngine.validatePlanForRelease(plan._id, plannerUserId);
    expect(valResult.valid).toBe(false);
    expect(valResult.errors.some(e => e.includes('Maker-checker policy violation'))).toBe(true);

    // Validation with a different approver ID passes maker-checker
    const approverUserId = new mongoose.Types.ObjectId();
    const valResult2 = await ProductionPlanningEngine.validatePlanForRelease(plan._id, approverUserId);
    expect(valResult2.errors.some(e => e.includes('Maker-checker'))).toBe(false);
  });
});
