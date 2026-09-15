const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const AuthAuditLog = require('../models/AuthAuditLog');
const firebaseAdminModule = require('../config/firebaseAdmin');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function testSingleUserControlledMigration() {
  console.log('=== CONTROLLED SINGLE-USER MIGRATION VERIFICATION ===');
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  const authTarget = firebaseAdminModule.auth || firebaseAdminModule.admin.auth();

  const testEmail = `single_user_controlled_${Date.now()}@example.com`;
  const rawPass = 'SingleUserPass123!';
  const passHash = await bcrypt.hash(rawPass, 10);

  let testUser = null;
  try {
    testUser = await User.create({
      username: 'Controlled Single Test User',
      email: testEmail,
      password: passHash,
      role: 'Inventory Manager',
      accountStatus: 'PENDING',
      emailVerified: true
    });

    console.log(`Created test user [${testEmail}] with accountStatus PENDING.`);

    const normEmail = String(testEmail).trim().toLowerCase();
    const user = await User.findOne({ email: normEmail }).select('+password');

    const isMatch = await bcrypt.compare(rawPass, user.password);
    if (!isMatch) throw new Error('Bcrypt check failed');

    let firebaseUser = null;
    try {
      firebaseUser = await authTarget.getUserByEmail(normEmail);
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
    }

    if (!firebaseUser) {
      firebaseUser = await authTarget.createUser({
        email: normEmail,
        password: rawPass,
        emailVerified: user.emailVerified || false,
        displayName: user.username
      });
    }

    const firebaseUid = firebaseUser.uid;
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      { $set: { firebaseUid: firebaseUid } },
      { new: true }
    );

    if (updatedUser.accountStatus !== 'PENDING') throw new Error('accountStatus changed');

    console.log('=== SINGLE-USER CONTROLLED MIGRATION VERIFIED SUCCESSFULLY ===');
    console.log(`Linked Firebase UID: ${updatedUser.firebaseUid}`);
    console.log(`Account Status Preserved: ${updatedUser.accountStatus}`);
    console.log(`Role Preserved: ${updatedUser.role}`);

    // Clean up test user in Firebase & MongoDB
    try {
      await authTarget.deleteUser(firebaseUid);
    } catch (e) {}

  } finally {
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
    }
    await mongoose.disconnect();
  }
}

testSingleUserControlledMigration().then(() => process.exit(0)).catch(err => {
  console.error('Controlled Single-User Migration Test Failed:', err);
  process.exit(1);
});
