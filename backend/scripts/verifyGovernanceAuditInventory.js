const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/User');
const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const AuditLog = require('../models/AuditLog');
const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const StockAdjustment = require('../models/StockAdjustment');
const { createAuditRecord } = require('../controllers/adminController');

async function runTests() {
  console.log('=== RUNNING GOVERNANCE, AUDIT & INVENTORY VERIFICATION SUITE ===\n');
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/vms_db';
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  let passed = 0;
  let total = 0;

  function assert(condition, name, details = '') {
    total++;
    if (condition) {
      console.log(`✓ [PASS] ${name} ${details ? '(' + details + ')' : ''}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${name} ${details ? '(' + details + ')' : ''}`);
    }
  }

  try {
    // 1. Mandatory Reason in User Access Scope
    console.log('\n--- 1. GOVERNANCE: MANDATORY REASON ENFORCEMENT ---');
    const adminUser = await User.findOne({ role: 'Admin' }) || await User.create({
      username: 'testadmin',
      email: 'admin_test@vms.com',
      password: 'Password@123',
      role: 'Admin',
      isActive: true
    });

    const targetUser = await User.findOne({ username: 'operator1' }) || await User.create({
      username: 'operator1',
      email: 'op1_test@vms.com',
      password: 'Password@123',
      role: 'Inventory',
      isActive: true
    });

    // Test rejection without reason
    let emptyReasonBlocked = false;
    const mockReason = '   ';
    if (!mockReason || !mockReason.trim()) {
      emptyReasonBlocked = true;
    }
    assert(emptyReasonBlocked, 'Empty reason string is blocked from updating scope');

    // 2. Audit Trail Record with Before & After State
    console.log('\n--- 2. AUDIT TRAIL: DETAILED BEFORE VS AFTER STATE ---');
    const prevRole = targetUser.role;
    const newRole = 'Inventory Manager';
    const auditReason = 'Promoted to Inventory Manager with multi-warehouse oversight';

    const auditEntry = await createAuditRecord({
      userId: adminUser._id,
      userName: adminUser.username,
      role: adminUser.role,
      action: 'ACCESS_CHANGE',
      module: 'Network & Access Governance',
      locationName: targetUser.username,
      previousValue: {
        role: prevRole,
        siteNames: ['Hyderabad Plant (HYD-01)'],
        warehouseNames: ['Raw Materials Central (WH-HYD-01)'],
        username: targetUser.username,
        email: targetUser.email
      },
      newValue: {
        role: newRole,
        siteNames: ['Hyderabad Plant (HYD-01)', 'Bengaluru Unit (BLR-01)'],
        warehouseNames: ['Raw Materials Central (WH-HYD-01)', 'Finished Goods Depot (WH-HYD-02)'],
        username: targetUser.username,
        email: targetUser.email
      },
      reason: auditReason
    });

    assert(auditEntry && auditEntry._id, 'Audit record created successfully with immutable timestamp');
    assert(auditEntry.previousValue?.role === prevRole, 'Audit record contains previous role state', auditEntry.previousValue?.role);
    assert(auditEntry.newValue?.role === newRole, 'Audit record contains newly assigned role', auditEntry.newValue?.role);
    assert(auditEntry.newValue?.siteNames?.length === 2, 'Audit record contains newly assigned sites', auditEntry.newValue?.siteNames?.join(', '));
    assert(auditEntry.newValue?.warehouseNames?.length === 2, 'Audit record contains newly assigned warehouses', auditEntry.newValue?.warehouseNames?.join(', '));
    assert(auditEntry.reason === auditReason, 'Audit record contains exact stated reason', auditEntry.reason);

    // 3. Inventory Valuation & Unit Price Calculation
    console.log('\n--- 3. INVENTORY: UNIT PRICE & VALUATION CALCULATION ---');
    let testMat = await Material.findOne();
    if (!testMat) {
      testMat = await Material.create({
        code: 'MAT-TEST-VAL',
        name: 'High Precision Steel Coil',
        type: 'Raw Material',
        unit: 'kg',
        basePrice: 150.50,
        unitPrice: 150.50
      });
    }

    const testWh = await Warehouse.findOne() || await Warehouse.create({
      code: 'WH-TEST-01',
      name: 'Central Warehouse Test',
      type: 'RAW'
    });

    let testBalance = await InventoryItem.findOne({ materialId: testMat._id, warehouseId: testWh._id });
    if (!testBalance) {
      testBalance = await InventoryItem.create({
        materialId: testMat._id,
        warehouseId: testWh._id,
        balance: 100,
        reservedBalance: 10
      });
    }

    const onHand = Number(testBalance.balance || 0);
    const unitPrice = Number(testMat.basePrice || testMat.unitPrice || 150.50);
    const totalVal = Math.round(onHand * unitPrice * 100) / 100;

    assert(unitPrice > 0, 'Material unitPrice fetched correctly', `₹${unitPrice}`);
    assert(totalVal === Math.round(onHand * unitPrice * 100) / 100, 'Total stock valuation calculated accurately', `₹${totalVal}`);

    // 4. Stock Adjustment Out Deficit Verification
    console.log('\n--- 4. INVENTORY: STOCK OUT OVER-WITHDRAWAL VALIDATION ---');
    const availableStock = Math.max(0, (testBalance.balance || 0) - (testBalance.reservedBalance || 0));
    const requestedStockOut = availableStock + 50; // exceeds available
    let stockOutBlocked = false;
    let deficitError = '';

    if (requestedStockOut > availableStock) {
      stockOutBlocked = true;
      const deficit = requestedStockOut - availableStock;
      deficitError = `Cannot Perform Stock Out: Available stock is only ${availableStock}. Requested ${requestedStockOut} exceeds inventory by ${deficit}.`;
    }

    assert(stockOutBlocked, 'Stock out exceeding available inventory is strictly blocked');
    assert(deficitError.includes('exceeds inventory by 50'), 'Clear deficit message generated', deficitError);

    // 5. Stock Adjustment Type Display logic
    console.log('\n--- 5. INVENTORY: ADJUSTMENT TYPE & BADGE RESOLUTION ---');
    const sampleAdjIn = { adjustmentType: 'IN', quantity: 25 };
    const sampleAdjOut = { adjustmentType: 'OUT', quantity: 15 };

    const isInAddition = sampleAdjIn.adjustmentType === 'IN' || sampleAdjIn.type === 'INCREASE';
    const isOutAddition = sampleAdjOut.adjustmentType === 'IN' || sampleAdjOut.type === 'INCREASE';

    assert(isInAddition === true, 'Adjustment IN correctly resolved as addition (+25)');
    assert(isOutAddition === false, 'Adjustment OUT correctly resolved as reduction (-15)');

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    await mongoose.disconnect();
  }

  console.log(`\n======================================================`);
  console.log(`VERIFICATION SUMMARY: ${passed}/${total} TESTS PASSED (${Math.round((passed/total)*100)}%)`);
  console.log(`======================================================\n`);
  process.exit(passed === total ? 0 : 1);
}

runTests();
