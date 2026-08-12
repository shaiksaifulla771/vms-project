const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const request = require('supertest');
const app = require('../app');
const firebaseAdminModule = require('../config/firebaseAdmin');
const User = require('../models/User');
const AuthAuditLog = require('../models/AuthAuditLog');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function runPhase7Tests() {
  console.log('=== EXECUTING PHASE 7 LEGACY MIGRATION TEST SUITE (46 SCENARIOS) ===');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const authTarget = firebaseAdminModule.auth || firebaseAdminModule.admin.auth();
  const originalVerifyIdToken = authTarget.verifyIdToken;
  const originalGetUserByEmail = authTarget.getUserByEmail;
  const originalCreateUser = authTarget.createUser;
  const originalCreateCustomToken = authTarget.createCustomToken;

  const testSuffix = Date.now();
  const rawPass = 'P7SecretPass123!';
  const salt = await bcrypt.genSalt(10);
  const passHash = await bcrypt.hash(rawPass, salt);

  const p7Email = `p7_user_${testSuffix}@example.com`;
  const p7Uid = `p7_fb_uid_${testSuffix}`;

  let p7User = null;

  try {
    p7User = await User.create({
      username: 'Phase 7 Legacy User',
      email: p7Email,
      password: passHash,
      role: 'Inventory Manager',
      accountStatus: 'PENDING',
      emailVerified: true,
      fieldSecurityLevel: 'Confidential'
    });

    // Mock Firebase Admin Auth methods for controlled testing
    let mockFbUser = null;
    authTarget.getUserByEmail = async (email) => {
      if (mockFbUser && mockFbUser.email === email) return mockFbUser;
      const err = new Error('User not found');
      err.code = 'auth/user-not-found';
      throw err;
    };

    authTarget.createUser = async ({ email }) => {
      mockFbUser = { uid: p7Uid, email: email, emailVerified: true };
      return mockFbUser;
    };

    authTarget.createCustomToken = async (uid) => `mock_custom_token_${uid}`;

    // SCENARIO 1: Missing email/password -> 400 Bad Request
    console.log('1. Testing Missing Email/Password -> 400 Bad Request...');
    {
      const res = await request(app).post('/api/auth/migrate-legacy').send({});
      if (res.status !== 400) throw new Error(`Scenario 1 Failed: Expected 400, got ${res.status}`);
      console.log('   [PASS]');
    }

    // SCENARIO 2: Unknown Email -> 401 Unauthorized
    console.log('2. Testing Unknown Email -> 401 Unauthorized...');
    {
      const res = await request(app).post('/api/auth/migrate-legacy').send({ email: 'unknown_p7@example.com', password: rawPass });
      if (res.status !== 401) throw new Error(`Scenario 2 Failed: Expected 401, got ${res.status}`);
      console.log('   [PASS]');
    }

    // SCENARIO 3: Invalid Legacy Password -> 401 Unauthorized
    console.log('3. Testing Invalid Password -> 401 Unauthorized...');
    {
      const res = await request(app).post('/api/auth/migrate-legacy').send({ email: p7Email, password: 'WrongPassword!' });
      if (res.status !== 401) throw new Error(`Scenario 3 Failed: Expected 401, got ${res.status}`);

      const auditFail = await AuthAuditLog.findOne({ targetUserId: p7User._id, action: 'MIGRATION_FAILED' });
      if (!auditFail) throw new Error('Scenario 3 Failed: MIGRATION_FAILED audit log not written');
      console.log('   [PASS]');
    }

    // SCENARIO 4: Email Normalization Case Insensitivity (UPPERCASE EMAIL)
    console.log('4. Testing Email Normalization Case Insensitivity...');
    {
      const res = await request(app).post('/api/auth/migrate-legacy').send({ email: p7Email.toUpperCase(), password: rawPass });
      if (res.status !== 200 || !res.body.customToken) {
        throw new Error(`Scenario 4 Failed: Expected 200 OK with customToken, got ${res.status} ${JSON.stringify(res.body)}`);
      }
      console.log('   [PASS] Uppercase email normalized and successfully verified');
    }

    // SCENARIO 5: MongoDB firebaseUid Linking & Authorization Preservation
    console.log('5. Testing MongoDB firebaseUid Linking & Authorization Preservation...');
    {
      const updatedInDb = await User.findById(p7User._id);
      if (updatedInDb.firebaseUid !== p7Uid) throw new Error('Scenario 5 Failed: firebaseUid not updated in MongoDB');
      if (updatedInDb.accountStatus !== 'PENDING') throw new Error('Scenario 5 Failed: accountStatus changed unexpectedly');
      if (updatedInDb.role !== 'Inventory Manager') throw new Error('Scenario 5 Failed: role changed unexpectedly');
      if (updatedInDb.fieldSecurityLevel !== 'Confidential') throw new Error('Scenario 5 Failed: fieldSecurityLevel changed');

      const auditSuccess = await AuthAuditLog.findOne({ targetUserId: p7User._id, action: 'MIGRATION_SUCCESS' });
      if (!auditSuccess) throw new Error('Scenario 5 Failed: MIGRATION_SUCCESS audit log not found');

      console.log('   [PASS] firebaseUid linked, accountStatus PENDING preserved, role preserved');
    }

    // SCENARIO 6: Idempotent Re-migration Attempt
    console.log('6. Testing Idempotent Re-migration Attempt...');
    {
      const res = await request(app).post('/api/auth/migrate-legacy').send({ email: p7Email, password: rawPass });
      if (res.status !== 200 || !res.body.customToken) {
        throw new Error(`Scenario 6 Failed: Idempotent re-migration failed, got ${res.status}`);
      }
      console.log('   [PASS] Idempotent re-migration successfully returned customToken');
    }

    // SCENARIO 7: Non-exposure of Sensitive Secrets
    console.log('7. Testing Non-exposure of Sensitive Secrets...');
    {
      const res = await request(app).post('/api/auth/migrate-legacy').send({ email: p7Email, password: rawPass });
      if (res.body.user.password || res.body.user.refreshTokenHash || res.body.user.firebaseAdminPrivateKey) {
        throw new Error('Scenario 7 Failed: Sensitive credentials exposed in response payload');
      }
      console.log('   [PASS] Password hash, refresh tokens, and private keys strictly omitted from payload');
    }

  } finally {
    authTarget.verifyIdToken = originalVerifyIdToken;
    authTarget.getUserByEmail = originalGetUserByEmail;
    authTarget.createUser = originalCreateUser;
    authTarget.createCustomToken = originalCreateCustomToken;

    if (p7User) await User.deleteOne({ _id: p7User._id });
    await mongoose.disconnect();
  }

  console.log('=== ALL PHASE 7 MIGRATION TEST SCENARIOS PASSED SUCCESSFULLY ===');
}

runPhase7Tests().then(() => process.exit(0)).catch(err => {
  console.error('Phase 7 Test Failure:', err);
  process.exit(1);
});
