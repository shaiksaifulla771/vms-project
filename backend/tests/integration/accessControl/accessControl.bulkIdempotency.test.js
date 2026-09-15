const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const Site = require('../../../models/Site');
const IdempotencyKey = require('../../../models/IdempotencyKey');
const UserAccessAssignment = require('../../../models/UserAccessAssignment');

describe('Access Control Suite 11: Bulk Operations & Idempotency Header', () => {
  let app;
  let adminUser, site;
  let adminToken;
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_access_bulk_idempotency';

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
    await IdempotencyKey.deleteMany({}).catch(() => {});
    await UserAccessAssignment.deleteMany({}).catch(() => {});
    await mongoose.connection.collection('auditlogs').deleteMany({}).catch(() => {});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({}).catch(() => {});
    await Site.deleteMany({}).catch(() => {});
    await IdempotencyKey.deleteMany({}).catch(() => {});
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

    site = await Site.create({ name: `Mumbai Plant ${suffix}`, code: `MUM-${suffix}`, status: 'Active' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: 'adminpassword' });
    adminToken = loginRes.body.token;
  });

  test('1. Bulk operations reject requests exceeding 100 items with 400 Bad Request', async () => {
    const oversizedArray = Array.from({ length: 101 }, (_, i) => ({
      userId: new mongoose.Types.ObjectId(),
      scopeType: 'site',
      scopeId: site._id
    }));

    const res = await request(app)
      .post('/api/access/bulk-assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: oversizedArray });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Maximum 100 items permitted');
  });

  test('2. Re-submitting request with Idempotency-Key returns cached response without duplicate side-effects', async () => {
    const suffix = Date.now() + Math.floor(Math.random() * 1000);
    const userToAssign = await User.create({
      username: `bulk_target_${suffix}`,
      email: `target_${suffix}@vms.com`,
      password: 'password123',
      role: 'Viewer',
      accountStatus: 'Active',
      isVerified: true
    });

    const idempotencyKey = `idem-key-test-${Date.now()}-${Math.random()}`;

    // First bulk assign execution
    const res1 = await request(app)
      .post('/api/access/bulk-assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        items: [{
          userId: userToAssign._id,
          scopeType: 'site',
          scopeId: site._id,
          reason: 'Bulk onboarding'
        }]
      });

    expect(res1.status).toBe(200);
    expect(res1.body.successful).toBe(1);

    // Second bulk assign execution with identical Idempotency-Key
    const res2 = await request(app)
      .post('/api/access/bulk-assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        items: [{
          userId: userToAssign._id,
          scopeType: 'site',
          scopeId: site._id,
          reason: 'Bulk onboarding'
        }]
      });

    expect(res2.status).toBe(200);
    expect(res2.body.successful).toBe(1);

    // Assert only ONE assignment record exists in DB
    const assignments = await UserAccessAssignment.find({ userId: userToAssign._id, status: 'active' });
    expect(assignments.length).toBe(1);
  });
});
