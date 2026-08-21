const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const Site = require('../../../models/Site');
const UserAccessAssignment = require('../../../models/UserAccessAssignment');
const AuditLog = require('../../../models/AuditLog');

describe('Access Control Suite 3: Plant Tier & Access Level Downgrades', () => {
  let app;
  let adminUser, plantUser, plantSite;
  let adminToken;
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_access_downgrade';

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
    await UserAccessAssignment.deleteMany({}).catch(() => {});
    await mongoose.connection.collection('auditlogs').deleteMany({}).catch(() => {});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({}).catch(() => {});
    await Site.deleteMany({}).catch(() => {});
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

    plantUser = await User.create({
      username: `planttech_${suffix}`,
      email: `planttech_${suffix}@vms.com`,
      password: 'password123',
      role: 'Production Manager',
      accountStatus: 'Active',
      isVerified: true
    });

    plantSite = await Site.create({
      name: `Manufacturing Plant Beta ${suffix}`,
      code: `PLANT-BETA-${suffix}`,
      status: 'Active'
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: 'adminpassword' });
    adminToken = loginRes.body.token;
  });

  test('1. Assigning manufacturing plant access supports limited, permitted, and universal tiers', async () => {
    const res = await request(app)
      .post('/api/access/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: plantUser._id,
        scopeType: 'manufacturingPlant',
        scopeId: plantSite._id,
        accessLevel: 'universal',
        reason: 'Granted universal plant floor oversight'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.assignment.accessLevel).toBe('universal');
  });

  test('2. Downgrading access level updates assignment and creates audit record', async () => {
    // Initial universal assignment
    await request(app)
      .post('/api/access/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: plantUser._id,
        scopeType: 'manufacturingPlant',
        scopeId: plantSite._id,
        accessLevel: 'universal',
        reason: 'Universal tier'
      });

    // Downgrade to limited
    const downgradeRes = await request(app)
      .post('/api/access/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: plantUser._id,
        scopeType: 'manufacturingPlant',
        scopeId: plantSite._id,
        accessLevel: 'limited',
        reason: 'Downgraded to limited tier following policy change',
        replaceExisting: true
      });

    expect(downgradeRes.status).toBe(200);
    expect(downgradeRes.body.assignment.accessLevel).toBe('limited');

    const audit = await AuditLog.findOne({ entityType: 'UserAccessAssignment', action: 'ASSIGN_SCOPE' }).sort({ timestamp: -1 });
    expect(audit).not.toBeNull();
    expect(audit.reason).toContain('Downgraded to limited tier');
  });
});
