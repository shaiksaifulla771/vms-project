const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const Site = require('../../../models/Site');
const Warehouse = require('../../../models/Warehouse');
const UserAccessAssignment = require('../../../models/UserAccessAssignment');

describe('Access Control Suite 1: assignScope & Duplicate Detection', () => {
  let app;
  let adminUser, testUser, site, warehouse;
  let adminToken;
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_access_assign';

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
    await Site.deleteMany({}).catch(() => {});
    await Warehouse.deleteMany({}).catch(() => {});
    await UserAccessAssignment.deleteMany({}).catch(() => {});
    await mongoose.connection.collection('auditlogs').deleteMany({}).catch(() => {});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({}).catch(() => {});
    await Site.deleteMany({}).catch(() => {});
    await Warehouse.deleteMany({}).catch(() => {});
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

    testUser = await User.create({
      username: `op1_${suffix}`,
      email: `op1_${suffix}@vms.com`,
      password: 'password123',
      role: 'Inventory Manager',
      accountStatus: 'Active',
      isVerified: true
    });

    site = await Site.create({
      name: `Hyd Plant ${suffix}`,
      code: `HYD-${suffix}`,
      status: 'Active'
    });

    warehouse = await Warehouse.create({
      name: `Hyd Central WH ${suffix}`,
      code: `WH-HYD-${suffix}`,
      siteId: site._id,
      status: 'Active'
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: 'adminpassword' });
    adminToken = loginRes.body.token;
  });

  test('1. Admin can assign site scope to a user with valid justification', async () => {
    const res = await request(app)
      .post('/api/access/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: testUser._id,
        scopeType: 'site',
        scopeId: site._id,
        reason: 'Authorized for Hyderabad plant oversight'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.duplicate).toBe(false);
    expect(res.body.assignment.scopeType).toBe('site');
    expect(res.body.assignment.status).toBe('active');

    const created = await UserAccessAssignment.findOne({ userId: testUser._id, scopeType: 'site' });
    expect(created).not.toBeNull();
    expect(created.status).toBe('active');
  });

  test('2. Attempting to assign same scope again detects duplicate and prompts without overwrite', async () => {
    // First assignment
    await request(app)
      .post('/api/access/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: testUser._id,
        scopeType: 'site',
        scopeId: site._id,
        reason: 'Initial assignment'
      });

    // Duplicate assignment without replaceExisting flag
    const dupRes = await request(app)
      .post('/api/access/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: testUser._id,
        scopeType: 'site',
        scopeId: site._id,
        reason: 'Second assignment attempt'
      });

    expect(dupRes.status).toBe(200);
    expect(dupRes.body.duplicate).toBe(true);
    expect(dupRes.body.message).toContain('already has an active assignment');
  });

  test('3. Replace assignment deactivates previous assignment and creates new one', async () => {
    // First assignment
    const firstRes = await request(app)
      .post('/api/access/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: testUser._id,
        scopeType: 'site',
        scopeId: site._id,
        reason: 'Initial assignment'
      });
    const firstId = firstRes.body.assignment._id;

    // Replace assignment
    const replaceRes = await request(app)
      .post('/api/access/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: testUser._id,
        scopeType: 'site',
        scopeId: site._id,
        reason: 'Replaced with extended validity',
        replaceExisting: true
      });

    expect(replaceRes.status).toBe(200);
    expect(replaceRes.body.duplicate).toBe(false);

    const oldDoc = await UserAccessAssignment.findById(firstId);
    expect(oldDoc.status).toBe('inactive');

    const activeAssignments = await UserAccessAssignment.find({ userId: testUser._id, status: 'active' });
    expect(activeAssignments.length).toBe(1);
    expect(activeAssignments[0]._id.toString()).toBe(replaceRes.body.assignment._id.toString());
  });
});
