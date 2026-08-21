const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Material = require('../../models/Material');
const BOM = require('../../models/BOM');
const Warehouse = require('../../models/Warehouse');
const InventoryItem = require('../../models/InventoryItem');
const ProductionPlan = require('../../models/ProductionPlan');
const ProductionOrder = require('../../models/ProductionOrder');
const {
  createManualPlan,
  scheduleProductionPlan,
  rescheduleProductionPlan,
  materialCheckProductionPlan,
  approveProductionPlan,
  releaseProductionPlan,
  holdProductionPlan,
  cancelProductionPlan,
  completeProductionPlan,
} = require('../../controllers/productionPlanController');

describe('Production Plan Lifecycle Integration Tests', () => {
  let mongoServer;
  let warehouse, product, bom, rawMat;

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

    warehouse = await Warehouse.create({
      code: 'WH-01',
      name: 'Central Warehouse',
      type: 'General',
      isActive: true,
    });

    rawMat = await Material.create({
      code: 'RM-01',
      name: 'Base Compound',
      type: 'Raw Material',
      unit: 'kg',
      isActive: true,
    });

    product = await Material.create({
      code: 'FG-01',
      name: 'Finished Widget',
      type: 'Finished',
      unit: 'pcs',
      isActive: true,
    });

    bom = await BOM.create({
      productId: product._id,
      bomNumber: 'BOM-01',
      batchSize: 1,
      batchUOM: 'pcs',
      status: 'Active',
      components: [
        { materialId: rawMat._id, quantity: 2, uom: 'kg' }
      ]
    });

    await InventoryItem.create({
      materialId: rawMat._id,
      warehouseId: warehouse._id,
      balance: 1000,
      onHand: 1000,
      reserved: 0,
    });
  });

  // Mock Express req/res
  const mockReqRes = (body = {}, params = {}, query = {}, user = { id: new mongoose.Types.ObjectId(), username: 'planner1' }) => {
    const req = { body, params, query, user, ip: '127.0.0.1' };
    const res = {
      statusCode: 200,
      jsonPayload: null,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.jsonPayload = data; return this; }
    };
    return { req, res };
  };

  test('Complete Plan Lifecycle: UNSCHEDULED -> SCHEDULED -> APPROVED -> RELEASED -> COMPLETED', async () => {
    // 1. Create Manual Plan (Status: UNSCHEDULED)
    const { req: createReq, res: createRes } = mockReqRes({
      productId: product._id,
      bomId: bom._id,
      quantity: 50,
      warehouseId: warehouse._id,
      priority: 'HIGH',
      requiredDate: new Date(Date.now() + 5 * 86400000),
    });

    await createManualPlan(createReq, createRes);
    expect(createRes.statusCode).toBe(201);
    expect(createRes.jsonPayload.success).toBe(true);

    const planId = createRes.jsonPayload.data._id;
    let plan = await ProductionPlan.findById(planId);
    expect(plan.status).toBe('UNSCHEDULED');
    expect(plan.priority).toBe('HIGH');
    expect(plan.planNumber).toMatch(/^PLAN-/);

    // 2. Schedule the Plan (Status: SCHEDULED)
    const { req: schedReq, res: schedRes } = mockReqRes({
      productionDate: new Date(Date.now() + 2 * 86400000),
      startTime: '08:00',
      endTime: '16:00',
      lineId: 'Line Alpha',
      estimatedDuration: 480,
    }, { id: planId });

    await scheduleProductionPlan(schedReq, schedRes);
    expect(schedRes.statusCode).toBe(200);
    plan = await ProductionPlan.findById(planId);
    expect(plan.status).toBe('SCHEDULED');
    expect(plan.workCenter).toBe('Line Alpha');

    // 3. Approve the Plan
    const { req: appReq, res: appRes } = mockReqRes({}, { id: planId });
    await approveProductionPlan(appReq, appRes);
    expect(appRes.statusCode).toBe(200);
    plan = await ProductionPlan.findById(planId);
    expect(plan.approvedBy).toBeDefined();

    // 4. Release the Plan -> Creates ProductionOrder (Status: RELEASED)
    const { req: relReq, res: relRes } = mockReqRes({}, { id: planId });
    await releaseProductionPlan(relReq, relRes);
    expect(relRes.statusCode).toBe(200);
    plan = await ProductionPlan.findById(planId);
    expect(plan.status).toBe('RELEASED');
    expect(plan.releasedProductionOrderId).toBeDefined();

    const order = await ProductionOrder.findById(plan.releasedProductionOrderId);
    expect(order).toBeDefined();
    expect(order.status).toBe('DRAFT');
    expect(order.targetQuantity).toBe(50);

    // 5. Complete the Plan (Status: COMPLETED)
    const { req: compReq, res: compRes } = mockReqRes({}, { id: planId });
    await completeProductionPlan(compReq, compRes);
    expect(compRes.statusCode).toBe(200);
    plan = await ProductionPlan.findById(planId);
    expect(plan.status).toBe('COMPLETED');
    expect(plan.completedAt).toBeDefined();
  });

  test('Hold and Cancel transitions operate correctly with audit history', async () => {
    // 1. Create Plan
    const { req: createReq, res: createRes } = mockReqRes({
      productId: product._id,
      bomId: bom._id,
      quantity: 20,
      warehouseId: warehouse._id,
    });
    await createManualPlan(createReq, createRes);
    const planId = createRes.jsonPayload.data._id;

    // 2. Put On Hold
    const { req: holdReq, res: holdRes } = mockReqRes({ reason: 'Waiting for line maintenance' }, { id: planId });
    await holdProductionPlan(holdReq, holdRes);
    expect(holdRes.statusCode).toBe(200);

    let plan = await ProductionPlan.findById(planId);
    expect(plan.status).toBe('ON_HOLD');

    // 3. Cancel Plan
    const { req: cancelReq, res: cancelRes } = mockReqRes({ reason: 'Customer cancelled demand' }, { id: planId });
    await cancelProductionPlan(cancelReq, cancelRes);
    expect(cancelRes.statusCode).toBe(200);

    plan = await ProductionPlan.findById(planId);
    expect(plan.status).toBe('CANCELLED');
    expect(plan.cancelReason).toBe('Customer cancelled demand');
    expect(plan.auditHistory.length).toBeGreaterThanOrEqual(3);
  });
});
