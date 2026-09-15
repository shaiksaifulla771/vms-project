const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const AuditLog = require('../../../models/AuditLog');

describe('Access Control Suite 4: Registration Rejection Lifecycle', () => {
  let app;
  let adminUser, pendingUser;
  let adminToken;
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_access_reject';

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
    await mongoose.connection.collection('auditlogs').deleteMany({}).catch(() => {});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({}).catch(() => {});
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

    pendingUser = await User.create({
      username: `untrusted_${suffix}`,
      email: `untrusted_${suffix}@external.com`,
      password: 'password123',
      role: 'Viewer',
      requestedRole: 'Inventory Manager',
      accountStatus: 'PENDING',
      approvalStatus: 'PENDING',
      isVerified: true
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: 'adminpassword' });
    adminToken = loginRes.body.token;
  });

  test('1. Rejecting registration requires mandatory reason and sets status to REJECTED', async () => {
    // Missing reason should fail
    const failRes = await request(app)
      .post('/api/access/approvals/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: pendingUser._id,
        reason: ''
      });
    expect(failRes.status).toBe(400);

    // Valid rejection with reason
    const successRes = await request(app)
      .post('/api/access/approvals/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: pendingUser._id,
        reason: 'Unverified external contractor identity'
      });

    expect(successRes.status).toBe(200);
    expect(successRes.body.success).toBe(true);

    const updated = await User.findById(pendingUser._id);
    expect(updated.approvalStatus).toBe('REJECTED');
    expect(updated.accountStatus).toBe('REJECTED');
    expect(updated.rejectionReason).toBe('Unverified external contractor identity');

    const audit = await AuditLog.findOne({ entityType: 'User', action: 'REJECT_REGISTRATION' });
    expect(audit).not.toBeNull();
    expect(audit.reason).toContain('Unverified external contractor');
  });
});
