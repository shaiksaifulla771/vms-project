const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../config/db');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const AuthAuditLog = require('../models/AuthAuditLog');

async function seedMasterAdmin() {
  console.log('================================================================');
  console.log('       MASTER ADMIN SEEDING & DATABASE CREDENTIALS RESET        ');
  console.log('================================================================');

  try {
    await connectDB();

    const targetEmail = 'shaiksaifulla771@gmail.com';
    const targetPasswordRaw = 'Saif@2005';
    const targetUsername = 'Shaik Saifulla';

    console.log(`\n[1] Purging stale / dummy credentials from MongoDB Atlas...`);
    const deleteResult = await User.deleteMany({ email: { $ne: targetEmail } });
    console.log(`  ✓ Removed ${deleteResult.deletedCount} legacy dummy user accounts.`);

    const pendingDeleteResult = await PendingRegistration.deleteMany({});
    console.log(`  ✓ Cleared ${pendingDeleteResult.deletedCount} pending registration staging records.`);

    console.log(`\n[2] Fetching site and warehouse scopes...`);
    const sites = await Site.find({ status: { $ne: 'DEACTIVATED' } }).select('_id');
    const warehouses = await Warehouse.find({ status: { $ne: 'DEACTIVATED' } }).select('_id');
    const siteIds = sites.map(s => s._id);
    const warehouseIds = warehouses.map(w => w._id);
    console.log(`  ✓ Assigned ${siteIds.length} Site(s) and ${warehouseIds.length} Warehouse(s).`);

    console.log(`\n[3] Establishing Master Admin Account: "${targetEmail}"...`);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(targetPasswordRaw, salt);

    let masterUser = await User.findOne({ email: targetEmail });
    if (masterUser) {
      masterUser.username = targetUsername;
      masterUser.password = hashedPassword;
      masterUser.role = 'Admin';
      masterUser.requestedRole = null;
      masterUser.accountStatus = 'ACTIVE';
      masterUser.approvalStatus = 'APPROVED';
      masterUser.isVerified = true;
      masterUser.emailVerified = true;
      masterUser.siteIds = siteIds;
      masterUser.warehouseIds = warehouseIds;
      masterUser.fieldSecurityLevel = 'Restricted';
      masterUser.approvedAt = new Date();
      masterUser.approvedBy = masterUser._id;
      if (!masterUser.userCode) masterUser.userCode = 'USR-0001';
      await masterUser.save();
      console.log(`  ✓ Master Admin account updated successfully.`);
    } else {
      masterUser = await User.create({
        username: targetUsername,
        email: targetEmail,
        password: hashedPassword,
        role: 'Admin',
        requestedRole: null,
        accountStatus: 'ACTIVE',
        approvalStatus: 'APPROVED',
        isVerified: true,
        emailVerified: true,
        userCode: 'USR-0001',
        siteIds,
        warehouseIds,
        fieldSecurityLevel: 'Restricted',
        approvedAt: new Date()
      });
      console.log(`  ✓ Master Admin account created successfully.`);
    }

    console.log(`\n[4] Writing Immutable Audit Log...`);
    await AuthAuditLog.create({
      action: 'ACCOUNT_APPROVED',
      targetUserId: masterUser._id,
      targetEmail: masterUser.email,
      requesterUserId: masterUser._id,
      requesterEmail: masterUser.email,
      previousAccountStatus: 'NONE',
      newAccountStatus: 'ACTIVE',
      assignedRole: 'Admin',
      assignedSiteIds: siteIds,
      assignedWarehouseIds: warehouseIds,
      ipAddress: '127.0.0.1',
      userAgent: 'VMS_MASTER_SEEDER/2.0'
    });

    console.log(`\n================================================================`);
    console.log(`✅ DATABASE CREDENTIALS RESET COMPLETE!`);
    console.log(`- Master Admin Email : ${targetEmail}`);
    console.log(`- Master Password    : ${targetPasswordRaw}`);
    console.log(`- Role Assigned      : Admin (Global System Access)`);
    console.log(`- Status             : ACTIVE / APPROVED`);
    console.log(`================================================================\n`);

  } catch (error) {
    console.error('[FATAL ERROR] Seeding failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  seedMasterAdmin();
}

module.exports = seedMasterAdmin;
