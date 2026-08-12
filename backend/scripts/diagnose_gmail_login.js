const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { auth } = require('../config/firebaseAdmin');
const User = require('../models/User');

async function diagnoseGmailAccounts() {
  console.log('========================================================================');
  console.log('            FIREBASE & MONGODB GMAIL ACCOUNT DIAGNOSIS                 ');
  console.log('========================================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);
  console.log(`Connected to MongoDB: ${mongoUri}\n`);

  try {
    const allUsers = await User.find({});
    console.log(`Total MongoDB Users: ${allUsers.length}\n`);

    for (const user of allUsers) {
      console.log(`--- Inspecting User: ${user.email} ---`);
      console.log(`MongoDB ID:            ${user._id}`);
      console.log(`Username:              ${user.username || 'N/A'}`);
      console.log(`Role:                  ${user.role}`);
      console.log(`Account Status:        ${user.accountStatus}`);
      console.log(`MongoDB firebaseUid:   ${user.firebaseUid || 'NONE'}`);
      console.log(`Email Verified:        ${user.emailVerified}`);
      
      let fbUser = null;
      let fbError = null;

      try {
        if (user.firebaseUid) {
          fbUser = await auth.getUser(user.firebaseUid);
        } else {
          fbUser = await auth.getUserByEmail(user.email);
        }
      } catch (err) {
        fbError = err.message;
      }

      if (fbUser) {
        console.log(`Firebase UID:          ${fbUser.uid}`);
        console.log(`Firebase Email:        ${fbUser.email}`);
        console.log(`Firebase EmailVerified:${fbUser.emailVerified}`);
        console.log(`Firebase Disabled:     ${fbUser.disabled}`);
        console.log(`Firebase Providers:    ${fbUser.providerData.map(p => p.providerId).join(', ')}`);
        
        const uidMatch = user.firebaseUid === fbUser.uid;
        console.log(`UID Mapping Status:    ${uidMatch ? 'MATCHED (1:1)' : 'MISMATCH / MISSING IN MONGO'}`);
      } else {
        console.log(`Firebase Account:      NOT FOUND (${fbError})`);
      }
      console.log('--------------------------------------------------\n');
    }

  } catch (err) {
    console.error('Diagnosis Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

diagnoseGmailAccounts().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
