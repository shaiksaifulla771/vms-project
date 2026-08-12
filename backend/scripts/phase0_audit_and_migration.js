const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';

async function runPhase0() {
  console.log('--- STARTING PHASE 0: DATABASE BACKUP & AUDIT ---');
  console.log(`Connecting to MongoDB at: ${mongoUri}`);

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB successfully.');

  const db = mongoose.connection.db;
  const usersCollection = db.collection('users');

  // Step 1: Read-Only Data Audit
  const totalUsers = await usersCollection.countDocuments();
  console.log(`Total users in collection: ${totalUsers}`);

  const usersWithFirebaseUid = await usersCollection.countDocuments({ firebaseUid: { $exists: true, $ne: null } });
  console.log(`Users with existing firebaseUid: ${usersWithFirebaseUid}`);

  // Duplicate firebaseUid detection
  const duplicateFirebaseUids = await usersCollection.aggregate([
    { $match: { firebaseUid: { $exists: true, $ne: null, $ne: '' } } },
    { $group: { _id: '$firebaseUid', count: { $sum: 1 }, users: { $push: { id: '$_id', email: '$email' } } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  console.log(`Duplicate firebaseUid count: ${duplicateFirebaseUids.length}`);
  if (duplicateFirebaseUids.length > 0) {
    console.error('CRITICAL: Duplicate firebaseUid values detected!', JSON.stringify(duplicateFirebaseUids, null, 2));
    console.error('ABORTING PHASE 0: Cannot proceed with unique index creation until duplicates are resolved.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Duplicate normalized email detection
  const allUsers = await usersCollection.find({}).toArray();
  const emailMap = new Map();
  const duplicateEmails = [];

  for (const user of allUsers) {
    if (!user.email) continue;
    const normalizedEmail = String(user.email).trim().toLowerCase();
    if (emailMap.has(normalizedEmail)) {
      duplicateEmails.push({
        email: normalizedEmail,
        user1: emailMap.get(normalizedEmail),
        user2: user._id
      });
    } else {
      emailMap.set(normalizedEmail, user._id);
    }
  }

  console.log(`Duplicate normalized email count: ${duplicateEmails.length}`);

  // Status auditing
  const statusCounts = {};
  const invalidStatuses = [];
  const validUpperStatuses = ['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'DISABLED'];

  for (const user of allUsers) {
    const status = user.accountStatus;
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    if (!status || !validUpperStatuses.includes(status)) {
      invalidStatuses.push({ id: user._id, email: user.email, currentStatus: status });
    }
  }

  console.log('Account Status Distribution:', statusCounts);
  console.log(`Number of invalid/legacy account statuses: ${invalidStatuses.length}`);

  // Check required fields
  const missingFieldsUsers = allUsers.filter(u => !u.username || !u.email || !u.role);
  console.log(`Users with missing required fields (username/email/role): ${missingFieldsUsers.length}`);

  // Step 2: Database Backup
  const backupDir = path.join(__dirname, '../storage/backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupFilePath = path.join(backupDir, `users_backup_phase0_${Date.now()}.json`);
  fs.writeFileSync(backupFilePath, JSON.stringify(allUsers, null, 2));
  console.log(`Backup saved successfully to: ${backupFilePath}`);

  // Step 3: Account Status Normalization Plan
  let updatedStatusCount = 0;
  for (const user of allUsers) {
    let targetStatus = user.accountStatus;
    if (!targetStatus) {
      targetStatus = 'PENDING';
    } else if (targetStatus === 'Pending') {
      targetStatus = 'PENDING';
    } else if (targetStatus === 'Active') {
      targetStatus = 'ACTIVE';
    } else if (targetStatus === 'Suspended') {
      targetStatus = 'SUSPENDED';
    }

    if (targetStatus !== user.accountStatus) {
      await usersCollection.updateOne({ _id: user._id }, { $set: { accountStatus: targetStatus } });
      updatedStatusCount++;
    }
  }

  console.log(`Normalized accountStatus for ${updatedStatusCount} user records.`);

  // Step 4: Safe Index Creation
  console.log('Creating sparse unique index on firebaseUid...');
  const indexResult = await usersCollection.createIndex(
    { firebaseUid: 1 },
    { unique: true, sparse: true, name: 'firebaseUid_1_sparse_unique' }
  );
  console.log(`Index created successfully: ${indexResult}`);

  console.log('Phase 0 Audit and Normalization Complete.');

  const report = {
    totalUsersChecked: totalUsers,
    usersWithFirebaseUid,
    duplicateFirebaseUidCount: duplicateFirebaseUids.length,
    duplicateEmailCount: duplicateEmails.length,
    duplicateEmailsList: duplicateEmails,
    invalidStatusCount: invalidStatuses.length,
    normalizedStatusCount: updatedStatusCount,
    missingFieldsCount: missingFieldsUsers.length,
    backupFile: backupFilePath,
    indexName: indexResult
  };

  fs.writeFileSync(path.join(backupDir, 'phase0_report.json'), JSON.stringify(report, null, 2));

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB. Phase 0 Finished.');
}

runPhase0().catch(err => {
  console.error('Error executing Phase 0:', err);
  process.exit(1);
});
