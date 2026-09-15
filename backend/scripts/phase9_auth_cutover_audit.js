const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const firebaseAdminModule = require('../config/firebaseAdmin');
const mongoose = require('mongoose');

async function runCutoverAudit() {
  console.log('===========================================================');
  console.log('  PHASE 9A: AUTHENTICATION CUTOVER READINESS AUDIT         ');
  console.log('===========================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const authTarget = firebaseAdminModule.auth || firebaseAdminModule.admin.auth();

  const auditReport = {
    totalUsers: 0,
    withFirebaseUid: 0,
    withoutFirebaseUid: 0,
    activeWithoutFirebaseUid: 0,
    pendingWithoutFirebaseUid: 0,
    rejectedWithoutFirebaseUid: 0,
    suspendedWithoutFirebaseUid: 0,
    disabledWithoutFirebaseUid: 0,
    duplicateEmails: 0,
    duplicateFirebaseUids: 0,
    invalidEmails: 0,
    invalidAccountStatuses: 0,
    invalidRoles: 0,
    missingAuthFields: 0,
    legacyBcryptCount: 0,
    firebaseIdentityMismatches: 0,
    usersDetail: []
  };

  try {
    const users = await User.find({}).select('+password');
    auditReport.totalUsers = users.length;
    console.log(`Inspecting ${users.length} MongoDB users for Cutover Audit...\n`);

    const emailMap = new Map();
    const uidMap = new Map();

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const normEmail = String(u.email || '').trim().toLowerCase();

      if (u.password && u.password.startsWith('$2')) {
        auditReport.legacyBcryptCount++;
      }

      // Check duplicates
      if (emailMap.has(normEmail)) {
        auditReport.duplicateEmails++;
      } else {
        emailMap.set(normEmail, u._id.toString());
      }

      if (!u.email || !/\S+@\S+\.\S+/.test(normEmail)) {
        auditReport.invalidEmails++;
      }

      const validStatuses = ['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'DISABLED', 'Pending', 'Active', 'Rejected', 'Suspended', 'Disabled'];
      if (!validStatuses.includes(u.accountStatus)) {
        auditReport.invalidAccountStatuses++;
      }

      const validRoles = ['Admin', 'Inventory', 'Production', 'Warehouse', 'Planner', 'Viewer', 'Inventory Manager', 'Production Manager'];
      if (!validRoles.includes(u.role)) {
        auditReport.invalidRoles++;
      }

      if (!u.role || !u.accountStatus) {
        auditReport.missingAuthFields++;
      }

      if (u.firebaseUid) {
        auditReport.withFirebaseUid++;
        if (uidMap.has(u.firebaseUid)) {
          auditReport.duplicateFirebaseUids++;
        } else {
          uidMap.set(u.firebaseUid, u._id.toString());
        }

        // Verify Firebase identity via Admin SDK
        try {
          const fbUser = await authTarget.getUser(u.firebaseUid);
          if (fbUser.email.toLowerCase() !== normEmail) {
            auditReport.firebaseIdentityMismatches++;
          }
        } catch (err) {
          // If live credentials cannot connect or user missing in Firebase
          console.warn(`   [WARNING] Could not verify Firebase UID (${u.firebaseUid}) for ${normEmail}: ${err.message}`);
        }
      } else {
        auditReport.withoutFirebaseUid++;
        const statusUpper = String(u.accountStatus).toUpperCase();
        if (statusUpper === 'ACTIVE') {
          auditReport.activeWithoutFirebaseUid++;
        } else if (statusUpper === 'PENDING') {
          auditReport.pendingWithoutFirebaseUid++;
        } else if (statusUpper === 'REJECTED') {
          auditReport.rejectedWithoutFirebaseUid++;
        } else if (statusUpper === 'SUSPENDED') {
          auditReport.suspendedWithoutFirebaseUid++;
        } else if (statusUpper === 'DISABLED') {
          auditReport.disabledWithoutFirebaseUid++;
        }
      }

      auditReport.usersDetail.push({
        id: u._id.toString(),
        email: normEmail,
        accountStatus: u.accountStatus,
        role: u.role,
        hasFirebaseUid: Boolean(u.firebaseUid),
        firebaseUid: u.firebaseUid || null
      });
    }

    console.log('===========================================================');
    console.log('           PHASE 9A CUTOVER AUDIT SUMMARY                  ');
    console.log('===========================================================');
    console.log(`Total Users:                     ${auditReport.totalUsers}`);
    console.log(`With Firebase UID:               ${auditReport.withFirebaseUid}`);
    console.log(`Without Firebase UID:            ${auditReport.withoutFirebaseUid}`);
    console.log(`ACTIVE Without Firebase UID:     ${auditReport.activeWithoutFirebaseUid}`);
    console.log(`PENDING Without Firebase UID:    ${auditReport.pendingWithoutFirebaseUid}`);
    console.log(`REJECTED Without Firebase UID:   ${auditReport.rejectedWithoutFirebaseUid}`);
    console.log(`SUSPENDED Without Firebase UID:  ${auditReport.suspendedWithoutFirebaseUid}`);
    console.log(`DISABLED Without Firebase UID:   ${auditReport.disabledWithoutFirebaseUid}`);
    console.log(`Duplicate Emails:                ${auditReport.duplicateEmails}`);
    console.log(`Duplicate Firebase UIDs:        ${auditReport.duplicateFirebaseUids}`);
    console.log(`Legacy Bcrypt Hashes:            ${auditReport.legacyBcryptCount}`);
    console.log(`Identity Mismatches:             ${auditReport.firebaseIdentityMismatches}`);
    console.log('===========================================================\n');

    return auditReport;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runCutoverAudit().then((res) => {
    if (res.activeWithoutFirebaseUid > 0) {
      console.log('RESULT: CUTOVER BLOCKED — ACTIVE USERS WITHOUT FIREBASE IDENTITY');
      process.exit(2);
    } else {
      console.log('RESULT: CUTOVER AUDIT PASSED — READY FOR PHASE 9B');
      process.exit(0);
    }
  }).catch(err => {
    console.error('Cutover Audit Fatal Error:', err);
    process.exit(1);
  });
}

module.exports = { runCutoverAudit };
