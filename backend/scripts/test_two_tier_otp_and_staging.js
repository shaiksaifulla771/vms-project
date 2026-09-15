const request = require('supertest');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = require('../app');
const connectDB = require('../config/db');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const AuthAuditLog = require('../models/AuthAuditLog');
const Notification = require('../models/Notification');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');


const EmailQueue = require('../models/EmailQueue');

async function runTwoTierStagingVerification() {
  console.log('================================================================');
  console.log('    TEST: TWO-TIER 4-DIGIT OTP STAGING & ADMIN APPROVAL/PURGE   ');
  console.log('================================================================');

  let adminToken = '';
  const testEmail1 = `staged.operator.${Date.now()}@vms-demo.com`;
  const testPassword = 'Password@2025';
  let pendingId1 = '';
  let otp1 = '';

  const testEmail2 = `rejected.user.${Date.now()}@vms-demo.com`;
  let pendingId2 = '';
  let otp2 = '';

  try {
    await connectDB();

    // -------------------------------------------------------------
    // STEP 1: Admin Login
    // -------------------------------------------------------------
    console.log('\n[STEP 1] Logging in as Master Admin (shaiksaifulla771@gmail.com)...');
    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'shaiksaifulla771@gmail.com', password: 'Saif@2005' });

    if (adminLoginRes.status !== 200) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminLoginRes.body)}`);
    }
    adminToken = adminLoginRes.body.token;
    console.log('  ✓ Admin Login SUCCESS! Token received.');

    // -------------------------------------------------------------
    // STEP 2: Register User 1 & Verify Temporary Staging (NO User in DB)
    // -------------------------------------------------------------
    console.log(`\n[STEP 2] Registering user (${testEmail1})...`);
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'Staged Operator',
        email: testEmail1,
        password: testPassword,
        role: 'Inventory Manager'
      });

    console.log('  ✓ Registration Response:', regRes.body.message);

    // Verify PendingRegistration has the document with bcrypt otpHash
    const pendingDoc1 = await PendingRegistration.findOne({ email: testEmail1 });
    if (!pendingDoc1 || !pendingDoc1.otpHash) {
      throw new Error('PendingRegistration doc with bcrypt otpHash not found in database!');
    }
    pendingId1 = pendingDoc1._id.toString();

    // Extract OTP from EmailQueue to simulate user reading their email inbox
    const emailQueueDoc1 = await EmailQueue.findOne({ recipient: testEmail1 }).sort({ createdAt: -1 });
    const match1 = emailQueueDoc1 ? emailQueueDoc1.textBody.match(/verification code is (\d{4})/) : null;
    if (!match1) {
      throw new Error('Failed to find 4-digit OTP in queued verification email!');
    }
    otp1 = match1[1];
    console.log(`  ✓ 4-Digit OTP in queued email: "${otp1}" (Length: ${otp1.length})`);
    console.log(`  ✓ Bcrypt OTP Hash stored: ${pendingDoc1.otpHash.substring(0, 20)}...`);
    console.log(`  ✓ PendingRegistration status: "${pendingDoc1.status}", isOtpVerified: ${pendingDoc1.isOtpVerified}`);

    // CRITICAL CHECK: Ensure user is NOT saved in User collection
    const userInDbBeforeOtp = await User.findOne({ email: testEmail1 });
    if (userInDbBeforeOtp) {
      throw new Error('VIOLATION: User was inserted into User collection before OTP was entered!');
    }
    console.log('  ✓ PASSED: User is NOT in `users` collection. Stored ONLY in temporary `PendingRegistration` staging.');

    // -------------------------------------------------------------
    // STEP 3: Verify 4-Digit OTP Entry
    // -------------------------------------------------------------
    console.log(`\n[STEP 3] User enters 4-digit OTP code (${otp1})...`);
    const verifyOtpRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: testEmail1, otp: otp1 });

    console.log('  ✓ OTP Verification Response:', verifyOtpRes.body.message);

    // Check PendingRegistration status after OTP
    const pendingDocAfterOtp = await PendingRegistration.findOne({ email: testEmail1 });
    if (!pendingDocAfterOtp || !pendingDocAfterOtp.isOtpVerified) {
      throw new Error('PendingRegistration did not update isOtpVerified to true!');
    }
    console.log(`  ✓ PendingRegistration updated: status = "${pendingDocAfterOtp.status}", isOtpVerified = true`);

    // CRITICAL CHECK: Still NO record in `users` collection!
    const userInDbAfterOtp = await User.findOne({ email: testEmail1 });
    if (userInDbAfterOtp) {
      throw new Error('VIOLATION: User was inserted into `users` collection before Admin approval!');
    }
    console.log('  ✓ PASSED: User is STILL NOT in `users` collection. Awaiting Admin Approval.');

    // -------------------------------------------------------------
    // STEP 4: Attempt Login Before Admin Approval (Must be 403)
    // -------------------------------------------------------------
    console.log('\n[STEP 4] Attempting login before Admin approval...');
    const loginBeforeApproveRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail1, password: testPassword });

    if (loginBeforeApproveRes.status === 403) {
      console.log('  ✓ PASSED: Login properly blocked with 403 Forbidden:');
      console.log(`    "${loginBeforeApproveRes.body.error}"`);
    } else {
      throw new Error(`VIOLATION: Login returned status ${loginBeforeApproveRes.status} instead of 403!`);
    }

    // -------------------------------------------------------------
    // STEP 5: Admin Views Pending User List
    // -------------------------------------------------------------
    console.log('\n[STEP 5] Admin queries pending user list (GET /api/users)...');
    const usersListRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    const foundPendingInList = usersListRes.body.data.find(u => u.email === testEmail1);
    if (!foundPendingInList) {
      throw new Error('Pending staged user not returned in Admin user list!');
    }
    console.log(`  ✓ Admin sees pending registration: ${foundPendingInList.username} (${foundPendingInList.email}) - Status: ${foundPendingInList.accountStatus}`);

    // -------------------------------------------------------------
    // STEP 6: Admin Approves User & Assigns Role
    // -------------------------------------------------------------
    console.log(`\n[STEP 6] Admin approving user ${pendingId1} with role "Inventory Manager"...`);
    const site = await Site.findOne({ status: { $ne: 'DEACTIVATED' } });
    const warehouse = await Warehouse.findOne({ status: { $ne: 'DEACTIVATED' } });

    const approveRes = await request(app)
      .put(`/api/users/${pendingId1}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        role: 'Inventory Manager',
        siteIds: site ? [site._id] : [],
        warehouseIds: warehouse ? [warehouse._id] : []
      });

    console.log('  ✓ Approval Response:', approveRes.body.message);

    // CRITICAL CHECK: User is NOW permanently created in `users` collection
    const permanentUser = await User.findOne({ email: testEmail1 });
    if (!permanentUser) {
      throw new Error('User was NOT created in `users` collection upon Admin approval!');
    }
    console.log(`  ✓ PASSED: User is NOW permanently stored in database:`);
    console.log(`    ID: ${permanentUser._id}, Role: ${permanentUser.role}, Status: ${permanentUser.accountStatus}, UserCode: ${permanentUser.userCode}`);

    // CRITICAL CHECK: Temporary PendingRegistration is deleted
    const stagedRecordAfterApproval = await PendingRegistration.findOne({ email: testEmail1 });
    if (stagedRecordAfterApproval) {
      throw new Error('Temporary PendingRegistration was not cleaned up after approval!');
    }
    console.log('  ✓ PASSED: Temporary staging record cleaned up from `PendingRegistration`.');

    // -------------------------------------------------------------
    // STEP 7: Approved User Signs In
    // -------------------------------------------------------------
    console.log('\n[STEP 7] Approved user logs in...');
    const userLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail1, password: testPassword });

    console.log(`  ✓ User Login SUCCESS! Role: ${userLoginRes.body.user.role}, Status: ${userLoginRes.body.user.accountStatus}`);

    // -------------------------------------------------------------
    // STEP 8: Test Rejection & Complete Database Purge
    // -------------------------------------------------------------
    console.log(`\n[STEP 8] Testing Rejection Flow with user 2 (${testEmail2})...`);
    // 1. Register user 2
    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'Rejected Candidate',
        email: testEmail2,
        password: testPassword,
        role: 'Viewer'
      });

    const pendingDoc2 = await PendingRegistration.findOne({ email: testEmail2 });
    pendingId2 = pendingDoc2._id.toString();

    const emailQueueDoc2 = await EmailQueue.findOne({ recipient: testEmail2 }).sort({ createdAt: -1 });
    const match2 = emailQueueDoc2 ? emailQueueDoc2.textBody.match(/verification code is (\d{4})/) : null;
    if (!match2) {
      throw new Error('Failed to find 4-digit OTP in queued verification email for user 2!');
    }
    otp2 = match2[1];

    // 2. User 2 enters OTP
    await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: testEmail2, otp: otp2 });
    console.log('  ✓ User 2 entered OTP, now in staging.');

    // 3. Admin rejects user 2
    console.log(`  Admin rejecting user 2 (${pendingId2})...`);
    const rejectRes = await request(app)
      .put(`/api/users/${pendingId2}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Role request not aligned with current facility staffing.' });

    console.log('  ✓ Rejection API Response:', rejectRes.body.message);

    // CRITICAL CHECK: Verify user 2 is COMPLETELY DELETED from database
    const rejectedInPending = await PendingRegistration.findOne({ email: testEmail2 });
    const rejectedInUsers = await User.findOne({ email: testEmail2 });
    if (rejectedInPending || rejectedInUsers) {
      throw new Error('VIOLATION: Rejected user data was not deleted from database!');
    }
    console.log('  ✓ PASSED: Rejected user is COMPLETELY DELETED from database.');

    // -------------------------------------------------------------
    // CLEANUP USER 1
    // -------------------------------------------------------------
    console.log('\n[CLEANUP] Removing test user 1...');
    await User.deleteOne({ _id: permanentUser._id });
    await Notification.deleteMany({ relatedUserId: permanentUser._id });
    await AuthAuditLog.deleteMany({ targetEmail: testEmail1 });
    await AuthAuditLog.deleteMany({ targetEmail: testEmail2 });
    console.log('  ✓ Test artifacts cleaned up.');

    console.log('\n================================================================');
    console.log('🎉 ALL TWO-TIER STAGING, OTP, & PURGE TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ [TEST FAILURE]:', err.response?.data || err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runTwoTierStagingVerification();
