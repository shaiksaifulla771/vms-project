const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const firebaseAdminModule = require('../config/firebaseAdmin');
const mongoose = require('mongoose');

async function runDryRunMigration() {
  console.log('=== PHASE 7 MIGRATION DRY-RUN REPORT ===');
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const authTarget = firebaseAdminModule.auth || firebaseAdminModule.admin.auth();

  try {
    const users = await User.find({}).sort({ createdAt: 1 });
    console.log(`Auditing ${users.length} MongoDB users against Firebase Authentication...\n`);

    const dryRunResults = [];

    for (const u of users) {
      const normEmail = (u.email || '').trim().toLowerCase();
      let firebaseUser = null;
      let firebaseError = null;

      try {
        firebaseUser = await authTarget.getUserByEmail(normEmail);
      } catch (err) {
        if (err.code !== 'auth/user-not-found') {
          firebaseError = err.message;
        }
      }

      let actionPlanned = 'CREATE_AND_LINK';
      let collisionDetected = false;

      if (u.firebaseUid) {
        if (firebaseUser && firebaseUser.uid === u.firebaseUid) {
          actionPlanned = 'ALREADY_MIGRATED';
        } else if (firebaseUser && firebaseUser.uid !== u.firebaseUid) {
          actionPlanned = 'COLLISION_STOP';
          collisionDetected = true;
        } else {
          actionPlanned = 'RECONCILE_LINK';
        }
      } else {
        if (firebaseUser) {
          actionPlanned = 'LINK_EXISTING_FIREBASE_USER';
        } else {
          actionPlanned = 'CREATE_FIREBASE_USER_AND_LINK';
        }
      }

      const authSnapshot = {
        role: u.role,
        accountStatus: u.accountStatus,
        siteIds: (u.siteIds || []).map(id => id.toString()),
        warehouseIds: (u.warehouseIds || []).map(id => id.toString()),
        fieldSecurityLevel: u.fieldSecurityLevel || 'Internal'
      };

      dryRunResults.push({
        mongoId: u._id.toString(),
        username: u.username,
        email: normEmail,
        accountStatus: u.accountStatus,
        role: u.role,
        currentFirebaseUid: u.firebaseUid || 'NONE',
        firebaseUserExists: Boolean(firebaseUser),
        firebaseUserUid: firebaseUser ? firebaseUser.uid : 'N/A',
        actionPlanned,
        collisionDetected,
        authSnapshot
      });
    }

    console.table(dryRunResults.map(r => ({
      ID: r.mongoId.substring(0, 8) + '...',
      Email: r.email,
      Status: r.accountStatus,
      Role: r.role,
      MongoUid: r.currentFirebaseUid !== 'NONE' ? 'YES' : 'NO',
      FirebaseExist: r.firebaseUserExists ? 'YES' : 'NO',
      ActionPlanned: r.actionPlanned,
      Collision: r.collisionDetected ? 'YES' : 'NO'
    })));

    const readyCount = dryRunResults.filter(r => !r.collisionDetected).length;
    const collisionCount = dryRunResults.filter(r => r.collisionDetected).length;

    console.log(`\nDry-Run Execution Summary: Total Users: ${users.length} | Ready: ${readyCount} | Collisions/Blocks: ${collisionCount}`);
    console.log('NO CHANGES WERE MADE TO MONGO DB OR FIREBASE AUTHENTICATION.\n');

    return { total: users.length, readyCount, collisionCount, dryRunResults };
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runDryRunMigration().then(() => process.exit(0)).catch(err => {
    console.error('Dry-Run Error:', err);
    process.exit(1);
  });
}

module.exports = { runDryRunMigration };
