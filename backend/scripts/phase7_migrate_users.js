const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const AuthAuditLog = require('../models/AuthAuditLog');
const firebaseAdminModule = require('../config/firebaseAdmin');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function migrateSingleUser(userEmail, rawPassword) {
  console.log(`=== PHASE 7 CONTROLLED MIGRATION FOR [${userEmail}] ===`);
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const authTarget = firebaseAdminModule.auth || firebaseAdminModule.admin.auth();

  try {
    const normEmail = String(userEmail).trim().toLowerCase();
    const user = await User.findOne({ email: normEmail }).select('+password');

    if (!user) {
      throw new Error(`User [${normEmail}] not found in MongoDB`);
    }

    if (!user.password) {
      throw new Error(`User [${normEmail}] has no password hash`);
    }

    const isMatch = await bcrypt.compare(rawPassword, user.password);
    if (!isMatch) {
      throw new Error(`Bcrypt password verification failed for [${normEmail}]`);
    }

    // Capture initial authorization snapshot
    const initialAuthSnapshot = {
      role: user.role,
      accountStatus: user.accountStatus,
      siteIds: (user.siteIds || []).map(id => id.toString()),
      warehouseIds: (user.warehouseIds || []).map(id => id.toString()),
      fieldSecurityLevel: user.fieldSecurityLevel || 'Internal'
    };

    let firebaseUser = null;
    try {
      firebaseUser = await authTarget.getUserByEmail(normEmail);
    } catch (fbErr) {
      if (fbErr.code !== 'auth/user-not-found') throw fbErr;
    }

    if (!firebaseUser) {
      firebaseUser = await authTarget.createUser({
        email: normEmail,
        password: rawPassword,
        emailVerified: user.emailVerified || false,
        displayName: user.username || normEmail.split('@')[0]
      });
      console.log(`   [FIREBASE] Created new Firebase User with UID: ${firebaseUser.uid}`);
    } else {
      if (user.firebaseUid && user.firebaseUid !== firebaseUser.uid) {
        throw new Error(`UID Collision: Existing MongoDB UID ${user.firebaseUid} != Firebase UID ${firebaseUser.uid}`);
      }
      console.log(`   [FIREBASE] Existing Firebase User found with UID: ${firebaseUser.uid}`);
    }

    const firebaseUid = firebaseUser.uid;

    if (user.firebaseUid !== firebaseUid) {
      const updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          $or: [
            { firebaseUid: null },
            { firebaseUid: { $exists: false } },
            { firebaseUid: firebaseUid }
          ]
        },
        { $set: { firebaseUid: firebaseUid } },
        { new: true }
      );

      if (!updatedUser) throw new Error('MongoDB linking failed due to concurrent update or conflict');
      console.log(`   [MONGO DB] Successfully linked firebaseUid ${firebaseUid} to User ${user._id}`);
    }

    // Verify snapshot preservation
    const postAuthSnapshot = {
      role: user.role,
      accountStatus: user.accountStatus,
      siteIds: (user.siteIds || []).map(id => id.toString()),
      warehouseIds: (user.warehouseIds || []).map(id => id.toString()),
      fieldSecurityLevel: user.fieldSecurityLevel || 'Internal'
    };

    if (JSON.stringify(initialAuthSnapshot) !== JSON.stringify(postAuthSnapshot)) {
      throw new Error('CRITICAL FAILURE: Authorization snapshot changed during migration!');
    }

    const customToken = await authTarget.createCustomToken(firebaseUid);

    await AuthAuditLog.create({
      action: 'MIGRATION_SUCCESS',
      targetUserId: user._id,
      targetFirebaseUid: firebaseUid,
      targetEmail: normEmail,
      requesterUserId: user._id,
      requesterEmail: normEmail,
      previousAccountStatus: user.accountStatus,
      newAccountStatus: user.accountStatus,
      assignedRole: user.role,
      assignedSiteIds: user.siteIds,
      assignedWarehouseIds: user.warehouseIds,
      timestamp: new Date()
    });

    console.log(`   [SUCCESS] Single-user controlled migration completed successfully for ${normEmail}.`);
    console.log(`   [VERIFICATION] accountStatus: ${user.accountStatus} | role: ${user.role} | firebaseUid: ${firebaseUid}`);

    return { success: true, userId: user._id, firebaseUid, customToken };
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  const emailArg = process.argv[2];
  const passArg = process.argv[3];

  if (!emailArg || !passArg) {
    console.log('Usage: node scripts/phase7_migrate_users.js <email> <password>');
    console.log('Controlled single-user migration. Bulk migration requires explicit per-user invocation.');
    process.exit(1);
  }

  migrateSingleUser(emailArg, passArg).then(() => process.exit(0)).catch(err => {
    console.error('Controlled Migration Error:', err.message);
    process.exit(1);
  });
}

module.exports = { migrateSingleUser };
