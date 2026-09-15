const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const emailService = require('../../../services/emailService');

describe('Access Control Suite 12: Transaction Decoupled Email Resilience', () => {
  let app;
  let adminUser, pendingApplicant;
  let adminToken;
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_access_tx_email';

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

    pendingApplicant = await User.create({
      username: `applicant_${suffix}`,
      email: `applicant_${suffix}@vms.com`,
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

  test('1. Registration approval succeeds and commits to DB even if email dispatch fails', async () => {
    const emailSpy = jest.spyOn(emailService, 'sendEmail').mockRejectedValueOnce(new Error('SMTP Connection Timeout: 504 Gateway Timeout'));

    const res = await request(app)
      .post('/api/access/approvals/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: pendingApplicant._id,
        role: 'Inventory Manager',
        reason: 'Approved applicant'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const userInDb = await User.findById(pendingApplicant._id);
    expect(userInDb.approvalStatus).toBe('APPROVED');
    expect(userInDb.accountStatus).toBe('ACTIVE');
    expect(userInDb.role).toBe('Inventory Manager');

    emailSpy.mockRestore();
  });
});
