const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { protect, authorize, enforceSiteAccess, enforceFieldSecurity } = require('../middleware/authMiddleware');
const firebaseAdminModule = require('../config/firebaseAdmin');
const User = require('../models/User');
const mongoose = require('mongoose');

// Mock request and response helpers
const createMockReqRes = (headers = {}, params = {}, body = {}, query = {}) => {
  const req = {
    headers,
    params,
    body,
    query
  };
  const res = {
    statusCode: 200,
    jsonResponse: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonResponse = data;
      return this;
    }
  };
  return { req, res };
};

async function runPhase2Tests() {
  console.log('--- EXECUTING PHASE 2 FIREBASE AUTHENTICATION MIDDLEWARE TEST MATRIX ---');

  // Connect to MongoDB
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  // Setup test user helper
  const testUid = 'phase2_test_uid_' + Date.now();
  const testEmail = 'phase2_test_' + Date.now() + '@example.com';

  const testUser = await User.create({
    firebaseUid: testUid,
    username: 'Phase2 Test User',
    email: testEmail,
    password: 'password123',
    role: 'Inventory Manager',
    accountStatus: 'ACTIVE',
    fieldSecurityLevel: 'Confidential'
  });

  const authTarget = firebaseAdminModule.auth || firebaseAdminModule.admin.auth();
  const originalVerifyIdToken = authTarget.verifyIdToken;

  try {
    // SCENARIO 1: Missing Bearer Token
    console.log('1. Testing Missing Bearer Token...');
    {
      const { req, res } = createMockReqRes();
      let nextCalled = false;
      await protect(req, res, () => { nextCalled = true; });
      if (res.statusCode !== 401 || nextCalled) {
        throw new Error(`Scenario 1 failed: Expected 401, got ${res.statusCode}`);
      }
      console.log('   [PASS] 401 Unauthorized for missing Bearer token');
    }

    // SCENARIO 2: Invalid / Malformed Token
    console.log('2. Testing Malformed / Invalid Token...');
    {
      authTarget.verifyIdToken = async () => {
        const err = new Error('Decoding Firebase ID token failed');
        err.code = 'auth/argument-error';
        throw err;
      };
      const { req, res } = createMockReqRes({ authorization: 'Bearer invalid_token_123' });
      await protect(req, res, () => {});
      if (res.statusCode !== 401) {
        throw new Error(`Scenario 2 failed: Expected 401, got ${res.statusCode}`);
      }
      console.log('   [PASS] 401 Unauthorized for malformed token');
    }

    // SCENARIO 3: Expired Token
    console.log('3. Testing Expired Firebase Token...');
    {
      authTarget.verifyIdToken = async () => {
        const err = new Error('Firebase ID token has expired');
        err.code = 'auth/id-token-expired';
        throw err;
      };
      const { req, res } = createMockReqRes({ authorization: 'Bearer expired_token' });
      await protect(req, res, () => {});
      if (res.statusCode !== 401 || res.jsonResponse?.error !== 'Token expired. Please log in again.') {
        throw new Error(`Scenario 3 failed: Expected 401 Expired Token, got ${res.statusCode}`);
      }
      console.log('   [PASS] 401 Unauthorized for expired token');
    }

    // SCENARIO 4: Revoked Token
    console.log('4. Testing Revoked Firebase Token...');
    {
      authTarget.verifyIdToken = async () => {
        const err = new Error('Firebase ID token has been revoked');
        err.code = 'auth/id-token-revoked';
        throw err;
      };
      const { req, res } = createMockReqRes({ authorization: 'Bearer revoked_token' });
      await protect(req, res, () => {});
      if (res.statusCode !== 401 || res.jsonResponse?.error !== 'Token has been revoked. Please log in again.') {
        throw new Error(`Scenario 4 failed: Expected 401 Revoked Token, got ${res.statusCode}`);
      }
      console.log('   [PASS] 401 Unauthorized for revoked token');
    }

    // SCENARIO 5: Unverified Email Token
    console.log('5. Testing Unverified Email Token (email_verified = false)...');
    {
      authTarget.verifyIdToken = async () => ({
        uid: testUid,
        email: testEmail,
        email_verified: false
      });
      const { req, res } = createMockReqRes({ authorization: 'Bearer unverified_email_token' });
      await protect(req, res, () => {});
      if (res.statusCode !== 403 || !res.jsonResponse?.error.includes('Email verification required')) {
        throw new Error(`Scenario 5 failed: Expected 403 Email Verification Required, got ${res.statusCode}`);
      }
      console.log('   [PASS] 403 Forbidden for unverified email token');
    }

    // SCENARIO 6: Unknown Firebase UID
    console.log('6. Testing Unknown Firebase UID (Not in MongoDB)...');
    {
      authTarget.verifyIdToken = async () => ({
        uid: 'unknown_uid_99999',
        email: 'unknown@example.com',
        email_verified: true
      });
      const { req, res } = createMockReqRes({ authorization: 'Bearer unknown_uid_token' });
      await protect(req, res, () => {});
      if (res.statusCode !== 401 || res.jsonResponse?.error !== 'User record not found in VMS database') {
        throw new Error(`Scenario 6 failed: Expected 401 User Not Found, got ${res.statusCode}`);
      }
      console.log('   [PASS] 401 Unauthorized for unknown Firebase UID');
    }

    // SCENARIO 7: PENDING User
    console.log('7. Testing PENDING User Access...');
    {
      testUser.accountStatus = 'PENDING';
      await testUser.save();

      authTarget.verifyIdToken = async () => ({
        uid: testUid,
        email: testEmail,
        email_verified: true
      });
      const { req, res } = createMockReqRes({ authorization: 'Bearer valid_token' });
      await protect(req, res, () => {});
      if (res.statusCode !== 403 || !res.jsonResponse?.error.includes('PENDING')) {
        throw new Error(`Scenario 7 failed: Expected 403 PENDING forbidden, got ${res.statusCode}`);
      }
      console.log('   [PASS] 403 Forbidden for PENDING account status');
    }

    // SCENARIO 8: REJECTED User
    console.log('8. Testing REJECTED User Access...');
    {
      testUser.accountStatus = 'REJECTED';
      await testUser.save();

      const { req, res } = createMockReqRes({ authorization: 'Bearer valid_token' });
      await protect(req, res, () => {});
      if (res.statusCode !== 403 || !res.jsonResponse?.error.includes('REJECTED')) {
        throw new Error(`Scenario 8 failed: Expected 403 REJECTED forbidden, got ${res.statusCode}`);
      }
      console.log('   [PASS] 403 Forbidden for REJECTED account status');
    }

    // SCENARIO 9: SUSPENDED User
    console.log('9. Testing SUSPENDED User Access...');
    {
      testUser.accountStatus = 'SUSPENDED';
      await testUser.save();

      const { req, res } = createMockReqRes({ authorization: 'Bearer valid_token' });
      await protect(req, res, () => {});
      if (res.statusCode !== 403 || !res.jsonResponse?.error.includes('SUSPENDED')) {
        throw new Error(`Scenario 9 failed: Expected 403 SUSPENDED forbidden, got ${res.statusCode}`);
      }
      console.log('   [PASS] 403 Forbidden for SUSPENDED account status');
    }

    // SCENARIO 10: DISABLED User
    console.log('10. Testing DISABLED User Access...');
    {
      testUser.accountStatus = 'DISABLED';
      await testUser.save();

      const { req, res } = createMockReqRes({ authorization: 'Bearer valid_token' });
      await protect(req, res, () => {});
      if (res.statusCode !== 403 || !res.jsonResponse?.error.includes('DISABLED')) {
        throw new Error(`Scenario 10 failed: Expected 403 DISABLED forbidden, got ${res.statusCode}`);
      }
      console.log('   [PASS] 403 Forbidden for DISABLED account status');
    }

    // SCENARIO 11: ACTIVE User Success & req.user Population
    console.log('11. Testing ACTIVE User Access & req.user Population...');
    {
      testUser.accountStatus = 'ACTIVE';
      await testUser.save();

      let nextCalled = false;
      const { req, res } = createMockReqRes({ authorization: 'Bearer valid_token' });
      await protect(req, res, () => { nextCalled = true; });
      if (!nextCalled || !req.user || req.user._id.toString() !== testUser._id.toString()) {
        throw new Error('Scenario 11 failed: req.user not correctly populated');
      }
      console.log('   [PASS] Access Granted and req.user populated with full Mongoose User document');

      // Test RBAC preservation
      const rbacFunc = authorize('Inventory Manager');
      let rbacPassed = false;
      rbacFunc(req, res, () => { rbacPassed = true; });
      if (!rbacPassed) throw new Error('RBAC check failed for authorized role');
      console.log('   [PASS] RBAC (authorize) functions cleanly');

      // Test FLS preservation
      const flsFunc = enforceFieldSecurity('Confidential');
      let flsPassed = false;
      flsFunc(req, res, () => { flsPassed = true; });
      if (!flsPassed) throw new Error('FLS check failed for authorized clearance level');
      console.log('   [PASS] FLS (enforceFieldSecurity) functions cleanly');
    }

  } finally {
    // Restore verifyIdToken and cleanup test user
    authTarget.verifyIdToken = originalVerifyIdToken;
    await User.deleteOne({ _id: testUser._id });
    await mongoose.disconnect();
  }

  console.log('--- ALL PHASE 2 TEST MATRIX SCENARIOS PASSED SUCCESSFULLY ---');
}

runPhase2Tests().then(() => process.exit(0)).catch(err => {
  console.error('Phase 2 Test Failure:', err);
  process.exit(1);
});
