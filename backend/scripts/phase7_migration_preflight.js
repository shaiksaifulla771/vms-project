const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const mongoose = require('mongoose');

async function runPreflightAudit() {
  console.log('=== PHASE 7 MIGRATION PREFLIGHT AUDIT ===');
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
  await mongoose.connect(mongoUri);

  try {
    const users = await User.find({}).sort({ createdAt: 1 });
    console.log(`Total MongoDB Users Found: ${users.length}\n`);

    const emailCounts = {};
    const uidCounts = {};

    users.forEach(u => {
      const normEmail = (u.email || '').trim().toLowerCase();
      emailCounts[normEmail] = (emailCounts[normEmail] || 0) + 1;
      if (u.firebaseUid) {
        uidCounts[u.firebaseUid] = (uidCounts[u.firebaseUid] || 0) + 1;
      }
    });

    let eligibleCount = 0;
    let ineligibleCount = 0;
    const preflightReport = [];

    for (const u of users) {
      const normEmail = (u.email || '').trim().toLowerCase();
      const reasons = [];

      if (!u._id || !mongoose.Types.ObjectId.isValid(u._id)) {
        reasons.push('Invalid MongoDB ObjectId');
      }
      if (!normEmail) {
        reasons.push('Missing email address');
      }
      if (emailCounts[normEmail] > 1) {
        reasons.push(`Ambiguous email address (count: ${emailCounts[normEmail]})`);
      }
      if (u.firebaseUid && uidCounts[u.firebaseUid] > 1) {
        reasons.push(`Duplicate firebaseUid in MongoDB (count: ${uidCounts[u.firebaseUid]})`);
      }

      const validStatuses = ['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'DISABLED', 'Pending', 'Active', 'Suspended'];
      if (!validStatuses.includes(u.accountStatus)) {
        reasons.push(`Invalid accountStatus (${u.accountStatus})`);
      }

      const isEligible = (reasons.length === 0);
      if (isEligible) eligibleCount++;
      else ineligibleCount++;

      preflightReport.push({
        id: u._id.toString(),
        username: u.username,
        email: normEmail,
        accountStatus: u.accountStatus,
        role: u.role,
        hasFirebaseUid: Boolean(u.firebaseUid),
        firebaseUid: u.firebaseUid || null,
        hasPasswordHash: Boolean(u.password),
        siteIdsCount: (u.siteIds || []).length,
        warehouseIdsCount: (u.warehouseIds || []).length,
        fieldSecurityLevel: u.fieldSecurityLevel || 'Internal',
        eligible: isEligible,
        ineligibleReasons: reasons
      });
    }

    console.table(preflightReport.map(r => ({
      ID: r.id.substring(0, 10) + '...',
      Username: r.username,
      Email: r.email,
      Status: r.accountStatus,
      Role: r.role,
      LinkedUid: r.hasFirebaseUid ? 'YES' : 'NO',
      Eligible: r.eligible ? 'YES' : 'NO',
      Issues: r.ineligibleReasons.join(', ') || 'None'
    })));

    console.log(`\nSummary: Total: ${users.length} | Eligible: ${eligibleCount} | Ineligible: ${ineligibleCount}`);
    return { users, eligibleCount, ineligibleCount, preflightReport };
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runPreflightAudit().then(() => process.exit(0)).catch(err => {
    console.error('Preflight Audit Error:', err);
    process.exit(1);
  });
}

module.exports = { runPreflightAudit };
