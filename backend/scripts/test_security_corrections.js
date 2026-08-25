const request = require('supertest');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = require('../app');
const connectDB = require('../config/db');
const User = require('../models/User');
const EmailQueue = require('../models/EmailQueue');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function testSecurityCorrections() {
  console.log('================================================================');
  console.log('    TEST: 3 SECURITY CORRECTIONS (TOKEN ONLY, ENUMERATION, RATE-LIMIT) ');
  console.log('================================================================\n');

  await connectDB();

  const testEmail = `sec.user.${Date.now()}@vms-demo.com`;
  const initialPassword = 'InitialPassword@123';
  const newPassword = 'NewSecurePassword@2026';

  try {
    // Setup test user in database
    console.log('[SETUP] Creating verified active user for password reset test...');
    const user = await User.create({
      username: 'Security Test User',
      email: testEmail,
      password: initialPassword,
      role: 'Viewer',
      accountStatus: 'ACTIVE',
      isVerified: true,
      emailVerified: true
    });
    console.log(`  ✓ User created: ${testEmail}`);

    // -------------------------------------------------------------
    // TEST 1: Account Enumeration Protection (Requirement 2)
    // -------------------------------------------------------------
    console.log('\n[TEST 1] Testing Account Enumeration Defense...');
    
    // Non-existent email
    const nonExistentRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nonexistent.random.user.999@vms-demo.com' });

    console.log('  Non-existent email response:', nonExistentRes.body);
    if (nonExistentRes.body.message !== 'If an account exists for this email, a reset link has been sent.') {
      throw new Error('Account enumeration leakage on non-existent email!');
    }

    // Existing email
    const existingRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: testEmail });

    console.log('  Existing email response:', existingRes.body);
    if (existingRes.body.message !== 'If an account exists for this email, a reset link has been sent.') {
      throw new Error('Account enumeration leakage on existing email!');
    }
    console.log('  ✓ PASSED: Identical generic response returned regardless of account existence.');

    // -------------------------------------------------------------
    // TEST 2: Backend Cooldown Enforcement (Requirement 3)
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Testing Backend 60-Second Cooldown Enforcement...');
    // Immediate second request
    const countBefore = await EmailQueue.countDocuments({ recipient: testEmail });
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: testEmail });
    const countAfter = await EmailQueue.countDocuments({ recipient: testEmail });

    if (countAfter !== countBefore) {
      throw new Error('Cooldown failed: Duplicate email was queued during 60s cooldown period!');
    }
    console.log('  ✓ PASSED: Backend cooldown prevented duplicate email dispatch during 60s window.');

    // -------------------------------------------------------------
    // TEST 3: Token-Only Reset URL (Requirement 1)
    // -------------------------------------------------------------
    console.log('\n[TEST 3] Inspecting Queued Reset Email URL format...');
    const queuedEmail = await EmailQueue.findOne({ recipient: testEmail }).sort({ createdAt: -1 });
    if (!queuedEmail) {
      throw new Error('No password reset email queued for test user!');
    }

    const resetLinkMatch = queuedEmail.textBody.match(/http:\/\/localhost:3000\/reset-password\S+/);
    if (!resetLinkMatch) {
      throw new Error('Reset password URL not found in queued email textBody!');
    }
    const resetUrl = resetLinkMatch[0];
    console.log('  Queued Reset URL:', resetUrl);

    if (resetUrl.includes('email=')) {
      throw new Error('VIOLATION: Email found in password reset URL!');
    }
    if (!resetUrl.includes('token=')) {
      throw new Error('VIOLATION: Token missing from password reset URL!');
    }
    console.log('  ✓ PASSED: Reset URL contains token ONLY without leaking email in query params.');

    // Extract token from URL
    const tokenMatch = resetUrl.match(/token=([a-f0-9]+)/);
    if (!tokenMatch) {
      throw new Error('Failed to extract hex token from reset URL!');
    }
    const rawToken = tokenMatch[1];

    // -------------------------------------------------------------
    // TEST 4: Token-Only Password Reset & Login Verification
    // -------------------------------------------------------------
    console.log('\n[TEST 4] Resetting password with token alone (no email in payload)...');
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: rawToken,
        newPassword: newPassword
      });

    console.log('  Reset Password Response:', resetRes.body);
    if (!resetRes.body.success) {
      throw new Error(`Reset password failed: ${resetRes.body.error}`);
    }
    console.log('  ✓ PASSED: Password reset successfully using token alone.');

    // Verify user can now log in with new password
    console.log('\n[TEST 5] Logging in with new password...');
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: newPassword
      });

    if (loginRes.status !== 200 || !loginRes.body.token) {
      throw new Error(`Login with new password failed: ${JSON.stringify(loginRes.body)}`);
    }
    console.log('  ✓ PASSED: Login with new password succeeded! JWT token issued.');

    // Verify old token is invalidated
    console.log('\n[TEST 6] Verifying expired/used token cannot be reused...');
    const reuseRes = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: rawToken,
        newPassword: 'AnotherPassword@123'
      });

    if (reuseRes.status === 200) {
      throw new Error('Security Violation: Used reset token was allowed to be reused!');
    }
    console.log('  ✓ PASSED: Replay attack blocked. Used reset token invalidated.');

    // Cleanup
    await User.deleteOne({ _id: user._id });
    await EmailQueue.deleteMany({ recipient: testEmail });
    console.log('\n[CLEANUP] Test artifacts removed.');

    console.log('\n================================================================');
    console.log('🎉 ALL 3 SECURITY CORRECTIONS PASSED WITH 100% SUCCESS!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ [TEST FAILURE]:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

testSecurityCorrections();
