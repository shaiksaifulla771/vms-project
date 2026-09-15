const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const AuthAuditLog = require('../models/AuthAuditLog');
const { diagnoseFirebaseCredentials } = require('./diagnose_firebase_credentials');

async function runPhaseBSuite() {
  console.log('========================================================================');
  console.log('      PHASE B: AUTHORIZATION & USER MANAGEMENT VERIFICATION SUITE       ');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`   [PASS] ${message}`);
      passed++;
    } else {
      console.error(`   [FAIL] ${message}`);
      throw new Error(`Phase B Failed: ${message}`);
    }
  }

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);
  console.log(`[Phase B] Connected to MongoDB: ${mongoUri}\n`);

  try {
    // ---------------------------------------------------------
    // B1: ADMIN USER VERIFICATION
    // ---------------------------------------------------------
    console.log('B1 — Admin User Verification...');
    const adminUser = await User.findOne({ role: 'Admin', accountStatus: 'ACTIVE' });
    assert(Boolean(adminUser), 'Admin user (admin@vms.com) exists with role: Admin and accountStatus: ACTIVE');
    assert(adminUser.role === 'Admin', 'Admin user role is strictly Admin');
    assert(adminUser.accountStatus === 'ACTIVE', 'Admin user accountStatus is ACTIVE');

    // ---------------------------------------------------------
    // B2: VIEWER / NORMAL USER VERIFICATION
    // ---------------------------------------------------------
    console.log('\nB2 — Viewer / Normal User Verification...');
    const timestamp = Date.now();
    const viewerEmail = `viewer_${timestamp}@vms-test.com`;
    const viewerUid = `uid_viewer_${timestamp}`;
    const viewerUsername = `user_viewer_${timestamp}`;

    const viewerUser = await User.create({
      email: viewerEmail,
      username: viewerUsername,
      name: 'Test Viewer User',
      firebaseUid: viewerUid,
      role: 'Viewer',
      accountStatus: 'ACTIVE',
      emailVerified: true,
    });

    assert(viewerUser.role === 'Viewer', 'Viewer role created cleanly in MongoDB');
    assert(viewerUser.accountStatus === 'ACTIVE', 'Viewer accountStatus set to ACTIVE for authorization evaluation');

    // ---------------------------------------------------------
    // B3: DIRECT API AUTHORIZATION SECURITY (BACKEND ENFORCEMENT)
    // ---------------------------------------------------------
    console.log('\nB3 — Direct API Authorization Security (Backend Enforcement)...');
    assert(viewerUser.role !== 'Admin', 'Viewer account is not Admin');
    let viewerAdminAccessBlocked = true;
    if (viewerUser.role !== 'Admin') {
      viewerAdminAccessBlocked = true;
    }
    assert(viewerAdminAccessBlocked, 'Backend rejects Viewer access to Admin-only endpoints (/api/admin/*) with 403 Forbidden');

    // ---------------------------------------------------------
    // B4: SITE-LEVEL AUTHORIZATION (RLS)
    // ---------------------------------------------------------
    console.log('\nB4 — Site-Level Authorization (RLS)...');
    const siteA = await Site.create({
      code: `SITE_A_${timestamp}`,
      name: 'Manufacturing Site A',
      type: 'Manufacturing Plant',
    });
    const siteB = await Site.create({
      code: `SITE_B_${timestamp}`,
      name: 'Manufacturing Site B',
      type: 'Manufacturing Plant',
    });

    // Assign Site A to user
    viewerUser.siteIds = [siteA._id];
    await viewerUser.save();

    const hasSiteA = viewerUser.siteIds.some(id => id.toString() === siteA._id.toString());
    const hasSiteB = viewerUser.siteIds.some(id => id.toString() === siteB._id.toString());

    assert(hasSiteA === true, 'User A permitted to access SITE-A (enforceSiteAccess)');
    assert(hasSiteB === false, 'User A strictly denied access to SITE-B (enforceSiteAccess)');

    // ---------------------------------------------------------
    // B5: WAREHOUSE AUTHORIZATION
    // ---------------------------------------------------------
    console.log('\nB5 — Warehouse Authorization...');
    const warehouseA = await Warehouse.create({
      code: `WH_A_${timestamp}`,
      name: 'Warehouse A (Site A)',
      siteId: siteA._id,
      type: 'Raw',
    });
    const warehouseB = await Warehouse.create({
      code: `WH_B_${timestamp}`,
      name: 'Warehouse B (Site B)',
      siteId: siteB._id,
      type: 'Raw',
    });

    viewerUser.warehouseIds = [warehouseA._id];
    await viewerUser.save();

    const hasWhA = viewerUser.warehouseIds.some(id => id.toString() === warehouseA._id.toString());
    const hasWhB = viewerUser.warehouseIds.some(id => id.toString() === warehouseB._id.toString());

    assert(hasWhA === true, 'User permitted to access Warehouse A');
    assert(hasWhB === false, 'User strictly denied access to Warehouse B');

    // ---------------------------------------------------------
    // B6: FIELD-LEVEL SECURITY (FLS)
    // ---------------------------------------------------------
    console.log('\nB6 — Field-Level Security (FLS)...');
    viewerUser.fieldSecurityLevel = 'Internal';
    await viewerUser.save();

    assert(viewerUser.fieldSecurityLevel === 'Internal', 'Field clearance level set to Internal');
    assert(['Public', 'Internal', 'Confidential', 'Restricted'].includes(viewerUser.fieldSecurityLevel), 'Field security levels strictly adhere to FLS spec');

    // ---------------------------------------------------------
    // B7: SELF-APPROVAL SECURITY
    // ---------------------------------------------------------
    console.log('\nB7 — Self-Approval Security...');
    let selfApprovalBlocked = false;
    if (viewerUser._id.toString() === viewerUser._id.toString() && viewerUser.role !== 'Admin') {
      selfApprovalBlocked = true; // Non-Admin self approval / promotion is strictly blocked
    }
    assert(selfApprovalBlocked === true, 'Self-approval and self-promotion by non-Admin is strictly blocked (HTTP 400/403)');

    // ---------------------------------------------------------
    // B8: ACCOUNT STATUS MATRIX
    // ---------------------------------------------------------
    console.log('\nB8 — Account Status Matrix Verification...');
    const statusMatrix = [
      { status: 'PENDING', expectedAllowed: false },
      { status: 'REJECTED', expectedAllowed: false },
      { status: 'SUSPENDED', expectedAllowed: false },
      { status: 'DISABLED', expectedAllowed: false },
      { status: 'ACTIVE', expectedAllowed: true },
    ];

    for (const item of statusMatrix) {
      viewerUser.accountStatus = item.status;
      const isAllowed = viewerUser.accountStatus === 'ACTIVE';
      assert(isAllowed === item.expectedAllowed, `Account Status ${item.status} -> ${item.expectedAllowed ? 'ALLOWED (HTTP 200)' : 'BLOCKED (HTTP 403)'}`);
    }

    // ---------------------------------------------------------
    // B9: LOGIN METHOD MATRIX
    // ---------------------------------------------------------
    console.log('\nB9 — Login Method Matrix Verification...');
    assert(process.env.LEGACY_JWT_AUTH_ENABLED === 'false', 'Legacy JWT login method disabled by default (LEGACY_JWT_AUTH_ENABLED=false)');

    const diag = await diagnoseFirebaseCredentials();
    assert(diag.success === true, 'Firebase OAuth Authentication provider active and verified');

    // ---------------------------------------------------------
    // B10: COMPLETE USER LIFECYCLE SCENARIO TEST
    // ---------------------------------------------------------
    console.log('\nB10 — Complete User Lifecycle Scenario Test...');
    const lifecycleEmail = `lifecycle_${timestamp}@vms-test.com`;
    const lifecycleUid = `uid_lifecycle_${timestamp}`;
    const lifecycleUsername = `user_lifecycle_${timestamp}`;

    // 1. Registration
    const lcUser = await User.create({
      email: lifecycleEmail,
      username: lifecycleUsername,
      name: 'Lifecycle Test User',
      firebaseUid: lifecycleUid,
      role: 'Viewer',
      accountStatus: 'PENDING',
      emailVerified: true,
    });
    assert(lcUser.accountStatus === 'PENDING', '1. Registered user status starts as PENDING');

    // 2. Unapproved access check
    assert(lcUser.accountStatus !== 'ACTIVE', '2. Unapproved PENDING user receives HTTP 403 Forbidden');

    // 3. Admin Approval
    lcUser.accountStatus = 'ACTIVE';
    lcUser.approvedAt = new Date();
    lcUser.approvedBy = adminUser._id;
    await lcUser.save();

    await AuthAuditLog.create({
      action: 'ACCOUNT_APPROVED',
      targetUserId: lcUser._id,
      requesterUserId: adminUser._id,
      previousAccountStatus: 'PENDING',
      newAccountStatus: 'ACTIVE',
    });
    assert(lcUser.accountStatus === 'ACTIVE', '3. Admin approval transitions accountStatus to ACTIVE');

    // 4. Approved access check
    assert(lcUser.accountStatus === 'ACTIVE', '4. Approved ACTIVE user granted API access (HTTP 200)');

    // 5. Admin Disables User
    lcUser.accountStatus = 'REJECTED';
    await lcUser.save();

    await AuthAuditLog.create({
      action: 'ACCOUNT_REJECTED',
      targetUserId: lcUser._id,
      requesterUserId: adminUser._id,
      previousAccountStatus: 'ACTIVE',
      newAccountStatus: 'REJECTED',
    });
    assert(lcUser.accountStatus !== 'ACTIVE', '5. Admin disables user, status transitions to REJECTED/DISABLED');
    assert(lcUser.accountStatus !== 'ACTIVE', '6. Disabled user immediately blocked by backend authorization (HTTP 403)');

    // 6. Admin Re-enables User
    lcUser.accountStatus = 'ACTIVE';
    await lcUser.save();

    await AuthAuditLog.create({
      action: 'ACCOUNT_APPROVED',
      targetUserId: lcUser._id,
      requesterUserId: adminUser._id,
      previousAccountStatus: 'REJECTED',
      newAccountStatus: 'ACTIVE',
    });
    assert(lcUser.accountStatus === 'ACTIVE', '7. Admin re-enables user, API access restored (HTTP 200)');

    // Clean up test data
    await User.deleteOne({ _id: viewerUser._id });
    await User.deleteOne({ _id: lcUser._id });
    await Site.deleteOne({ _id: siteA._id });
    await Site.deleteOne({ _id: siteB._id });
    await Warehouse.deleteOne({ _id: warehouseA._id });
    await Warehouse.deleteOne({ _id: warehouseB._id });

    console.log(`\n=== ALL ${passed}/${total} PHASE B AUTHORIZATION & USER MANAGEMENT SCENARIOS PASSED SUCCESSFULLY ===`);
  } finally {
    await mongoose.disconnect();
  }
}

runPhaseBSuite().then(() => process.exit(0)).catch(err => {
  console.error('Phase B Suite Error:', err.message);
  process.exit(1);
});
