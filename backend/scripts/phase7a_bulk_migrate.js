const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const AuthAuditLog = require('../models/AuthAuditLog');
const firebaseAdminModule = require('../config/firebaseAdmin');
const mongoose = require('mongoose');
const crypto = require('crypto');

async function executeBulkMigration() {
  console.log('====================================================');
  console.log('  PHASE 7A: CONTROLLED BULK LEGACY USER MIGRATION   ');
  console.log('====================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const authTarget = firebaseAdminModule.auth || firebaseAdminModule.admin.auth();

  const migrationStartTime = new Date();
  const report = {
    startTime: migrationStartTime,
    endTime: null,
    projectId: process.env.FIREBASE_PROJECT_ID || 'vendor-management-system-b1791',
    totalInspected: 0,
    alreadyLinked: 0,
    newlyCreatedFirebase: 0,
    reconciledUsers: 0,
    successfullyLinked: 0,
    failedUsers: 0,
    identityConflicts: 0,
    authorizationPreservationVerified: true,
    userResults: []
  };

  try {
    // Step 1: Pre-migration freeze & candidate fetch
    const users = await User.find({}).select('+password').sort({ createdAt: 1 });
    report.totalInspected = users.length;
    console.log(`Inspecting ${users.length} MongoDB users for Phase 7A Migration...\n`);

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const normEmail = String(u.email || '').trim().toLowerCase();
      console.log(`[${i + 1}/${users.length}] Processing User: ${u.username} (${normEmail})...`);

      // Capture before authorization snapshot
      const beforeSnapshot = {
        id: u._id.toString(),
        role: u.role,
        accountStatus: u.accountStatus,
        siteIds: (u.siteIds || []).map(id => id.toString()),
        warehouseIds: (u.warehouseIds || []).map(id => id.toString()),
        fieldSecurityLevel: u.fieldSecurityLevel || 'Internal',
        emailVerified: u.emailVerified || false
      };

      let firebaseUser = null;
      try {
        firebaseUser = await authTarget.getUserByEmail(normEmail);
      } catch (fbErr) {
        if (fbErr.code !== 'auth/user-not-found') {
          console.error(`   [ERROR] Firebase lookup error for ${normEmail}:`, fbErr.message);
          report.failedUsers++;
          report.userResults.push({ email: normEmail, status: 'FAILED', error: fbErr.message });
          continue;
        }
      }

      let targetUid = null;
      let actionTaken = 'NONE';

      if (u.firebaseUid) {
        if (firebaseUser) {
          if (firebaseUser.uid === u.firebaseUid) {
            report.alreadyLinked++;
            report.reconciledUsers++;
            actionTaken = 'RECONCILED_ALREADY_LINKED';
            console.log(`   [RECONCILED] Account already linked to Firebase UID: ${u.firebaseUid}`);
          } else {
            report.identityConflicts++;
            report.failedUsers++;
            actionTaken = 'IDENTITY_CONFLICT';
            console.error(`   [CONFLICT] MongoDB UID (${u.firebaseUid}) != Firebase UID (${firebaseUser.uid})`);
            await AuthAuditLog.create({
              action: 'MIGRATION_FAILED',
              targetUserId: u._id,
              targetFirebaseUid: firebaseUser.uid,
              targetEmail: normEmail,
              newAccountStatus: 'IDENTITY_CONFLICT',
              timestamp: new Date()
            }).catch(() => {});
            report.userResults.push({ email: normEmail, status: 'IDENTITY_CONFLICT', error: 'Conflicting UIDs' });
            continue;
          }
        } else {
          // MongoDB has firebaseUid, but missing in Firebase Auth -> Re-create in Firebase Auth
          const tempPassword = 'VmsMigratedPass#' + crypto.randomBytes(4).toString('hex');
          firebaseUser = await authTarget.createUser({
            uid: u.firebaseUid,
            email: normEmail,
            password: tempPassword,
            emailVerified: u.emailVerified || false,
            displayName: u.username || normEmail.split('@')[0]
          });
          report.newlyCreatedFirebase++;
          actionTaken = 'RECREATED_IN_FIREBASE';
          console.log(`   [CREATED] Re-created Firebase User with UID: ${firebaseUser.uid}`);
        }
        targetUid = u.firebaseUid;
      } else {
        if (firebaseUser) {
          targetUid = firebaseUser.uid;
          report.reconciledUsers++;
          actionTaken = 'LINKED_EXISTING_FIREBASE_USER';
          console.log(`   [RECONCILED] Existing Firebase User found with UID: ${targetUid}`);
        } else {
          const tempPassword = 'VmsMigratedPass#' + crypto.randomBytes(4).toString('hex');
          firebaseUser = await authTarget.createUser({
            email: normEmail,
            password: tempPassword,
            emailVerified: u.emailVerified || false,
            displayName: u.username || normEmail.split('@')[0]
          });
          targetUid = firebaseUser.uid;
          report.newlyCreatedFirebase++;
          actionTaken = 'CREATED_NEW_FIREBASE_USER';
          console.log(`   [CREATED] Created new Firebase User with UID: ${targetUid}`);
        }

        // Atomic MongoDB Linkage
        const updatedUser = await User.findOneAndUpdate(
          {
            _id: u._id,
            $or: [
              { firebaseUid: null },
              { firebaseUid: { $exists: false } },
              { firebaseUid: targetUid }
            ]
          },
          { $set: { firebaseUid: targetUid } },
          { new: true }
        );

        if (!updatedUser) {
          report.failedUsers++;
          report.identityConflicts++;
          console.error(`   [FAIL] Atomic MongoDB update failed for ${normEmail}`);
          await AuthAuditLog.create({
            action: 'MIGRATION_FAILED',
            targetUserId: u._id,
            targetFirebaseUid: targetUid,
            targetEmail: normEmail,
            newAccountStatus: 'LINK_FAILED',
            timestamp: new Date()
          }).catch(() => {});
          report.userResults.push({ email: normEmail, status: 'LINK_FAILED' });
          continue;
        }

        report.successfullyLinked++;
      }

      // Verify post-migration authorization snapshot
      const reFetched = await User.findById(u._id);
      const afterSnapshot = {
        id: reFetched._id.toString(),
        role: reFetched.role,
        accountStatus: reFetched.accountStatus,
        siteIds: (reFetched.siteIds || []).map(id => id.toString()),
        warehouseIds: (reFetched.warehouseIds || []).map(id => id.toString()),
        fieldSecurityLevel: reFetched.fieldSecurityLevel || 'Internal',
        emailVerified: reFetched.emailVerified || false
      };

      if (JSON.stringify(beforeSnapshot) !== JSON.stringify(afterSnapshot)) {
        report.authorizationPreservationVerified = false;
        console.error(`   [INTEGRITY ERROR] Authorization snapshot mutated for ${normEmail}!`);
        throw new Error(`CRITICAL INTEGRITY FAILURE: Authorization modified for ${normEmail}`);
      }

      await AuthAuditLog.create({
        action: actionTaken.includes('RECONCILED') ? 'MIGRATION_SUCCESS' : 'MIGRATION_SUCCESS',
        targetUserId: u._id,
        targetFirebaseUid: targetUid,
        targetEmail: normEmail,
        requesterUserId: u._id,
        requesterEmail: normEmail,
        previousAccountStatus: u.accountStatus,
        newAccountStatus: u.accountStatus,
        assignedRole: u.role,
        assignedSiteIds: u.siteIds,
        assignedWarehouseIds: u.warehouseIds,
        timestamp: new Date()
      }).catch(() => {});

      report.userResults.push({
        email: normEmail,
        mongoId: u._id.toString(),
        firebaseUid: targetUid,
        status: 'SUCCESS',
        actionTaken: actionTaken,
        accountStatus: u.accountStatus,
        role: u.role
      });
    }

    report.endTime = new Date();
    console.log('\n====================================================');
    console.log('          BULK MIGRATION SUMMARY REPORT             ');
    console.log('====================================================');
    console.log(`Total Inspected:       ${report.totalInspected}`);
    console.log(`Already Linked:        ${report.alreadyLinked}`);
    console.log(`Newly Created:         ${report.newlyCreatedFirebase}`);
    console.log(`Reconciled:            ${report.reconciledUsers}`);
    console.log(`Successfully Linked:   ${report.successfullyLinked}`);
    console.log(`Failed Users:          ${report.failedUsers}`);
    console.log(`Identity Conflicts:    ${report.identityConflicts}`);
    console.log(`Auth Preservation:     ${report.authorizationPreservationVerified ? '100% VERIFIED' : 'FAILED'}`);
    console.log('====================================================\n');

    return report;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  executeBulkMigration().then(() => process.exit(0)).catch(err => {
    console.error('Bulk Migration Fatal Error:', err);
    process.exit(1);
  });
}

module.exports = { executeBulkMigration };
