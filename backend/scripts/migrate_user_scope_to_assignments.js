require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const UserAccessAssignment = require('../models/UserAccessAssignment');

async function migrate() {
  console.log('=== STARTING USER SCOPE TO USERACCESSASSIGNMENT MIGRATION ===');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/vms_db');

  // Find an admin to attribute system migrations
  let adminUser = await User.findOne({ role: { $in: ['Admin', 'admin'] } });
  if (!adminUser) {
    adminUser = await User.findOne();
  }
  const fallbackAdminId = adminUser ? adminUser._id : new mongoose.Types.ObjectId();

  const users = await User.find({}).lean();
  console.log(`Audited ${users.length} total users in database.`);

  let totalSiteAssignmentsCreated = 0;
  let totalWarehouseAssignmentsCreated = 0;
  let totalSkippedAlreadyExists = 0;

  for (const user of users) {
    const siteIds = Array.isArray(user.siteIds) ? user.siteIds : [];
    const warehouseIds = Array.isArray(user.warehouseIds) ? user.warehouseIds : [];

    // 1. Migrate Site Scopes
    for (const sId of siteIds) {
      if (!sId) continue;
      const existing = await UserAccessAssignment.findOne({
        userId: user._id,
        scopeType: 'site',
        scopeId: sId,
        status: 'active'
      });

      if (!existing) {
        await UserAccessAssignment.create({
          userId: user._id,
          scopeType: 'site',
          scopeId: sId,
          status: 'active',
          assignedBy: fallbackAdminId,
          assignedAt: user.scopeAssignedAt || user.createdAt || new Date(),
          reason: user.scopeReason || 'Migrated from legacy User.siteIds'
        });
        totalSiteAssignmentsCreated++;
      } else {
        totalSkippedAlreadyExists++;
      }
    }

    // 2. Migrate Warehouse Scopes
    for (const wId of warehouseIds) {
      if (!wId) continue;
      const existing = await UserAccessAssignment.findOne({
        userId: user._id,
        scopeType: 'warehouse',
        scopeId: wId,
        status: 'active'
      });

      if (!existing) {
        await UserAccessAssignment.create({
          userId: user._id,
          scopeType: 'warehouse',
          scopeId: wId,
          status: 'active',
          assignedBy: fallbackAdminId,
          assignedAt: user.scopeAssignedAt || user.createdAt || new Date(),
          reason: user.scopeReason || 'Migrated from legacy User.warehouseIds'
        });
        totalWarehouseAssignmentsCreated++;
      } else {
        totalSkippedAlreadyExists++;
      }
    }
  }

  const allActiveAssignments = await UserAccessAssignment.countDocuments({ status: 'active' });

  console.log('\n=== MIGRATION SUMMARY ===');
  console.log(`✓ New Site assignments created: ${totalSiteAssignmentsCreated}`);
  console.log(`✓ New Warehouse assignments created: ${totalWarehouseAssignmentsCreated}`);
  console.log(`✓ Skipped (already active): ${totalSkippedAlreadyExists}`);
  console.log(`✓ Total active UserAccessAssignment records in DB: ${allActiveAssignments}`);

  console.log('=== MIGRATION COMPLETED SUCCESSFULLY ===');
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('[MIGRATION ERROR]:', err);
  process.exit(1);
});
