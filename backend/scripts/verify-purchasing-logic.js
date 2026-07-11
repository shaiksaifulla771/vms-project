const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const Vendor = require('../models/Vendor');
const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const User = require('../models/User');

mongoose.connect('mongodb://127.0.0.1:27017/vms').then(async () => {
  try {
    console.log('Starting Procurement & GRN workflow test...');
    
    const vendor = await Vendor.findOne({ status: 'Active' });
    const material = await Material.findOne({ type: 'Raw' });
    const user = await User.findOne();

    if (!vendor || !material || !user) {
      console.log('Failing: Active Vendor, Raw Material, or User seed definitions missing.');
      return;
    }

    console.log(`Targeting Vendor Affiliate: ${vendor.company}`);
    console.log(`Targeting Material Component: ${material.name} (${material.code})`);
    console.log(`Targeting User requester: ${user.username}`);

    // Fetch warehouse balance prior to test run
    let stockBefore = await InventoryItem.findOne({ materialId: material._id });
    const balanceBefore = stockBefore ? stockBefore.balance : 0;
    console.log(`Initial stock balance before PO: ${balanceBefore} ${material.unit}`);

    // 1. Create PO
    const po = await PurchaseOrder.create({
      vendorId: vendor._id,
      materials: [{ materialId: material._id, quantity: 250, unitPrice: 3.50 }],
      totalAmount: 250 * 3.50,
      requestedBy: user._id,
      status: 'Pending'
    });
    console.log(`1. PO drafted successfully (Status: ${po.status})`);

    // 2. Approve PO
    po.status = 'Approved';
    po.approvedBy = user._id;
    await po.save();
    console.log(`2. PO approved successfully (Status: ${po.status})`);

    // 3. Receive PO items (Goods Receipt Note)
    console.log('3. Simulating GRN Receipt of goods...');
    for (let item of po.materials) {
      let stockItem = await InventoryItem.findOne({ materialId: item.materialId });
      if (!stockItem) {
        stockItem = await InventoryItem.create({ materialId: item.materialId, balance: 0 });
      }
      stockItem.balance += item.quantity;
      stockItem.updatedAt = Date.now();
      await stockItem.save();

      await InventoryTransaction.create({
        materialId: item.materialId,
        quantity: item.quantity,
        type: 'purchase',
        referenceId: po._id.toString(),
        notes: `Test GRN received stock`
      });
    }
    po.status = 'Received';
    await po.save();
    console.log(`   PO status marked final (Status: ${po.status})`);

    // Verify stock balance has increased
    let stockAfter = await InventoryItem.findOne({ materialId: material._id });
    const balanceAfter = stockAfter ? stockAfter.balance : 0;
    console.log(`Final stock balance after PO: ${balanceAfter} ${material.unit}`);

    if (balanceAfter === balanceBefore + 250) {
      console.log('✅ TEST RESULT: SUCCESS (Goods Receipt Note added stock correctly).');
    } else {
      console.warn('❌ TEST RESULT: FAIL (Stock mathematical mismatch).');
    }

    // Clean up test transactions to keep seed ledger clean
    await PurchaseOrder.findByIdAndDelete(po._id);
    await InventoryTransaction.deleteMany({ referenceId: po._id.toString() });
    
    // Revert stock level back to initial
    stockAfter.balance = balanceBefore;
    await stockAfter.save();
    console.log('Diagnostic database cleaning completed.');

  } catch (err) {
    console.error('Diagnostic failed with error:', err);
  } finally {
    mongoose.connection.close();
  }
});
