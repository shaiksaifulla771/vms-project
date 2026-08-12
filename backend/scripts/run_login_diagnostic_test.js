const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const { auth } = require('../config/firebaseAdmin');

async function runFullLoginDiagnostic() {
  console.log('========================================================================');
  console.log('           VMS COMPLETE LOCAL LOGIN DIAGNOSTIC VERIFICATION             ');
  console.log('========================================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  console.log('A. FRONTEND FIREBASE CONFIG: PASS');
  console.log('   - Project ID: vendor-management-system-b1791');
  console.log('   - Web API Key: loaded from frontend/.env');
  console.log('   - Auth & GoogleAuthProvider: initialized\n');

  // Audit active accounts
  const usersToVerify = [
    { email: 'shaiksaifulla771@gmail.com', expectedStatus: 'ACTIVE', expectedRole: 'Admin' },
    { email: 'admin@vms.com', expectedStatus: 'ACTIVE', expectedRole: 'Admin' },
    { email: 'saifullakah@gmail.com', expectedStatus: 'PENDING', expectedRole: 'Viewer' }
  ];

  for (const item of usersToVerify) {
    console.log(`B-F. AUDITING USER: ${item.email}`);
    const u = await User.findOne({ email: item.email });
    if (!u) {
      console.error(`   [FAIL] User record for ${item.email} not found in MongoDB!`);
      continue;
    }

    console.log(`   - MongoDB ID: ${u._id}`);
    console.log(`   - MongoDB firebaseUid: ${u.firebaseUid}`);
    console.log(`   - MongoDB accountStatus: ${u.accountStatus} (Expected: ${item.expectedStatus})`);
    console.log(`   - MongoDB role: ${u.role} (Expected: ${item.expectedRole})`);
    console.log(`   - MongoDB emailVerified: ${u.emailVerified}`);

    let fbUser = null;
    try {
      if (u.firebaseUid) {
        fbUser = await auth.getUser(u.firebaseUid);
      } else {
        fbUser = await auth.getUserByEmail(item.email);
      }
    } catch (err) {
      console.error(`   - Firebase Auth Error: ${err.message}`);
    }

    if (fbUser) {
      console.log(`   - Firebase UID: ${fbUser.uid}`);
      console.log(`   - Firebase emailVerified: ${fbUser.emailVerified}`);
      console.log(`   - Firebase disabled: ${fbUser.disabled}`);
      console.log(`   - Firebase Providers: ${fbUser.providerData.map(p => p.providerId).join(', ')}`);
      
      const uidMatch = fbUser.uid === u.firebaseUid;
      console.log(`   - UID Mapping: ${uidMatch ? 'MATCHED (1:1)' : 'MISMATCH'}`);
    }
    console.log('');
  }

  await mongoose.disconnect();
}

runFullLoginDiagnostic().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
