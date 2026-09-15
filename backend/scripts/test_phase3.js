const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const request = require('supertest');
const app = require('../app');
const firebaseAdminModule = require('../config/firebaseAdmin');
const User = require('../models/User');
const mongoose = require('mongoose');

async function runPhase3Tests() {
  console.log('--- EXECUTING PHASE 3 REGISTRATION SYNCHRONIZATION TEST SUITE ---');

  // Connect to MongoDB
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const authTarget = firebaseAdminModule.auth || firebaseAdminModule.admin.auth();
  const originalVerifyIdToken = authTarget.verifyIdToken;

  const testUid = 'phase3_sync_uid_' + Date.now();
  const testEmail = 'phase3_user_' + Date.now() + '@example.com';
  let createdUserId = null;

  try {
    // SCENARIO 1: Invalid / Missing Firebase Token
    console.log('1. Testing Missing / Invalid Bearer Token...');
    {
      const res = await request(app).post('/api/auth/register-sync').send({ username: 'Test User' });
      if (res.status !== 401) {
        throw new Error(`Scenario 1 failed: Expected 401, got ${res.status}`);
      }
      console.log('   [PASS] 401 Unauthorized for missing Bearer token');
    }

    // SCENARIO 2: Attempted Admin Self-Registration Rejection
    console.log('2. Testing Admin Self-Registration Rejection (requestedRole = Admin)...');
    {
      authTarget.verifyIdToken = async () => ({
        uid: testUid,
        email: testEmail,
        email_verified: true
      });

      const res = await request(app)
        .post('/api/auth/register-sync')
        .set('Authorization', 'Bearer valid_mock_token')
        .send({ username: 'Hacker Admin', requestedRole: 'Admin' });

      if (res.status !== 400 || !res.body.error.includes('strictly prohibited')) {
        throw new Error(`Scenario 2 failed: Expected 400 Admin Rejection, got ${res.status} ${JSON.stringify(res.body)}`);
      }
      console.log('   [PASS] 400 Bad Request: Admin self-registration explicitly blocked');
    }

    // SCENARIO 3: Valid Registration Sync & PENDING Account Creation
    console.log('3. Testing Valid Registration Sync (requestedRole = Inventory Manager)...');
    {
      const res = await request(app)
        .post('/api/auth/register-sync')
        .set('Authorization', 'Bearer valid_mock_token')
        .send({ username: 'Phase3 Inventory User', requestedRole: 'Inventory Manager' });

      if (res.status !== 201 || !res.body.success) {
        throw new Error(`Scenario 3 failed: Expected 201 Created, got ${res.status} ${JSON.stringify(res.body)}`);
      }

      const user = res.body.user;
      createdUserId = user.id;

      if (user.accountStatus !== 'PENDING') {
        throw new Error(`Expected accountStatus PENDING, got ${user.accountStatus}`);
      }
      if (user.role !== 'Viewer') {
        throw new Error(`Expected default role Viewer, got ${user.role}`);
      }
      if (user.requestedRole !== 'Inventory Manager') {
        throw new Error(`Expected requestedRole Inventory Manager, got ${user.requestedRole}`);
      }
      if (user.firebaseUid !== testUid) {
        throw new Error(`Expected firebaseUid ${testUid}, got ${user.firebaseUid}`);
      }

      console.log('   [PASS] 201 Created: MongoDB user created with PENDING status, Viewer role, requestedRole Inventory Manager, and linked firebaseUid');
    }

    // SCENARIO 4: Duplicate Firebase UID Association
    console.log('4. Testing Duplicate Firebase UID Association...');
    {
      const res = await request(app)
        .post('/api/auth/register-sync')
        .set('Authorization', 'Bearer valid_mock_token')
        .send({ username: 'Phase3 Inventory User Duplicate' });

      if (res.status !== 200 || !res.body.message.includes('already synchronized')) {
        throw new Error(`Scenario 4 failed: Expected 200 already synchronized, got ${res.status} ${JSON.stringify(res.body)}`);
      }
      console.log('   [PASS] 200 OK: Existing Firebase UID association gracefully returned');
    }

    // SCENARIO 5: Ambiguous / Duplicate Email Check
    console.log('5. Testing Ambiguous / Duplicate Email Check...');
    {
      const originalFind = User.find;
      User.find = async (query) => {
        if (query && query.email) {
          return [
            { _id: new mongoose.Types.ObjectId(), email: query.email },
            { _id: new mongoose.Types.ObjectId(), email: query.email }
          ];
        }
        return originalFind.call(User, query);
      };

      authTarget.verifyIdToken = async () => ({
        uid: 'ambiguous_uid_' + Date.now(),
        email: 'ambiguous_test@example.com',
        email_verified: true
      });

      const res = await request(app)
        .post('/api/auth/register-sync')
        .set('Authorization', 'Bearer valid_mock_token')
        .send({ username: 'Ambiguous User' });

      User.find = originalFind;

      if (res.status !== 400 || !res.body.error.includes('Ambiguous identity')) {
        throw new Error(`Scenario 5 failed: Expected 400 Ambiguous identity, got ${res.status} ${JSON.stringify(res.body)}`);
      }
      console.log('   [PASS] 400 Bad Request: Ambiguous email records halted and reported');
    }

  } finally {
    authTarget.verifyIdToken = originalVerifyIdToken;
    if (createdUserId) {
      await User.deleteOne({ _id: createdUserId });
    }
    await mongoose.disconnect();
  }

  console.log('--- ALL PHASE 3 TEST SUITE SCENARIOS PASSED SUCCESSFULLY ---');
}

runPhase3Tests().then(() => process.exit(0)).catch(err => {
  console.error('Phase 3 Test Failure:', err);
  process.exit(1);
});
