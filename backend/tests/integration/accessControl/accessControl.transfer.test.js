const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const Site = require('../../../models/Site');
const Warehouse = require('../../../models/Warehouse');
const UserAccessAssignment = require('../../../models/UserAccessAssignment');
const Notification = require('../../../models/Notification');

describe('Access Control Suite 2: transferScope & Concurrency Collision', () => {
  let app;
  let adminUser, userA, userB, warehouse;
  let adminToken;
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_access_transfer';

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
    await Notification.deleteMany({}).catch(() => {});
    await mongoose.connection.collection('auditlogs').deleteMany({}).catch(() => {});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({}).catch(() => {});
    await Site.deleteMany({}).catch(() => {});
    await Warehouse.deleteMany({}).catch(() => {});
    await UserAccessAssignment.deleteMany({}).catch(() => {});
    await Notification.deleteMany({}).catch(() => {});
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

    userA = await User.create({
      username: `opA_${suffix}`,
      email: `opA_${suffix}@vms.com`,
      password: 'password123',
      role: 'Inventory Manager',
      accountStatus: 'Active',
      isVerified: true
    });

    userB = await User.create({
      username: `opB_${suffix}`,
      email: `opB_${suffix}@vms.com`,
      password: 'password123',
      role: 'Inventory Manager',
      accountStatus: 'Active',
      isVerified: true
    });

    warehouse = await Warehouse.create({
      name: `Hyd WH Alpha ${suffix}`,
      code: `WH-ALPHA-${suffix}`,
      status: 'Active'
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: 'adminpassword' });
    adminToken = loginRes.body.token;
  });

  test('1. Transfer scope atomically deactivates source and creates destination assignment linked by transferId', async () => {
    const originalAssignment = await UserAccessAssignment.create({
      userId: userA._id,
      scopeType: 'warehouse',
      scopeId: warehouse._id,
      status: 'active',
      assignedBy: adminUser._id,
      reason: 'Initial assignment to Operator A'
    });

    const res = await request(app)
      .post('/api/access/transfer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fromAssignmentId: originalAssignment._id,
        toUserId: userB._id,
        reason: 'Shift handover to Operator B'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const sourceUpdated = await UserAccessAssignment.findById(originalAssignment._id);
    expect(sourceUpdated.status).toBe('transferred');
    expect(sourceUpdated.transferId).not.toBeNull();

    const destDoc = await UserAccessAssignment.findById(res.body.assignment._id);
    expect(destDoc.status).toBe('active');
    expect(destDoc.userId.toString()).toBe(userB._id.toString());
    expect(destDoc.transferId.toString()).toBe(originalAssignment._id.toString());
  });

  test('2. Concurrency collision: Transferring an already transferred/inactive assignment returns 409 Conflict', async () => {
    const originalAssignment = await UserAccessAssignment.create({
      userId: userA._id,
      scopeType: 'warehouse',
      scopeId: warehouse._id,
      status: 'active',
      assignedBy: adminUser._id,
      reason: 'Initial assignment to Operator A'
    });

    // First transfer succeeds
    const res1 = await request(app)
      .post('/api/access/transfer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fromAssignmentId: originalAssignment._id,
        toUserId: userB._id,
        reason: 'First transfer attempt'
      });
    expect(res1.status).toBe(200);

    // Second simultaneous/subsequent transfer attempt on the same assignment returns 409 Conflict
    const res2 = await request(app)
      .post('/api/access/transfer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fromAssignmentId: originalAssignment._id,
        toUserId: userB._id,
        reason: 'Second transfer attempt'
      });
    expect(res2.status).toBe(409);
    expect(res2.body.error).toContain('Conflict');
  });
});
