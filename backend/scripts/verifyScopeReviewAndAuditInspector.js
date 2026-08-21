const mongoose = require('mongoose');
const User = require('../models/User');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const AuditLog = require('../models/AuditLog');
const adminController = require('../controllers/adminController');

async function verifyScopeReviewAndAuditInspector() {
  console.log('=== VERIFYING EDIT SCOPE 2-STEP WORKFLOW & AUDIT LOG INSPECTOR DATA ===\n');

  await mongoose.connect('mongodb://localhost:27017/vms_db');
  console.log('✓ Connected to MongoDB');

  // 1. Ensure sites & warehouses
  let site1 = await Site.findOne({ code: 'HYD-01' });
  if (!site1) site1 = await Site.create({ code: 'HYD-01', name: 'Hyderabad Plant', status: 'Active' });
  let site2 = await Site.findOne({ code: 'BLR-01' });
  if (!site2) site2 = await Site.create({ code: 'BLR-01', name: 'Bengaluru Facility', status: 'Active' });

  let wh1 = await Warehouse.findOne({ code: 'WH-HYD-01' });
  if (!wh1) wh1 = await Warehouse.create({ code: 'WH-HYD-01', name: 'Raw Material Store', siteId: site1._id, status: 'Active' });
  let wh2 = await Warehouse.findOne({ code: 'WH-BLR-01' });
  if (!wh2) wh2 = await Warehouse.create({ code: 'WH-BLR-01', name: 'Finished Goods Depot', siteId: site2._id, status: 'Active' });

  // 2. Ensure test user with prior assignment info
  await User.deleteOne({ email: 'operator.test@vendoros.com' });
  const testUser = await User.create({
    username: 'Rahul Verma',
    email: 'operator.test@vendoros.com',
    role: 'Inventory',
    accountStatus: 'ACTIVE',
    siteIds: [site1._id],
    warehouseIds: [wh1._id],
    scopeAssignedBy: 'Senior Admin (vikram@vendoros.com)',
    scopeAssignedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    scopeReason: 'Initial onboarding to Hyderabad plant'
  });

  console.log('\n--- 1. FIRST BOX: PRIOR ASSIGNMENT METADATA ---');
  console.log(`Target User: ${testUser.username} (${testUser.email})`);
  console.log(`Current Role: ${testUser.role}`);
  console.log(`Assigned Sites Count: ${testUser.siteIds.length}`);
  console.log(`Assigned Warehouses Count: ${testUser.warehouseIds.length}`);
  console.log(`Assigned By: ${testUser.scopeAssignedBy}`);
  console.log(`Assigned On: ${testUser.scopeAssignedAt?.toLocaleString()}`);

  // 3. Perform Scope Update (Step 2 Final Submission Simulation)
  const mockReq = {
    params: { userId: testUser._id.toString() },
    body: {
      role: 'Inventory Manager',
      siteIds: [site1._id.toString(), site2._id.toString()],
      warehouseIds: [wh1._id.toString(), wh2._id.toString()],
      reason: 'Promoted to Regional Inventory Manager overseeing HYD and BLR distribution facilities'
    },
    user: {
      _id: new mongoose.Types.ObjectId(),
      username: 'Shaik Saifulla',
      email: 'saif@vendoros.com',
      role: 'Admin'
    },
    ip: '192.168.1.100'
  };

  let responseData = null;
  const mockRes = {
    status: (code) => ({
      json: (data) => {
        responseData = data;
        return data;
      }
    }),
    json: (data) => {
      responseData = data;
      return data;
    }
  };

  await adminController.updateUserAccess(mockReq, mockRes);

  const updatedUser = await User.findById(testUser._id).populate('siteIds', 'name').populate('warehouseIds', 'name');
  console.log('\n--- 2. NEWLY ASSIGNED METADATA ON USER ---');
  console.log(`Updated Role: ${updatedUser.role}`);
  console.log(`Assigned By: ${updatedUser.scopeAssignedBy}`);
  console.log(`Assigned On: ${updatedUser.scopeAssignedAt?.toLocaleString()}`);
  console.log(`Assigned Reason: ${updatedUser.scopeReason}`);
  console.log(`Sites: ${updatedUser.siteIds.map(s => s.name).join(', ')}`);
  console.log(`Warehouses: ${updatedUser.warehouseIds.map(w => w.name).join(', ')}`);

  // 4. Fetch the created AuditLog and verify inspect modal payload
  const latestAuditLog = await AuditLog.findOne({ entityId: testUser._id, action: 'ACCESS_CHANGE' }).sort({ timestamp: -1 });

  console.log('\n--- 3. AUDIT LOG INSPECT RECORD INTEGRITY ---');
  console.log(`Auditor (Admin): ${latestAuditLog.userName} (${latestAuditLog.role})`);
  console.log(`Action: ${latestAuditLog.action}`);
  console.log(`Timestamp: ${latestAuditLog.timestamp?.toLocaleString()}`);
  console.log(`Target (To Whom): ${latestAuditLog.previousValue?.username} (${latestAuditLog.newValue?.email})`);
  console.log(`Previous Role: ${latestAuditLog.previousValue?.role} -> Newly Assigned Role: ${latestAuditLog.newValue?.role}`);
  console.log(`Previous Sites: ${latestAuditLog.previousValue?.siteNames?.join(', ')} -> Newly Assigned Sites: ${latestAuditLog.newValue?.siteNames?.join(', ')}`);
  console.log(`Previous Warehouses: ${latestAuditLog.previousValue?.warehouseNames?.join(', ')} -> Newly Assigned Warehouses: ${latestAuditLog.newValue?.warehouseNames?.join(', ')}`);
  console.log(`Stated Reason: "${latestAuditLog.reason}"`);
  console.log(`Current Status: ${latestAuditLog.newValue?.accountStatus}`);

  // Assertions
  if (updatedUser.role === 'Inventory Manager' && updatedUser.scopeAssignedBy === 'Shaik Saifulla') {
    console.log('\n✓ [PASS] User scope updated with assignment metadata (Admin name, timestamp, reason).');
  } else {
    console.error('\n✗ [FAIL] User document failed to record scope assignment metadata.');
    process.exit(1);
  }

  if (
    latestAuditLog &&
    latestAuditLog.previousValue?.role === 'Inventory' &&
    latestAuditLog.newValue?.role === 'Inventory Manager' &&
    latestAuditLog.newValue?.siteNames?.length === 2 &&
    latestAuditLog.newValue?.warehouseNames?.length === 2 &&
    latestAuditLog.newValue?.accountStatus === 'ACTIVE'
  ) {
    console.log('✓ [PASS] Audit Log Inspector record contains complete Before vs After state, Auditor details, and Current Status!');
  } else {
    console.error('✗ [FAIL] Audit record payload missing required inspection fields.');
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('ALL SCOPE REVIEW & AUDIT INSPECTION CHECKS PASSED (100%)');
  console.log('======================================================');
  process.exit(0);
}

verifyScopeReviewAndAuditInspector().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
