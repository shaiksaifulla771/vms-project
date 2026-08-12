const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const { auth } = require('../config/firebaseAdmin');

async function testMeEndpoint() {
  console.log('=== TESTING /api/auth/me DIAGNOSTIC FOR ACTIVE ADMIN USERS ===\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const testEmails = ['shaiksaifulla771@gmail.com', 'admin@vms.com', 'saifullakah@gmail.com'];

  for (const email of testEmails) {
    console.log(`\n--- Inspecting: ${email} ---`);
    const dbUser = await User.findOne({ email });
    if (!dbUser) {
      console.log('MongoDB Record: NOT FOUND');
      continue;
    }

    console.log('MongoDB Record:');
    console.log(`  - _id: ${dbUser._id}`);
    console.log(`  - firebaseUid: ${dbUser.firebaseUid}`);
    console.log(`  - accountStatus: ${dbUser.accountStatus}`);
    console.log(`  - role: ${dbUser.role}`);
    console.log(`  - emailVerified: ${dbUser.emailVerified}`);

    let fbUser = null;
    try {
      if (dbUser.firebaseUid) {
        fbUser = await auth.getUser(dbUser.firebaseUid);
      } else {
        fbUser = await auth.getUserByEmail(email);
      }
    } catch (e) {
      console.log(`  - Firebase Auth Lookup Error: ${e.message}`);
    }

    if (fbUser) {
      console.log('Firebase Auth Record:');
      console.log(`  - uid: ${fbUser.uid}`);
      console.log(`  - email: ${fbUser.email}`);
      console.log(`  - emailVerified: ${fbUser.emailVerified}`);
      console.log(`  - disabled: ${fbUser.disabled}`);
      console.log(`  - providers: ${fbUser.providerData.map(p => p.providerId).join(', ')}`);
    }
  }

  await mongoose.disconnect();
}

testMeEndpoint().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
