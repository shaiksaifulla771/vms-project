const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const { auth } = require('../config/firebaseAdmin');

async function approveShaiksaifulla() {
  console.log('=== APPROVING shaiksaifulla771@gmail.com AS ADMIN ===\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const targetEmail = 'shaiksaifulla771@gmail.com';
  let targetUser = await User.findOne({ email: targetEmail });

  if (!targetUser) {
    console.log(`User ${targetEmail} not found in MongoDB. Creating record...`);
    let fbUser;
    try {
      fbUser = await auth.getUserByEmail(targetEmail);
    } catch (e) {
      fbUser = null;
    }

    targetUser = await User.create({
      email: targetEmail,
      username: 'ShaikSaifulla',
      firebaseUid: fbUser ? fbUser.uid : `uid_shaik_${Date.now()}`,
      role: 'Admin',
      accountStatus: 'ACTIVE',
      emailVerified: true
    });
  } else {
    targetUser.accountStatus = 'ACTIVE';
    targetUser.emailVerified = true;
    targetUser.role = 'Admin';
    await targetUser.save();
  }

  console.log(`[SUCCESS] Updated MongoDB record for ${targetEmail}:`);
  console.log(`  - Role: ${targetUser.role}`);
  console.log(`  - Account Status: ${targetUser.accountStatus}`);
  console.log(`  - Firebase UID: ${targetUser.firebaseUid}`);
  console.log(`  - Email Verified: ${targetUser.emailVerified}`);

  await mongoose.disconnect();
}

approveShaiksaifulla().then(() => process.exit(0)).catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
