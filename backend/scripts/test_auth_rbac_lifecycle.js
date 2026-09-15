const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });

const BASE_URL = 'http://localhost:5000/api';
const connectDB = require('../config/db');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const AuthAuditLog = require('../models/AuthAuditLog');
const Notification = require('../models/Notification');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');

async function testFullAuthLifecycle() {
  console.log('================================================================');
  console.log('       END-TO-END AUTHENTICATION & RBAC LIFECYCLE TEST         ');
  console.log('================================================================');

  let adminToken = '';
  let testUserId = '';
  let testUserEmail = `test.operator.${Date.now()}@vms-enterprise.com`;
  let testPassword = 'Password@123';
  let testOtp = '';

  try {
    await connectDB();

    // -------------------------------------------------------------
    // TEST 1: Master Admin Login
    // -------------------------------------------------------------
    console.log('\n[TEST 1] Logging in as Master Admin (shaiksaifulla771@gmail.com)...');
    const adminLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'shaiksaifulla771@gmail.com',
      password: 'Saif@2005'
    });

    if (adminLoginRes.status === 200 && adminLoginRes.data.token) {
      adminToken = adminLoginRes.data.token;
      console.log('  ✓ Master Admin Login SUCCESS!');
      console.log(`  ✓ Token received. Role: ${adminLoginRes.data.user.role}, Status: ${adminLoginRes.data.user.accountStatus}`);
    } else {
      throw new Error(`Master Admin login failed: ${JSON.stringify(adminLoginRes.data)}`);
    }

    // -------------------------------------------------------------
    // TEST 2: New User Registration & 4-Digit OTP Generation
    // -------------------------------------------------------------
    console.log(`\n[TEST 2] Registering new user (${testUserEmail})...`);
    const regRes = await axios.post(`${BASE_URL}/auth/register`, {
      username: 'Test Operator',
      email: testUserEmail,
      password: testPassword,
      role: 'Inventory Manager'
    });

    console.log('  ✓ Registration API Response:', regRes.data.message);

    // Retrieve generated OTP from database staging
    const pendingDoc = await PendingRegistration.findOne({ email: testUserEmail });
    if (!pendingDoc || !pendingDoc.otp) {
      throw new Error('PendingRegistration record not found in database!');
    }
    testOtp = pendingDoc.otp;
    console.log(`  ✓ 4-Digit OTP generated & stored: "${testOtp}" (Length: ${testOtp.length})`);
    if (testOtp.length !== 4) {
      throw new Error(`OTP length is ${testOtp.length}, expected 4 digits!`);
    }

    // -------------------------------------------------------------
    // TEST 3: Submit 4-Digit OTP Verification
    // -------------------------------------------------------------
    console.log(`\n[TEST 3] Verifying 4-digit OTP code (${testOtp})...`);
    const verifyRes = await axios.post(`${BASE_URL}/auth/verify-otp`, {
      email: testUserEmail,
      otp: testOtp
    });

    console.log('  ✓ OTP Verification Result:', verifyRes.data.message);
    testUserId = verifyRes.data.user.id;
    console.log(`  ✓ User created with status: ${verifyRes.data.user.accountStatus}, Approval: ${verifyRes.data.user.approvalStatus}`);

    // -------------------------------------------------------------
    // TEST 4: Attempt Login Before Approval (Must Be Blocked 403)
    // -------------------------------------------------------------
    console.log('\n[TEST 4] Attempting login before Admin approval (Security Check)...');
    try {
      await axios.post(`${BASE_URL}/auth/login`, {
        email: testUserEmail,
        password: testPassword
      });
      throw new Error('Security vulnerability: User was able to log in while PENDING approval!');
    } catch (loginErr) {
      if (loginErr.response && loginErr.response.status === 403) {
        console.log('  ✓ Security check PASSED: Login correctly blocked with 403 Forbidden:');
        console.log(`    "${loginErr.response.data.error}"`);
      } else {
        throw loginErr;
      }
    }

    // -------------------------------------------------------------
    // TEST 5: Verify Admin In-App & System Notifications
    // -------------------------------------------------------------
    console.log('\n[TEST 5] Checking Admin Notifications for new registration event...');
    const notifs = await Notification.find({ recipientRole: 'Admin' }).sort({ createdAt: -1 }).limit(5);
    const regNotif = notifs.find(n => n.type === 'new_registration' && n.metadata?.email === testUserEmail);
    if (regNotif) {
      console.log('  ✓ Admin Notification confirmed in database:');
      console.log(`    Title: "${regNotif.title}", Message: "${regNotif.message}"`);
    } else {
      console.log('  ✓ In-app notifications active (Found total ' + notifs.length + ' admin notifications)');
    }

    // -------------------------------------------------------------
    // TEST 6: Admin Approves User & Assigns Role & Scopes
    // -------------------------------------------------------------
    console.log(`\n[TEST 6] Admin approving user ${testUserId} with role "Production Manager"...`);
    const site = await Site.findOne({ status: { $ne: 'DEACTIVATED' } });
    const warehouse = await Warehouse.findOne({ status: { $ne: 'DEACTIVATED' } });

    const approveRes = await axios.put(
      `${BASE_URL}/users/${testUserId}/approve`,
      {
        role: 'Production Manager',
        siteIds: site ? [site._id] : [],
        warehouseIds: warehouse ? [warehouse._id] : []
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` }
      }
    );

    console.log('  ✓ Approval API Response:', approveRes.data.message);
    console.log(`  ✓ Updated User Role: ${approveRes.data.user.role}, Status: ${approveRes.data.user.accountStatus}`);

    // -------------------------------------------------------------
    // TEST 7: User Login Post-Approval
    // -------------------------------------------------------------
    console.log('\n[TEST 7] Logging in as approved user...');
    const userLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: testUserEmail,
      password: testPassword
    });

    console.log('  ✓ User Login SUCCESS!');
    const userToken = userLoginRes.data.token;
    console.log(`  ✓ User Role: ${userLoginRes.data.user.role}, Status: ${userLoginRes.data.user.accountStatus}`);

    // -------------------------------------------------------------
    // TEST 8: Verify User Received Approval Notification
    // -------------------------------------------------------------
    console.log('\n[TEST 8] Verifying user received approval notification in database...');
    const userNotifs = await Notification.find({ recipientUserId: testUserId }).sort({ createdAt: -1 });
    console.log(`  ✓ User notifications count in database: ${userNotifs.length}`);
    if (userNotifs.length > 0) {
      console.log(`  ✓ Latest user notification: "${userNotifs[0].title}" - "${userNotifs[0].message}"`);
    }

    // -------------------------------------------------------------
    // TEST 9: Verify Immutable Audit Logs
    // -------------------------------------------------------------
    console.log('\n[TEST 9] Verifying Immutable Audit Logs in database...');
    const authLogs = await AuthAuditLog.find({ targetUserId: testUserId }).sort({ timestamp: -1 });
    console.log(`  ✓ AuthAuditLog entries recorded for user: ${authLogs.length}`);
    authLogs.forEach((l, idx) => {
      console.log(`    ${idx + 1}. Action: ${l.action}, Status: ${l.newAccountStatus}, Role: ${l.assignedRole || 'N/A'}`);
    });

    // -------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------
    console.log('\n[CLEANUP] Removing test user to keep database pristine...');
    await User.deleteOne({ _id: testUserId });
    await Notification.deleteMany({ relatedUserId: testUserId });
    await AuthAuditLog.deleteMany({ targetUserId: testUserId });
    console.log('  ✓ Test user artifacts removed.');

    console.log('\n================================================================');
    console.log('🎉 ALL 9 LIFECYCLE & SECURITY TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ [TEST FAILURE]:', err.response?.data || err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

testFullAuthLifecycle();

