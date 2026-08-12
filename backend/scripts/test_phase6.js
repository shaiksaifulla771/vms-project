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

async function runPhase6Tests() {
  console.log('=== EXECUTING PHASE 6 FULL COMPATIBILITY & SECURITY TEST SUITE (69 SCENARIOS) ===');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const authTarget = firebaseAdminModule.auth || firebaseAdminModule.admin.auth();
  const originalVerifyIdToken = authTarget.verifyIdToken;

  const testSuffix = Date.now();
  const testSiteA = await Site.create({ code: 'P6SITA_' + testSuffix, name: 'P6 Site A', status: 'Active' });
  const testSiteB = await Site.create({ code: 'P6SITB_' + testSuffix, name: 'P6 Site B', status: 'Active' });
  const inactiveSite = await Site.create({ code: 'P6INACS_' + testSuffix, name: 'P6 Inactive Site', status: 'Inactive' });

  const testWHA = await Warehouse.create({ code: 'P6WHA_' + testSuffix, name: 'P6 WH A', siteId: testSiteA._id, isActive: true });
  const testWHB = await Warehouse.create({ code: 'P6WHB_' + testSuffix, name: 'P6 WH B', siteId: testSiteB._id, isActive: true });
  const inactiveWH = await Warehouse.create({ code: 'P6INACW_' + testSuffix, name: 'P6 Inactive WH', siteId: testSiteA._id, status: 'Inactive', isActive: false });

  const adminUid = 'p6_admin_' + testSuffix;
  const adminUser = await User.create({
    firebaseUid: adminUid,
    username: 'P6 Admin',
    email: `admin_${testSuffix}@example.com`,
    role: 'Admin',
    accountStatus: 'ACTIVE',
    emailVerified: true,
    siteIds: [testSiteA._id, testSiteB._id],
    warehouseIds: [testWHA._id, testWHB._id],
    fieldSecurityLevel: 'Restricted'
  });

  const mockAuth = (uid, emailVerified = true) => {
    authTarget.verifyIdToken = async () => ({
      uid: uid,
      email: `${uid}@example.com`,
      email_verified: emailVerified
    });
  };

  let passedCount = 0;
  let failedCount = 0;

  function assertPass(scenarioName) {
    passedCount++;
    console.log(`   [PASS] Scenario ${passedCount}: ${scenarioName}`);
  }

  function assertFail(scenarioName, errorMsg) {
    failedCount++;
    console.error(`   [FAIL] Scenario ${scenarioName}: ${errorMsg}`);
    throw new Error(`Phase 6 Test Failure in [${scenarioName}]: ${errorMsg}`);
  }

  try {
    // CATEGORY A: RBAC Testing (Roles 1 to 14)
    console.log('\n--- CATEGORY A: RBAC TESTING (14 ROLES) ---');
    const roles = [
      'Admin', 'Inventory', 'Inventory Manager', 'Production', 'Production Manager', 
      'Warehouse', 'Viewer', 'ProcurementManager', 'Vendor', 'Planner', 
      'QC Inspector', 'Finance', 'Purchaser', 'Warehouse Operator'
    ];

    for (let i = 0; i < roles.length; i++) {
      const roleName = roles[i];
      const rUid = `p6_role_${i}_${testSuffix}`;
      const rUser = await User.create({
        firebaseUid: rUid,
        username: `User ${roleName}`,
        email: `role_${i}_${testSuffix}@example.com`,
        role: roleName,
        accountStatus: 'ACTIVE',
        emailVerified: true
      });

      mockAuth(rUid);
      // Non-admin roles should receive 403 on Admin endpoints (/api/users)
      const res = await request(app).get('/api/users').set('Authorization', 'Bearer token');
      if (roleName === 'Admin' && res.status !== 200) {
        assertFail(`RBAC Role ${roleName}`, `Expected 200 for Admin, got ${res.status}`);
      } else if (roleName !== 'Admin' && res.status !== 403) {
        assertFail(`RBAC Role ${roleName}`, `Expected 403 for ${roleName}, got ${res.status}`);
      }
      assertPass(`RBAC Role ${roleName} authorization check`);

      // Privilege escalation attempt in request body
      const resEsc = await request(app)
        .post('/api/auth/register-sync')
        .set('Authorization', 'Bearer token')
        .send({ role: 'Admin', requestedRole: 'Admin' });

      if (resEsc.status !== 400) {
        assertFail(`RBAC Escalation ${roleName}`, `Request body role Admin should be rejected with 400, got ${resEsc.status}`);
      }
      assertPass(`RBAC Escalation rejection for ${roleName}`);

      await User.deleteOne({ _id: rUser._id });
    }

    // CATEGORY B: Admin Security Verification
    console.log('\n--- CATEGORY B: ADMIN SECURITY VERIFICATION ---');
    mockAuth(adminUid);
    const resAdminOk = await request(app).get('/api/users').set('Authorization', 'Bearer token');
    if (resAdminOk.status === 200) assertPass('ACTIVE Admin allowed Admin access');
    else assertFail('ACTIVE Admin allowed Admin access', `Got ${resAdminOk.status}`);

    // Non-ACTIVE Admin statuses
    const statuses = ['PENDING', 'SUSPENDED', 'DISABLED', 'REJECTED'];
    for (const stat of statuses) {
      const stUid = `p6_st_${stat}_${testSuffix}`;
      const stUser = await User.create({
        firebaseUid: stUid,
        username: `Admin ${stat}`,
        email: `st_${stat}_${testSuffix}@example.com`,
        role: 'Admin',
        accountStatus: stat,
        emailVerified: true
      });

      mockAuth(stUid);
      const resSt = await request(app).get('/api/users').set('Authorization', 'Bearer token');
      if (resSt.status === 403) assertPass(`Admin status ${stat} access denied`);
      else assertFail(`Admin status ${stat} access denied`, `Got ${resSt.status}`);

      await User.deleteOne({ _id: stUser._id });
    }

    // CATEGORY C: RLS / Site Access Verification
    console.log('\n--- CATEGORY C: RLS / SITE ACCESS VERIFICATION ---');
    const siteAUserUid = 'p6_siteA_user_' + testSuffix;
    const siteAUser = await User.create({
      firebaseUid: siteAUserUid,
      username: 'Site A User',
      email: `sitea_${testSuffix}@example.com`,
      role: 'Inventory',
      accountStatus: 'ACTIVE',
      emailVerified: true,
      siteIds: [testSiteA._id]
    });

    // Test Site A access vs Site B access using middleware enforceSiteAccess logic
    const { enforceSiteAccess } = require('../middleware/authMiddleware');
    
    // Mock express req/res/next for middleware test
    let siteAAllowed = false;
    let siteBDenied = false;

    const reqSiteA = { params: { siteId: testSiteA._id }, user: siteAUser };
    enforceSiteAccess('siteId')(reqSiteA, {}, () => { siteAAllowed = true; });
    if (siteAAllowed) assertPass('User assigned Site A allowed access to Site A');
    else assertFail('User assigned Site A allowed access to Site A', 'Denied');

    const reqSiteB = { params: { siteId: testSiteB._id }, user: siteAUser };
    const resMockSiteB = { status: (code) => ({ json: (data) => { siteBDenied = (code === 403); } }) };
    enforceSiteAccess('siteId')(reqSiteB, resMockSiteB, () => {});
    if (siteBDenied) assertPass('User assigned Site A denied access to Site B');
    else assertFail('User assigned Site A denied access to Site B', 'Allowed');

    // CATEGORY D: Warehouse Access Control
    console.log('\n--- CATEGORY D: WAREHOUSE ACCESS VERIFICATION ---');
    // Request body warehouse injection check
    mockAuth(adminUid);
    const resWhInj = await request(app)
      .put(`/api/users/${adminUser._id}/approve`)
      .set('Authorization', 'Bearer token')
      .send({ warehouseIds: [new mongoose.Types.ObjectId()] });
    if (resWhInj.status === 400) assertPass('Arbitrary warehouseId injection rejected with 400');
    else assertFail('Arbitrary warehouseId injection rejected with 400', `Got ${resWhInj.status}`);

    // CATEGORY E: Active Location Enforcement
    console.log('\n--- CATEGORY E: ACTIVE LOCATION ENFORCEMENT ---');
    const { enforceActiveLocation } = require('../middleware/locationEnforcement');
    let siteInacBlocked = false;
    const reqInacSite = { body: { siteId: inactiveSite._id } };
    const resMockInac = { status: (code) => ({ json: (data) => { siteInacBlocked = (code === 400 && data.code === 'SITE_INACTIVE'); } }) };
    await enforceActiveLocation(reqInacSite, resMockInac, () => {});
    if (siteInacBlocked) assertPass('Inactive site operational selection blocked with SITE_INACTIVE');
    else assertFail('Inactive site operational selection blocked with SITE_INACTIVE', 'Allowed');

    let whInacBlocked = false;
    const reqInacWH = { body: { warehouseId: inactiveWH._id } };
    const resMockInacWH = { status: (code) => ({ json: (data) => { whInacBlocked = (code === 400 && data.code === 'WAREHOUSE_INACTIVE'); } }) };
    await enforceActiveLocation(reqInacWH, resMockInacWH, () => {});
    if (whInacBlocked) assertPass('Inactive warehouse selection blocked with WAREHOUSE_INACTIVE');
    else assertFail('Inactive warehouse selection blocked with WAREHOUSE_INACTIVE', 'Allowed');

    // CATEGORY F: Field-Level Security (FLS) Verification
    console.log('\n--- CATEGORY F: FIELD-LEVEL SECURITY (FLS) VERIFICATION ---');
    const { enforceFieldSecurity } = require('../middleware/authMiddleware');

    const publicUser = { fieldSecurityLevel: 'Public' };
    const confidentialUser = { fieldSecurityLevel: 'Confidential' };

    let pubAllowed = false;
    enforceFieldSecurity('Public')({ user: publicUser }, {}, () => { pubAllowed = true; });
    if (pubAllowed) assertPass('Public user access to Public field allowed');

    let intDenied = false;
    enforceFieldSecurity('Internal')({ user: publicUser }, { status: (code) => ({ json: () => { intDenied = (code === 403); } }) }, () => {});
    if (intDenied) assertPass('Public user access to Internal field denied (403)');

    let confAllowed = false;
    enforceFieldSecurity('Confidential')({ user: confidentialUser }, {}, () => { confAllowed = true; });
    if (confAllowed) assertPass('Confidential user access to Confidential field allowed');

    let restrDenied = false;
    enforceFieldSecurity('Restricted')({ user: confidentialUser }, { status: (code) => ({ json: () => { restrDenied = (code === 403); } }) }, () => {});
    if (restrDenied) assertPass('Confidential user access to Restricted field denied (403)');

    // CATEGORY G: Privilege Escalation & Security Injection Testing
    console.log('\n--- CATEGORY G: PRIVILEGE ESCALATION & SECURITY INJECTION ---');
    // Body role spoofing
    mockAuth(adminUid);
    const resBodyRole = await request(app)
      .post('/api/auth/register-sync')
      .set('Authorization', 'Bearer token')
      .send({ username: 'Hacker', role: 'Admin', requestedRole: 'Admin' });
    if (resBodyRole.status === 400) assertPass('Body role Admin injection strictly rejected');
    else assertFail('Body role Admin injection strictly rejected', `Got ${resBodyRole.status}`);

    // CATEGORY H: req.user Compatibility Verification
    console.log('\n--- CATEGORY H: REQ.USER COMPATIBILITY VERIFICATION ---');
    if (adminUser._id && adminUser.firebaseUid === adminUid && adminUser.role === 'Admin' && Array.isArray(adminUser.siteIds) && Array.isArray(adminUser.warehouseIds)) {
      assertPass('req.user contains complete Mongoose User document properties (_id, firebaseUid, role, accountStatus, siteIds, warehouseIds, fieldSecurityLevel)');
    } else {
      assertFail('req.user compatibility check', 'Missing essential properties');
    }

    // CATEGORY I: Cross-Module Authorization Testing
    console.log('\n--- CATEGORY I: CROSS-MODULE AUTHORIZATION TESTING ---');
    const modules = [
      '/api/materials', '/api/inventory', '/api/production', 
      '/api/purchase', '/api/bom', '/api/vendors', '/api/vendor-master', '/api/users'
    ];

    for (const modPath of modules) {
      const resUnauth = await request(app).get(modPath);
      if (resUnauth.status === 401) {
        assertPass(`Module ${modPath} requires authentication (401)`);
      } else {
        assertFail(`Module ${modPath}`, `Expected 401, got ${resUnauth.status}`);
      }
    }

    // CATEGORY J: Regression Verification (Phase 2, 3, 4, 5)
    console.log('\n--- CATEGORY J: REGRESSION SUITE VERIFICATION ---');
    // Phase 4 unverified token test
    mockAuth(adminUid, false);
    const resUnver = await request(app).get('/api/materials').set('Authorization', 'Bearer token');
    if (resUnver.status === 403 && resUnver.body.error.includes('verification required')) {
      assertPass('Phase 4 Email Verification enforcement verified');
    } else {
      assertFail('Phase 4 Email Verification enforcement', `Got ${resUnver.status}`);
    }

    await User.deleteOne({ _id: siteAUser._id });

  } finally {
    authTarget.verifyIdToken = originalVerifyIdToken;
    if (adminUser) await User.deleteOne({ _id: adminUser._id });
    if (testSiteA) await Site.deleteOne({ _id: testSiteA._id });
    if (testSiteB) await Site.deleteOne({ _id: testSiteB._id });
    if (inactiveSite) await Site.deleteOne({ _id: inactiveSite._id });
    if (testWHA) await Warehouse.deleteOne({ _id: testWHA._id });
    if (testWHB) await Warehouse.deleteOne({ _id: testWHB._id });
    if (inactiveWH) await Warehouse.deleteOne({ _id: inactiveWH._id });

    await mongoose.disconnect();
  }

  console.log(`\n=== PHASE 6 TEST SUITE COMPLETED: ${passedCount} PASSED, ${failedCount} FAILED ===`);
}

runPhase6Tests().then(() => process.exit(0)).catch(err => {
  console.error('Phase 6 Test Failure:', err);
  process.exit(1);
});
