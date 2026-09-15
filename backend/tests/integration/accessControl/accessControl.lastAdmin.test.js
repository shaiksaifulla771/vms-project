const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const accessControlService = require('../../../services/accessControlService');

describe('Access Control Suite 6: Server-Side Last-Admin Protection Guard', () => {
  let app;
  let soleAdmin;
  let adminToken;
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_access_last_admin';

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
    soleAdmin = await User.create({
      username: `root_admin_${suffix}`,
      email: `root_${suffix}@vms.com`,
      password: 'adminpassword',
      role: 'Admin',
      accountStatus: 'ACTIVE',
      isVerified: true
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: soleAdmin.email, password: 'adminpassword' });
    adminToken = loginRes.body.token;
  });

  test('1. Attempting to bulk-deactivate the sole remaining Admin throws error and blocks operation', async () => {
    const res = await request(app)
      .post('/api/access/bulk-deactivate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userIds: [soleAdmin._id],
        confirm: true,
        reason: 'Attempted deactivation of sole admin'
      });

    expect(res.status).toBe(200);
    expect(res.body.successful).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.details[0].error).toContain('Cannot de-escalate, suspend, or deactivate the sole remaining Administrator');

    const adminCheck = await User.findById(soleAdmin._id);
    expect(adminCheck.accountStatus).toBe('ACTIVE');
  });

  test('2. Direct service guard assertNotLastAdmin blocks demoting sole admin to Viewer', async () => {
    await expect(
      accessControlService.assertNotLastAdmin(soleAdmin._id, 'Viewer', 'ACTIVE')
    ).rejects.toThrow('Cannot de-escalate, suspend, or deactivate the sole remaining Administrator');
  });
});
