const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const Notification = require('../../../models/Notification');

describe('Access Control Suite 9: Admin Notification Isolation', () => {
  let app;
  let adminUser, nonAdminUser;
  let adminToken, nonAdminToken;
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_access_notifications';

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
    await Notification.deleteMany({}).catch(() => {});
    await mongoose.connection.collection('auditlogs').deleteMany({}).catch(() => {});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({}).catch(() => {});
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

    nonAdminUser = await User.create({
      username: `viewer_${suffix}`,
      email: `viewer_${suffix}@vms.com`,
      password: 'password123',
      role: 'Viewer',
      accountStatus: 'Active',
      isVerified: true
    });

    await Notification.create({
      recipientRole: 'admin',
      type: 'pending_approval',
      message: 'New user registration pending approval',
      severity: 'info'
    });

    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: 'adminpassword' });
    adminToken = adminLoginRes.body.token;

    const nonAdminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: nonAdminUser.email, password: 'password123' });
    nonAdminToken = nonAdminLoginRes.body.token;
  });

  test('1. Non-admin caller is blocked from /api/access/notifications with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/access/notifications')
      .set('Authorization', `Bearer ${nonAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('do not have permission');
  });

  test('2. Admin caller retrieves admin notifications successfully', async () => {
    const res = await request(app)
      .get('/api/access/notifications')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.notifications.length).toBeGreaterThanOrEqual(1);
    expect(res.body.notifications[0].recipientRole).toBe('admin');
  });
});
