const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const { auth } = require('../config/firebaseAdmin');

async function approveGmailUser() {
  console.log('=== APPROVING GMAIL ACCOUNT FOR saifullakah@gmail.com ===\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const targetEmail = 'saifullakah@gmail.com';
  const targetUser = await User.findOne({ email: targetEmail });

  if (!targetUser) {
    console.error(`User ${targetEmail} not found in MongoDB!`);
    process.exit(1);
  }

  try {
    let fbUser;
    try {
      fbUser = await auth.getUserByEmail(targetEmail);
    } catch (e) {
      fbUser = null;
    }

    if (fbUser) {
      await auth.updateUser(fbUser.uid, {
        emailVerified: true
      });
      console.log(`[SUCCESS] Set emailVerified=true in Firebase Auth for ${targetEmail}`);
    }

    targetUser.accountStatus = 'ACTIVE';
    targetUser.emailVerified = true;
    targetUser.role = 'Admin'; // Elevate to Admin if needed for visual verification
    await targetUser.save();

    console.log(`[SUCCESS] Updated MongoDB record for ${targetEmail} (accountStatus: ACTIVE, role: Admin, emailVerified: true)`);
  } catch (err) {
    console.error('[ERROR] Failed to approve user:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

approveGmailUser().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
