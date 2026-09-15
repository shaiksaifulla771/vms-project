const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const { invalidateUserStatusCache } = require('../../../middleware/authMiddleware');

describe('Access Control Suite 5: Live Status Verification & Cache Invalidation', () => {
  let app;
  let adminUser, activeUser;
  let userToken;
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_access_revocation';

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

    activeUser = await User.create({
      username: `staff_${suffix}`,
      email: `staff_${suffix}@vms.com`,
      password: 'password123',
      role: 'Viewer',
      accountStatus: 'ACTIVE',
      approvalStatus: 'APPROVED',
      isVerified: true
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: activeUser.email, password: 'password123' });
    userToken = loginRes.body.token;
  });

  test('1. Active user can query protected endpoints', async () => {
    const res = await request(app)
      .get(`/api/access/user/${activeUser._id}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('2. Mid-session deactivation and cache invalidation immediately denies access with 403', async () => {
    // 1. Initial request populates status cache
    await request(app)
      .get(`/api/access/user/${activeUser._id}`)
      .set('Authorization', `Bearer ${userToken}`);

    // 2. Admin deactivates user in DB and invalidates cache
    await User.findByIdAndUpdate(activeUser._id, { accountStatus: 'DEACTIVATED' });
    invalidateUserStatusCache(activeUser._id);

    // 3. User attempts subsequent request with valid unexpired JWT
    const postDeactivationRes = await request(app)
      .get(`/api/access/user/${activeUser._id}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(postDeactivationRes.status).toBe(403);
    expect(postDeactivationRes.body.error).toContain('Account has been deactivated');
  });
});
