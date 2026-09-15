const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const Warehouse = require('../models/Warehouse');
const Site = require('../models/Site');
const ProductionPlan = require('../models/ProductionPlan');

let token;
let testUser;
let testSite;
let testWarehouse;
let testProduct;
let testBom;

jest.setTimeout(30000);

describe('PHASE 24: TEN-PLAN WORKFLOW VERIFICATION', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms_db');
    }

    testUser = await User.findOne({ email: 'admin@vms.com' });
    const jwt = require('jsonwebtoken');
    const getJwtSecret = require('../config/jwt');
    token = jwt.sign(
      { id: testUser._id, tokenVersion: testUser.tokenVersion || 0 },
      getJwtSecret(),
      { expiresIn: '1d' }
    );

    testSite = await Site.findOne() || await Site.create({ code: 'S-100', name: 'Site 100', status: 'Active' });
    testWarehouse = await Warehouse.findOne({ code: 'WH-01' }) || await Warehouse.create({ code: 'WH-01', name: 'WH 01', siteId: testSite._id });
    testProduct = await Material.findOne({ type: 'Finished' }) || await Material.create({ code: 'FG-100', name: 'Finished FG-100', type: 'Finished', unit: 'pcs' });
    testBom = await BOM.findOne({ productId: testProduct._id }) || await BOM.create({ productId: testProduct._id, bomNumber: 'BOM-100', batchSize: 1, batchUOM: 'pcs' });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it('Verifies 10 plans created -> 1 scheduled & executed -> 9 remaining pending plans in MongoDB', async () => {
    // 1. Clean previous test plans
    await ProductionPlan.deleteMany({ notes: 'Ten-Plan Batch Test' });

    // 2. Create 10 production plans
    const planIds = [];
    for (let i = 1; i <= 10; i++) {
      const res = await request(app)
        .post('/api/production-plans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: testProduct._id,
          bomId: testBom._id,
          warehouseId: testWarehouse._id,
          quantity: 50 * i,
          requiredDate: new Date(Date.now() + i * 86400000).toISOString(),
          status: 'Unscheduled',
          notes: 'Ten-Plan Batch Test'
        });

      expect(res.statusCode).toEqual(201);
      planIds.push(res.body.data._id);
    }

    // Assert initial state: 10 pending plans
    let allTestPlans = await ProductionPlan.find({ notes: 'Ten-Plan Batch Test' });
    expect(allTestPlans.length).toEqual(10);
    const initialUnscheduled = allTestPlans.filter(p => p.status === 'Unscheduled');
    expect(initialUnscheduled.length).toEqual(10);

    // 3. Schedule 1 plan (Plan #1)
    const targetPlanId = planIds[0];
    const schedRes = await request(app)
      .post(`/api/production-plans/${targetPlanId}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 50 });

    expect(schedRes.statusCode).toEqual(200);
    expect(schedRes.body.data.status).toEqual('Scheduled');

    // 4. Assert DB state: 1 Scheduled/Executed, 9 Remaining Unscheduled
    allTestPlans = await ProductionPlan.find({ notes: 'Ten-Plan Batch Test' });
    const scheduledPlans = allTestPlans.filter(p => p.status === 'Scheduled');
    const remainingUnscheduledPlans = allTestPlans.filter(p => p.status === 'Unscheduled');

    expect(scheduledPlans.length).toEqual(1);
    expect(remainingUnscheduledPlans.length).toEqual(9);
    expect(allTestPlans.length).toEqual(10);
  });
});
