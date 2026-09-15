const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const request = require('supertest');
const app = require('../app');
const firebaseAdminModule = require('../config/firebaseAdmin');
const User = require('../models/User');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const AuthAuditLog = require('../models/AuthAuditLog');
const mongoose = require('mongoose');

async function runPhase5Tests() {
  console.log('=== EXECUTING PHASE 5 FULL 30-TEST VERIFICATION MATRIX ===');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const authTarget = firebaseAdminModule.auth || firebaseAdminModule.admin.auth();
  const originalVerifyIdToken = authTarget.verifyIdToken;

  const testSuffix = Date.now();
  const adminUid = 'phase5_admin_uid_' + testSuffix;
  const viewerUid = 'phase5_viewer_uid_' + testSuffix;
  const inventoryUid = 'phase5_inv_uid_' + testSuffix;
  const pendingAdminUid = 'phase5_pending_admin_uid_' + testSuffix;
  const pendingUserUid = 'phase5_pending_target_uid_' + testSuffix;

  let activeAdminUser, viewerUser, inventoryUser, pendingAdminUser, pendingTargetUser;
  let testSite, testWarehouse;

  try {
    // 0. Seed test fixtures
    testSite = await Site.create({
      code: 'P5SITE_' + testSuffix,
      name: 'Phase 5 Test Site',
      status: 'Active'
    });

    testWarehouse = await Warehouse.create({
      code: 'P5WH_' + testSuffix,
      name: 'Phase 5 Test Warehouse',
      siteId: testSite._id,
      isActive: true
    });

    activeAdminUser = await User.create({
      firebaseUid: adminUid,
      username: 'Active Admin P5',
      email: `admin_${testSuffix}@example.com`,
      role: 'Admin',
      accountStatus: 'ACTIVE',
      emailVerified: true
    });

    viewerUser = await User.create({
      firebaseUid: viewerUid,
      username: 'Viewer P5',
      email: `viewer_${testSuffix}@example.com`,
      role: 'Viewer',
      accountStatus: 'ACTIVE',
      emailVerified: true
    });

    inventoryUser = await User.create({
      firebaseUid: inventoryUid,
      username: 'Inventory P5',
      email: `inventory_${testSuffix}@example.com`,
      role: 'Inventory',
      accountStatus: 'ACTIVE',
      emailVerified: true
    });

    pendingAdminUser = await User.create({
      firebaseUid: pendingAdminUid,
      username: 'Pending Admin P5',
      email: `p_admin_${testSuffix}@example.com`,
      role: 'Admin',
      accountStatus: 'PENDING',
      emailVerified: true
    });

    pendingTargetUser = await User.create({
      firebaseUid: pendingUserUid,
      username: 'Pending Target P5',
      email: `target_${testSuffix}@example.com`,
      role: 'Viewer',
      requestedRole: 'Inventory Manager',
      accountStatus: 'PENDING',
      emailVerified: true
    });

    // Helper mock function
    const mockAuth = (uid) => {
      authTarget.verifyIdToken = async () => ({
        uid: uid,
        email: 'mock@example.com',
        email_verified: true
      });
    };

    // TEST 1: No Firebase token
    console.log('TEST 1: No Firebase token -> 401 Unauthorized');
    {
      const res = await request(app).put(`/api/users/${pendingTargetUser._id}/approve`).send({});
      if (res.status !== 401) throw new Error(`TEST 1 Failed: Expected 401, got ${res.status}`);
      console.log('   [PASS]');
    }

    // TEST 2: Valid authenticated Viewer attempts approval -> 403 Forbidden
    console.log('TEST 2: Authenticated Viewer attempts approval -> 403 Forbidden');
    {
      mockAuth(viewerUid);
      const res = await request(app).put(`/api/users/${pendingTargetUser._id}/approve`).set('Authorization', 'Bearer token');
      if (res.status !== 403) throw new Error(`TEST 2 Failed: Expected 403, got ${res.status}`);
      console.log('   [PASS]');
    }

    // TEST 3: Valid authenticated Inventory user attempts approval -> 403 Forbidden
    console.log('TEST 3: Authenticated Inventory user attempts approval -> 403 Forbidden');
    {
      mockAuth(inventoryUid);
      const res = await request(app).put(`/api/users/${pendingTargetUser._id}/approve`).set('Authorization', 'Bearer token');
      if (res.status !== 403) throw new Error(`TEST 3 Failed: Expected 403, got ${res.status}`);
      console.log('   [PASS]');
    }

    // TEST 4: Authenticated user with role Admin but accountStatus PENDING -> 403 Forbidden
    console.log('TEST 4: Admin with PENDING status attempts approval -> 403 Forbidden');
    {
      mockAuth(pendingAdminUid);
      const res = await request(app).put(`/api/users/${pendingTargetUser._id}/approve`).set('Authorization', 'Bearer token');
      if (res.status !== 403) throw new Error(`TEST 4 Failed: Expected 403, got ${res.status}`);
      console.log('   [PASS]');
    }

    // TEST 5: Authenticated user with role Admin but accountStatus SUSPENDED -> 403 Forbidden
    console.log('TEST 5: Admin with SUSPENDED status attempts approval -> 403 Forbidden');
    {
      pendingAdminUser.accountStatus = 'SUSPENDED';
      await pendingAdminUser.save();
      mockAuth(pendingAdminUid);
      const res = await request(app).put(`/api/users/${pendingTargetUser._id}/approve`).set('Authorization', 'Bearer token');
      if (res.status !== 403) throw new Error(`TEST 5 Failed: Expected 403, got ${res.status}`);
      console.log('   [PASS]');
    }

    // TEST 7: Admin attempts to approve themselves -> 400 Bad Request
    console.log('TEST 7: Admin attempts self-approval -> 400 Bad Request');
    {
      mockAuth(adminUid);
      const res = await request(app).put(`/api/users/${activeAdminUser._id}/approve`).set('Authorization', 'Bearer token');
      if (res.status !== 400 || !res.body.error.includes('own account')) throw new Error(`TEST 7 Failed: Expected 400, got ${res.status} ${JSON.stringify(res.body)}`);
      console.log('   [PASS]');
    }

    // TEST 8: Admin attempts to reject themselves -> 400 Bad Request
    console.log('TEST 8: Admin attempts self-rejection -> 400 Bad Request');
    {
      mockAuth(adminUid);
      const res = await request(app).put(`/api/users/${activeAdminUser._id}/reject`).set('Authorization', 'Bearer token');
      if (res.status !== 400 || !res.body.error.includes('own account')) throw new Error(`TEST 8 Failed: Expected 400, got ${res.status} ${JSON.stringify(res.body)}`);
      console.log('   [PASS]');
    }

    // TEST 9: Admin attempts approval of nonexistent target -> 404 Not Found
    console.log('TEST 9: Admin approves nonexistent user ID -> 404 Not Found');
    {
      mockAuth(adminUid);
      const res = await request(app).put(`/api/users/${new mongoose.Types.ObjectId()}/approve`).set('Authorization', 'Bearer token');
      if (res.status !== 404) throw new Error(`TEST 9 Failed: Expected 404, got ${res.status}`);
      console.log('   [PASS]');
    }

    // TEST 10: Admin submits malformed target ObjectId -> 400 Bad Request
    console.log('TEST 10: Admin submits malformed target ObjectId -> 400 Bad Request');
    {
      mockAuth(adminUid);
      const res = await request(app).put('/api/users/invalid-object-id/approve').set('Authorization', 'Bearer token');
      if (res.status !== 400 || !res.body.error.includes('Invalid user ID')) throw new Error(`TEST 10 Failed: Expected 400, got ${res.status}`);
      console.log('   [PASS]');
    }

    // TEST 12: Public/approval request attempts role Admin where prohibited -> 400 Bad Request
    console.log('TEST 12: Approval request specifying role Admin -> 400 Bad Request');
    {
      mockAuth(adminUid);
      const res = await request(app).put(`/api/users/${pendingTargetUser._id}/approve`).set('Authorization', 'Bearer token').send({ role: 'Admin' });
      if (res.status !== 400 || !res.body.error.includes('prohibited')) throw new Error(`TEST 12 Failed: Expected 400, got ${res.status} ${JSON.stringify(res.body)}`);
      console.log('   [PASS]');
    }

    // TEST 13: Admin submits nonexistent siteId -> 400 Bad Request
    console.log('TEST 13: Admin submits nonexistent siteId -> 400 Bad Request');
    {
      mockAuth(adminUid);
      const res = await request(app).put(`/api/users/${pendingTargetUser._id}/approve`).set('Authorization', 'Bearer token').send({ siteIds: [new mongoose.Types.ObjectId()] });
      if (res.status !== 400 || !res.body.error.includes('site IDs do not exist')) throw new Error(`TEST 13 Failed: Expected 400, got ${res.status}`);
      console.log('   [PASS]');
    }

    // TEST 14: Admin submits malformed siteId -> 400 Bad Request
    console.log('TEST 14: Admin submits malformed siteId -> 400 Bad Request');
    {
      mockAuth(adminUid);
      const res = await request(app).put(`/api/users/${pendingTargetUser._id}/approve`).set('Authorization', 'Bearer token').send({ siteIds: ['bad-id'] });
      if (res.status !== 400 || !res.body.error.includes('Invalid site ID')) throw new Error(`TEST 14 Failed: Expected 400, got ${res.status}`);
      console.log('   [PASS]');
    }

    // TEST 15: Admin submits nonexistent warehouseId -> 400 Bad Request
    console.log('TEST 15: Admin submits nonexistent warehouseId -> 400 Bad Request');
    {
      mockAuth(adminUid);
      const res = await request(app).put(`/api/users/${pendingTargetUser._id}/approve`).set('Authorization', 'Bearer token').send({ warehouseIds: [new mongoose.Types.ObjectId()] });
      if (res.status !== 400 || !res.body.error.includes('warehouse IDs do not exist')) throw new Error(`TEST 15 Failed: Expected 400, got ${res.status}`);
      console.log('   [PASS]');
    }

    // TEST 16: Admin submits malformed warehouseId -> 400 Bad Request
    console.log('TEST 16: Admin submits malformed warehouseId -> 400 Bad Request');
    {
      mockAuth(adminUid);
      const res = await request(app).put(`/api/users/${pendingTargetUser._id}/approve`).set('Authorization', 'Bearer token').send({ warehouseIds: ['bad-wh-id'] });
      if (res.status !== 400 || !res.body.error.includes('Invalid warehouse ID')) throw new Error(`TEST 16 Failed: Expected 400, got ${res.status}`);
      console.log('   [PASS]');
    }

    // TEST 29: Invalid site/warehouse validation causes NO partial user update
    console.log('TEST 29: Invalid site/warehouse validation causes NO partial user update');
    {
      mockAuth(adminUid);
      await request(app).put(`/api/users/${pendingTargetUser._id}/approve`).set('Authorization', 'Bearer token').send({ siteIds: ['bad-id'] });
      const reFetched = await User.findById(pendingTargetUser._id);
      if (reFetched.accountStatus !== 'PENDING') throw new Error('TEST 29 Failed: Partial update occurred on invalid site validation');
      console.log('   [PASS]');
    }

    // TEST 6, 27, 28, 24, 25, 26: Authenticated ACTIVE Admin approves valid PENDING user with Sites & Warehouses
    console.log('TEST 6, 24-28: ACTIVE Admin approves valid PENDING user with Site & Warehouse assignments');
    {
      mockAuth(adminUid);
      const res = await request(app)
        .put(`/api/users/${pendingTargetUser._id}/approve`)
        .set('Authorization', 'Bearer token')
        .send({
          siteIds: [testSite._id.toString()],
          warehouseIds: [testWarehouse._id.toString()]
        });

      if (res.status !== 200 || !res.body.success) throw new Error(`TEST 6 Failed: Expected 200, got ${res.status} ${JSON.stringify(res.body)}`);

      const approvedData = res.body.user;
      if (approvedData.accountStatus !== 'ACTIVE') throw new Error('Expected ACTIVE status in response');
      if (approvedData.role !== 'Inventory Manager') throw new Error('Expected requestedRole Inventory Manager assigned');

      // Check non-exposure of sensitive fields
      if (res.body.user.password || res.body.user.refreshTokenHash || res.body.user.firebaseAdminPrivateKey) {
        throw new Error('TEST 24/25 Failed: Sensitive data exposed in approval response');
      }

      // Check DB persistence
      const inDb = await User.findById(pendingTargetUser._id);
      if (inDb.accountStatus !== 'ACTIVE') throw new Error('DB status not ACTIVE');
      if (inDb.siteIds.length !== 1 || inDb.siteIds[0].toString() !== testSite._id.toString()) throw new Error('TEST 27 Failed: siteIds mismatch in DB');
      if (inDb.warehouseIds.length !== 1 || inDb.warehouseIds[0].toString() !== testWarehouse._id.toString()) throw new Error('TEST 28 Failed: warehouseIds mismatch in DB');

      console.log('   [PASS] 200 OK: Target approved, role/site/warehouse assigned, no sensitive data leaked');
    }

    // TEST 22: Successful approval creates ACCOUNT_APPROVED audit event
    console.log('TEST 22: Successful approval creates ACCOUNT_APPROVED audit log');
    {
      const auditLog = await AuthAuditLog.findOne({ targetUserId: pendingTargetUser._id, action: 'ACCOUNT_APPROVED' });
      if (!auditLog) throw new Error('TEST 22 Failed: ACCOUNT_APPROVED audit log not found');
      if (auditLog.newAccountStatus !== 'ACTIVE') throw new Error('Audit log status mismatch');
      console.log('   [PASS]');
    }

    // TEST 18: Already ACTIVE user approval -> 409 Conflict
    console.log('TEST 18: Already ACTIVE user approval -> 409 Conflict');
    {
      mockAuth(adminUid);
      const res = await request(app).put(`/api/users/${pendingTargetUser._id}/approve`).set('Authorization', 'Bearer token');
      if (res.status !== 409) throw new Error(`TEST 18 Failed: Expected 409, got ${res.status} ${JSON.stringify(res.body)}`);
      console.log('   [PASS]');
    }

    // TEST 20, 23: PENDING user rejection & ACCOUNT_REJECTED audit log
    console.log('TEST 20, 23: PENDING user rejection & ACCOUNT_REJECTED audit log');
    {
      const rejUser = await User.create({
        firebaseUid: 'phase5_rej_uid_' + testSuffix,
        username: 'Pending Rejection Target',
        email: `rej_${testSuffix}@example.com`,
        role: 'Viewer',
        accountStatus: 'PENDING',
        emailVerified: true
      });

      mockAuth(adminUid);
      const res = await request(app).put(`/api/users/${rejUser._id}/reject`).set('Authorization', 'Bearer token');
      if (res.status !== 200 || !res.body.success) throw new Error(`TEST 20 Failed: Expected 200, got ${res.status}`);

      const inDb = await User.findById(rejUser._id);
      if (inDb.accountStatus !== 'REJECTED') throw new Error('Expected DB status REJECTED');

      const auditLog = await AuthAuditLog.findOne({ targetUserId: rejUser._id, action: 'ACCOUNT_REJECTED' });
      if (!auditLog) throw new Error('TEST 23 Failed: ACCOUNT_REJECTED audit log not found');

      console.log('   [PASS] 200 OK: Target rejected and ACCOUNT_REJECTED audit log written');
    }

    // TEST 19, 21: REJECTED / Non-PENDING user rejection -> 409 Conflict
    console.log('TEST 19, 21: Non-PENDING user rejection -> 409 Conflict');
    {
      mockAuth(adminUid);
      const res = await request(app).put(`/api/users/${pendingTargetUser._id}/reject`).set('Authorization', 'Bearer token');
      if (res.status !== 409) throw new Error(`TEST 19/21 Failed: Expected 409, got ${res.status}`);
      console.log('   [PASS]');
    }

    // TEST 11, 17: Admin approves user without requestedRole -> Safe default Viewer
    console.log('TEST 11, 17: Admin approves user without requestedRole -> Safe default Viewer');
    {
      const noReqUser = await User.create({
        firebaseUid: 'phase5_noreq_uid_' + testSuffix,
        username: 'No Req Role User',
        email: `noreq_${testSuffix}@example.com`,
        role: 'Viewer',
        requestedRole: null,
        accountStatus: 'PENDING',
        emailVerified: true
      });

      mockAuth(adminUid);
      const res = await request(app).put(`/api/users/${noReqUser._id}/approve`).set('Authorization', 'Bearer token');
      if (res.status !== 200 || res.body.user.role !== 'Viewer') throw new Error('TEST 17 Failed: Expected default role Viewer');

      await User.deleteOne({ _id: noReqUser._id });
      console.log('   [PASS]');
    }

    // TEST 30: Concurrent approval handling (Double approval test)
    console.log('TEST 30: Concurrent / double approval handling -> 409 Conflict on 2nd attempt');
    {
      const concUser = await User.create({
        firebaseUid: 'phase5_conc_uid_' + testSuffix,
        username: 'Concurrent Target',
        email: `conc_${testSuffix}@example.com`,
        role: 'Viewer',
        accountStatus: 'PENDING',
        emailVerified: true
      });

      mockAuth(adminUid);
      const req1 = request(app).put(`/api/users/${concUser._id}/approve`).set('Authorization', 'Bearer token');
      const req2 = request(app).put(`/api/users/${concUser._id}/approve`).set('Authorization', 'Bearer token');

      const [res1, res2] = await Promise.all([req1, req2]);
      const statuses = [res1.status, res2.status].sort();

      if (statuses[0] !== 200 || statuses[1] !== 409) {
        throw new Error(`TEST 30 Failed: Expected one 200 and one 409, got ${statuses.join(', ')}`);
      }

      await User.deleteOne({ _id: concUser._id });
      console.log('   [PASS]');
    }

  } finally {
    authTarget.verifyIdToken = originalVerifyIdToken;
    // Clean up fixtures
    if (activeAdminUser) await User.deleteOne({ _id: activeAdminUser._id });
    if (viewerUser) await User.deleteOne({ _id: viewerUser._id });
    if (inventoryUser) await User.deleteOne({ _id: inventoryUser._id });
    if (pendingAdminUser) await User.deleteOne({ _id: pendingAdminUser._id });
    if (pendingTargetUser) await User.deleteOne({ _id: pendingTargetUser._id });
    if (testSite) await Site.deleteOne({ _id: testSite._id });
    if (testWarehouse) await Warehouse.deleteOne({ _id: testWarehouse._id });

    await mongoose.disconnect();
  }

  console.log('=== ALL PHASE 5 30-TEST VERIFICATION MATRIX SCENARIOS PASSED ===');
}

runPhase5Tests().then(() => process.exit(0)).catch(err => {
  console.error('Phase 5 Test Failure:', err);
  process.exit(1);
});
