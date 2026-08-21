const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const Warehouse = require('../../../models/Warehouse');
const Site = require('../../../models/Site');
const UserAccessAssignment = require('../../../models/UserAccessAssignment');

describe('Access Control Suite 10: checkScope IDOR Defense & Scope Rosters', () => {
  let app;
  let adminUser, managerA, managerB, siteA, siteB, whA, whB;
  let adminToken, managerAToken, managerBToken;
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_access_scope_check';

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

    managerA = await User.create({
      username: `mgr_hyd_${suffix}`,
      email: `mgr_hyd_${suffix}@vms.com`,
      password: 'password123',
      role: 'Inventory Manager',
      accountStatus: 'Active',
      isVerified: true
    });

    managerB = await User.create({
      username: `mgr_del_${suffix}`,
      email: `mgr_del_${suffix}@vms.com`,
      password: 'password123',
      role: 'Inventory Manager',
      accountStatus: 'Active',
      isVerified: true
    });

    siteA = await Site.create({ name: `Hyderabad Plant ${suffix}`, code: `HYD-${suffix}`, status: 'Active' });
    siteB = await Site.create({ name: `Delhi Facility ${suffix}`, code: `DEL-${suffix}`, status: 'Active' });

    whA = await Warehouse.create({ name: `Hyd Warehouse ${suffix}`, code: `WH-HYD-${suffix}`, siteId: siteA._id, status: 'Active' });
    whB = await Warehouse.create({ name: `Delhi Warehouse ${suffix}`, code: `WH-DEL-${suffix}`, siteId: siteB._id, status: 'Active' });

    // Assign Manager A to Warehouse A only
    await UserAccessAssignment.create({
      userId: managerA._id,
      scopeType: 'warehouse',
      scopeId: whA._id,
      status: 'active',
      assignedBy: adminUser._id,
      reason: 'Manager A assignment'
    });

    // Assign Manager B to Warehouse B only
    await UserAccessAssignment.create({
      userId: managerB._id,
      scopeType: 'warehouse',
      scopeId: whB._id,
      status: 'active',
      assignedBy: adminUser._id,
      reason: 'Manager B assignment'
    });

    const adminLogin = await request(app).post('/api/auth/login').send({ email: adminUser.email, password: 'adminpassword' });
    adminToken = adminLogin.body.token;

    const mgrALogin = await request(app).post('/api/auth/login').send({ email: managerA.email, password: 'password123' });
    managerAToken = mgrALogin.body.token;

    const mgrBLogin = await request(app).post('/api/auth/login').send({ email: managerB.email, password: 'password123' });
    managerBToken = mgrBLogin.body.token;
  });

  test('1. Manager A can fetch scope users roster for their assigned Warehouse A', async () => {
    const res = await request(app)
      .get(`/api/access/scope/warehouse/${whA._id}/users`)
      .set('Authorization', `Bearer ${managerAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.users.length).toBeGreaterThanOrEqual(1);
    expect(res.body.users[0].userId._id.toString()).toBe(managerA._id.toString());
  });

  test('2. IDOR Defense: Manager A is blocked with 403 when requesting roster for unauthorized Warehouse B', async () => {
    const res = await request(app)
      .get(`/api/access/scope/warehouse/${whB._id}/users`)
      .set('Authorization', `Bearer ${managerAToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Access denied. You do not have an active assignment');
  });

  test('3. Global Admin can query roster for ANY facility without explicit assignment', async () => {
    const res = await request(app)
      .get(`/api/access/scope/warehouse/${whB._id}/users`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.users.length).toBe(1);
    expect(res.body.users[0].userId._id.toString()).toBe(managerB._id.toString());
  });
});
