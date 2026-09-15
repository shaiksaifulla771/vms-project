const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const request = require('supertest');
const app = require('../app');
const firebaseAdminModule = require('../config/firebaseAdmin');
const User = require('../models/User');
const mongoose = require('mongoose');

async function runPhase4Tests() {
  console.log('--- EXECUTING PHASE 4 MANDATORY EMAIL VERIFICATION TEST SUITE ---');

  // Connect to MongoDB
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const authTarget = firebaseAdminModule.auth || firebaseAdminModule.admin.auth();
  const originalVerifyIdToken = authTarget.verifyIdToken;

  const testUid = 'phase4_email_uid_' + Date.now();
  const testEmail = 'phase4_user_' + Date.now() + '@example.com';
  let testUser = null;

  try {
    // Setup test user in MongoDB
    testUser = await User.create({
      firebaseUid: testUid,
      username: 'Phase4 Email User',
      email: testEmail,
      role: 'Viewer',
      accountStatus: 'PENDING',
      emailVerified: false
    });

    // SCENARIO 1: Unverified Firebase Token (email_verified = false) -> 403 Forbidden
    console.log('1. Testing Unverified Firebase Token (email_verified = false)...');
    {
      authTarget.verifyIdToken = async () => ({
        uid: testUid,
        email: testEmail,
        email_verified: false
      });

      const res = await request(app)
        .get('/api/materials')
        .set('Authorization', 'Bearer mock_unverified_token');

      if (res.status !== 403 || !res.body.error.includes('Email verification required')) {
        throw new Error(`Scenario 1 failed: Expected 403 Email verification required, got ${res.status} ${JSON.stringify(res.body)}`);
      }
      console.log('   [PASS] 403 Forbidden enforced for unverified Firebase email');
    }

    // SCENARIO 2: Verified Firebase Token + PENDING Account Status -> 403 Forbidden (Account Status)
    console.log('2. Testing Verified Email + PENDING Account Status...');
    {
      authTarget.verifyIdToken = async () => ({
        uid: testUid,
        email: testEmail,
        email_verified: true
      });

      const res = await request(app)
        .get('/api/materials')
        .set('Authorization', 'Bearer mock_verified_token');

      if (res.status !== 403 || !res.body.error.includes('PENDING')) {
        throw new Error(`Scenario 2 failed: Expected 403 PENDING account status forbidden, got ${res.status} ${JSON.stringify(res.body)}`);
      }
      console.log('   [PASS] 403 Forbidden: Email verification passes, but PENDING account status correctly blocks access');
    }

    // SCENARIO 3: MongoDB emailVerified Synchronization Check
    console.log('3. Testing MongoDB emailVerified Synchronization...');
    {
      const updatedUser = await User.findById(testUser._id);
      if (!updatedUser.emailVerified) {
        throw new Error('Scenario 3 failed: MongoDB user emailVerified was not updated to true upon token verification');
      }
      console.log('   [PASS] MongoDB user.emailVerified successfully synchronized to true');
    }

    // SCENARIO 4: Verified Email + ACTIVE Account Status -> Access Granted
    console.log('4. Testing Verified Email + ACTIVE Account Status -> Access Granted...');
    {
      testUser.accountStatus = 'ACTIVE';
      await testUser.save();

      const res = await request(app)
        .get('/api/materials')
        .set('Authorization', 'Bearer mock_verified_token');

      if (res.status !== 200 || !res.body.success) {
        throw new Error(`Scenario 4 failed: Expected 200 OK access granted, got ${res.status} ${JSON.stringify(res.body)}`);
      }
      console.log('   [PASS] 200 OK: Access granted for Verified Email + ACTIVE account');
    }

    // SCENARIO 5: Verify Email Sync Endpoint (/api/auth/verify-email-sync)
    console.log('5. Testing /api/auth/verify-email-sync Endpoint...');
    {
      authTarget.verifyIdToken = async () => ({
        uid: testUid,
        email: testEmail,
        email_verified: true
      });

      const res = await request(app)
        .post('/api/auth/verify-email-sync')
        .set('Authorization', 'Bearer mock_verified_token');

      if (res.status !== 200 || !res.body.emailVerified) {
        throw new Error(`Scenario 5 failed: Expected 200 OK verify-email-sync, got ${res.status} ${JSON.stringify(res.body)}`);
      }
      console.log('   [PASS] 200 OK: /api/auth/verify-email-sync returns verified status and account metadata');
    }

  } finally {
    authTarget.verifyIdToken = originalVerifyIdToken;
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
    }
    await mongoose.disconnect();
  }

  console.log('--- ALL PHASE 4 TEST SUITE SCENARIOS PASSED SUCCESSFULLY ---');
}

runPhase4Tests().then(() => process.exit(0)).catch(err => {
  console.error('Phase 4 Test Failure:', err);
  process.exit(1);
});
