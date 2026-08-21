const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/User');
const PendingRegistration = require('../../models/PendingRegistration');

describe('Session 7 — Auth Integration Test Suite (JWT 15m, Refresh Cookie, Revocation)', () => {
  let app;
  const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vms_test_auth_integration';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'super-secret-key-32-chars-long-12345';
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_URI);
    app = require('../../app');
  });

  afterAll(async () => {
    await User.deleteMany({});
    await PendingRegistration.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await PendingRegistration.deleteMany({});
  });

  test('1. Full Lifecycle: Register -> Verify OTP -> Admin Approve -> Login -> Refresh -> Revoke', async () => {
    const adminUser = await User.create({
      username: 'adminuser',
      email: 'admin@vms.com',
      password: 'adminpassword',
      role: 'Admin',
      accountStatus: 'Active',
      isVerified: true
    });

    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@vms.com', password: 'adminpassword' });

    const adminToken = adminLoginRes.body.token;

    // 1. Register User
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'testuser',
        email: 'testuser@vms.com',
        password: 'password123',
        role: 'Inventory Manager'
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body.success).toBe(true);

    expect(await User.findOne({ email: 'testuser@vms.com' })).toBeNull();

    // Fetch pending registration from DB to obtain OTP
    const pending = await PendingRegistration.findOne({ email: 'testuser@vms.com' });
    expect(pending).toBeDefined();
    expect(pending.otp).toBeDefined();
    expect(pending.otp).toMatch(/^\d{4}$/);

    // 2. Verify OTP. This creates a pending user, not an active session.
    const otpRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        email: 'testuser@vms.com',
        otp: pending.otp
      });

    expect(otpRes.status).toBe(200);
    expect(otpRes.body.token).toBeUndefined();
    expect(otpRes.body.user.accountStatus.toUpperCase()).toBe('PENDING');

    let userInDb = await User.findOne({ email: 'testuser@vms.com' });
    expect(userInDb).toBeDefined();
    expect(userInDb.isVerified).toBe(true);
    expect(userInDb.accountStatus.toUpperCase()).toBe('PENDING');

    // 3. Login is blocked until Admin approval
    const blockedLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'testuser@vms.com',
        password: 'password123'
      });

    expect(blockedLoginRes.status).toBe(403);

    const approveRes = await request(app)
      .put(`/api/users/${userInDb._id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(approveRes.status).toBe(200);

    // 4. Login works after approval
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'testuser@vms.com',
        password: 'password123'
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();

    const accessToken = loginRes.body.token;
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some(c => c.includes('refreshToken='))).toBe(true);

    // Extract refreshToken cookie for refresh test
    const refreshCookie = cookies.find(c => c.includes('refreshToken='));

    // 5. Test Access Protected Route (/api/auth/me)
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('testuser@vms.com');

    // 6. Refresh Token
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [refreshCookie]);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.token).toBeDefined();
    const newAccessToken = refreshRes.body.token;

    const revokeRes = await request(app)
      .post(`/api/auth/revoke/${userInDb._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(revokeRes.status).toBe(200);

    // 8. Attempt request with revoked user's access token -> MUST be rejected (401)
    const revokedAccessRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${newAccessToken}`);

    expect(revokedAccessRes.status).toBe(401);
    expect(revokedAccessRes.body.error).toMatch(/Token (has been )?revoked/i);
  });
});
