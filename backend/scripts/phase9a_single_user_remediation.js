const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const AuthAuditLog = require('../models/AuthAuditLog');
const firebaseAdminModule = require('../config/firebaseAdmin');
const mongoose = require('mongoose');
const crypto = require('crypto');

async function migrateSingleActiveUser(targetEmail) {
  console.log(`=== PHASE 9A CONTROLLED SINGLE-USER MIGRATION: ${targetEmail} ===\n`);

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const authTarget = firebaseAdminModule.auth || firebaseAdminModule.admin.auth();

  try {
    const normEmail = String(targetEmail).trim().toLowerCase();
    const u = await User.findOne({ email: normEmail }).select('+password');
    if (!u) throw new Error(`User not found in MongoDB: ${normEmail}`);

    console.log(`Target User Found: _id=${u._id}, accountStatus=${u.accountStatus}, role=${u.role}`);

    // Capture BEFORE authorization snapshot
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
      console.log(`Found existing Firebase User with UID: ${firebaseUser.uid}`);
    } catch (fbErr) {
      if (fbErr.code !== 'auth/user-not-found') throw fbErr;
    }

    if (!firebaseUser) {
      const tempPass = 'VmsMigratedPass#' + crypto.randomBytes(4).toString('hex');
      firebaseUser = await authTarget.createUser({
        email: normEmail,
        password: tempPass,
        emailVerified: u.emailVerified || false,
        displayName: u.username || normEmail.split('@')[0]
      });
      console.log(`Created new Firebase User with UID: ${firebaseUser.uid}`);
    }

    const targetUid = firebaseUser.uid;

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

    if (!updatedUser) throw new Error('Atomic MongoDB update failed');

    // Verify AFTER authorization snapshot
    const afterSnapshot = {
      id: updatedUser._id.toString(),
      role: updatedUser.role,
      accountStatus: updatedUser.accountStatus,
      siteIds: (updatedUser.siteIds || []).map(id => id.toString()),
      warehouseIds: (updatedUser.warehouseIds || []).map(id => id.toString()),
      fieldSecurityLevel: updatedUser.fieldSecurityLevel || 'Internal',
      emailVerified: updatedUser.emailVerified || false
    };

    if (JSON.stringify(beforeSnapshot) !== JSON.stringify(afterSnapshot)) {
      throw new Error('CRITICAL INTEGRITY FAILURE: Authorization snapshot mutated!');
    }

    await AuthAuditLog.create({
      action: 'MIGRATION_SUCCESS',
      targetUserId: u._id,
      targetFirebaseUid: targetUid,
      targetEmail: normEmail,
      previousAccountStatus: u.accountStatus,
      newAccountStatus: u.accountStatus,
      assignedRole: u.role,
      timestamp: new Date()
    }).catch(() => {});

    console.log('\n=== SINGLE-USER MIGRATION VERIFIED 100% SUCCESSFUL ===');
    console.log(`Linked Firebase UID: ${updatedUser.firebaseUid}`);
    console.log(`Account Status:       ${updatedUser.accountStatus} (UNMUTATED)`);
    console.log(`Role:                 ${updatedUser.role} (UNMUTATED)`);
    return updatedUser;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  const target = process.argv[2] || 'saifullakah@gmail.com';
  migrateSingleActiveUser(target).then(() => process.exit(0)).catch(err => {
    console.error('Single User Remediation Error:', err);
    process.exit(1);
  });
}

module.exports = { migrateSingleActiveUser };
