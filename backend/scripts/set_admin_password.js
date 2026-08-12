const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { auth } = require('../config/firebaseAdmin');
const mongoose = require('mongoose');
const User = require('../models/User');

async function setAdminPassword() {
  console.log('=== SETTING LOCAL ADMIN PASSWORD FOR admin@vms.com ===\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const adminUser = await User.findOne({ email: 'admin@vms.com' });
  if (!adminUser) {
    console.error('Admin user admin@vms.com not found in MongoDB!');
    process.exit(1);
  }

  const newPassword = 'Admin123456!';

  try {
    let fbUser;
    try {
      fbUser = await auth.getUserByEmail('admin@vms.com');
    } catch (e) {
      fbUser = null;
    }

    if (fbUser) {
      await auth.updateUser(fbUser.uid, {
        password: newPassword,
        emailVerified: true
      });
      console.log(`[SUCCESS] Updated Firebase Auth password for admin@vms.com to: ${newPassword}`);
    } else {
      fbUser = await auth.createUser({
        uid: adminUser.firebaseUid,
        email: 'admin@vms.com',
        password: newPassword,
        emailVerified: true,
        displayName: 'System Admin'
      });
      console.log(`[SUCCESS] Created Firebase Auth user admin@vms.com with password: ${newPassword}`);
    }

    adminUser.emailVerified = true;
    adminUser.accountStatus = 'ACTIVE';
    adminUser.role = 'Admin';
    if (!adminUser.firebaseUid || adminUser.firebaseUid !== fbUser.uid) {
      adminUser.firebaseUid = fbUser.uid;
    }
    await adminUser.save();

    console.log('[SUCCESS] Updated MongoDB record for admin@vms.com (accountStatus: ACTIVE, role: Admin, emailVerified: true)');

  } catch (err) {
    console.error('[ERROR] Failed to update Admin password:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

setAdminPassword().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
