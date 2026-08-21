const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const Warehouse = require('../../../models/Warehouse');
const Site = require('../../../models/Site');
const Material = require('../../../models/Material');
const StockTransfer = require('../../../models/StockTransfer');
const ProductionOrder = require('../../../models/ProductionOrder');
const UserAccessAssignment = require('../../../models/UserAccessAssignment');

describe('Access Control Suite 7: In-Flight Work Unlink Guard', () => {
  let app;
  let adminUser, operatorUser, warehouse, site, material;
  let adminToken;
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_access_unlink';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'super-secret-key-32-chars-long-12345';
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_URI);
    app = require('../../../app');
  });

  afterAll(async () => {
    await User.deleteMany({}).catch(() => {});
    await Warehouse.deleteMany({}).catch(() => {});
    await Site.deleteMany({}).catch(() => {});
    await Material.deleteMany({}).catch(() => {});
    await StockTransfer.deleteMany({}).catch(() => {});
    await ProductionOrder.deleteMany({}).catch(() => {});
    await UserAccessAssignment.deleteMany({}).catch(() => {});
    await mongoose.connection.collection('auditlogs').deleteMany({}).catch(() => {});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({}).catch(() => {});
    await Warehouse.deleteMany({}).catch(() => {});
    await Site.deleteMany({}).catch(() => {});
    await Material.deleteMany({}).catch(() => {});
    await StockTransfer.deleteMany({}).catch(() => {});
    await ProductionOrder.deleteMany({}).catch(() => {});
    await UserAccessAssignment.deleteMany({}).catch(() => {});
    await mongoose.connection.collection('auditlogs').deleteMany({}).catch(() => {});

    const suffix = Date.now() + Math.floor(Math.random() * 1000);
    adminUser = await User.create({
      username: `admin_${suffix}`,
      email: `admin_${suffix}@vms.com`,
      password: 'adminpassword',
      role: 'Admin',
      accountStatus: 'Active',
      isVerified: true
    });

    operatorUser = await User.create({
      username: `wh_op_${suffix}`,
      email: `wh_op_${suffix}@vms.com`,
      password: 'password123',
      role: 'Inventory Manager',
      accountStatus: 'Active',
      isVerified: true
    });

    site = await Site.create({
      name: `Chennai Facility ${suffix}`,
      code: `CHN-${suffix}`,
      status: 'Active'
    });

    warehouse = await Warehouse.create({
      name: `Chennai Central WH ${suffix}`,
      code: `WH-CHN-${suffix}`,
      siteId: site._id,
      status: 'Active'
    });

    material = await Material.create({
      code: `MAT-${suffix}`,
      name: 'Test Raw Material',
      category: 'Raw Materials',
      unit: 'pcs'
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: 'adminpassword' });
    adminToken = loginRes.body.token;
  });

  test('1. Unlink is blocked when user owns in-flight stock transfer at the warehouse', async () => {
    const assignment = await UserAccessAssignment.create({
      userId: operatorUser._id,
      scopeType: 'warehouse',
      scopeId: warehouse._id,
      status: 'active',
      assignedBy: adminUser._id,
      reason: 'Assigned to warehouse'
    });

    const suffix = Date.now() + Math.floor(Math.random() * 1000);
    // Create an in-flight stock transfer created by this user
    await StockTransfer.create({
      transferNumber: `TR-TEST-${suffix}`,
      fromWarehouseId: warehouse._id,
      toWarehouseId: warehouse._id,
      materialId: material._id,
      quantity: 10,
      reason: 'Shift stock replenishment',
      createdBy: operatorUser._id,
      status: 'In Transit'
    });

    const res = await request(app)
      .post('/api/access/unlink')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        assignmentId: assignment._id,
        reason: 'Attempting to unlink'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot unlink user: 1 in-flight stock transfer(s)');

    const doc = await UserAccessAssignment.findById(assignment._id);
    expect(doc.status).toBe('active');
  });

  test('2. Unlink succeeds when there is no in-flight work', async () => {
    const assignment = await UserAccessAssignment.create({
      userId: operatorUser._id,
      scopeType: 'warehouse',
      scopeId: warehouse._id,
      status: 'active',
      assignedBy: adminUser._id,
      reason: 'Assigned to warehouse'
    });

    const res = await request(app)
      .post('/api/access/unlink')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        assignmentId: assignment._id,
        reason: 'Operator reassigned to different territory'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const doc = await UserAccessAssignment.findById(assignment._id);
    expect(doc.status).toBe('inactive');
  });
});
