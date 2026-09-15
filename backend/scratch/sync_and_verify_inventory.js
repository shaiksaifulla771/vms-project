const mongoose = require('mongoose');
const InventoryItem = require('../models/InventoryItem');
const Warehouse = require('../models/Warehouse');
const Site = require('../models/Site');
const Material = require('../models/Material');

async function syncAndVerify() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/vms');
    console.log('\n=== RUNNING INVENTORY DATA RECONCILIATION ===\n');

    // Drop legacy single-field unique index if exists
    try {
      const collection = mongoose.connection.collection('inventoryitems');
      const indexes = await collection.indexes();
      const legacyIdx = indexes.find(i => i.name === 'materialId_1');
      if (legacyIdx) {
        await collection.dropIndex('materialId_1');
        console.log('0. Dropped legacy single-field unique index materialId_1.');
      }
    } catch (e) {
      console.log('0. Note on index cleanup:', e.message);
    }

    // 1. Backfill siteId on all InventoryItems from parent Warehouse
    const warehouses = await Warehouse.find();
    const whMap = {};
    warehouses.forEach(w => {
      whMap[w._id.toString()] = w.siteId ? w.siteId.toString() : null;
    });

    const allItems = await InventoryItem.find();
    let updatedSiteCount = 0;
    for (const item of allItems) {
      if (item.warehouseId && whMap[item.warehouseId.toString()]) {
        const expectedSiteId = whMap[item.warehouseId.toString()];
        if (!item.siteId || item.siteId.toString() !== expectedSiteId) {
          item.siteId = expectedSiteId;
          await item.save();
          updatedSiteCount++;
        }
      }
    }
    console.log(`1. Backfilled site references: ${updatedSiteCount} items updated.`);

    // 2. Ensure Beverage Plant Warehouse has siteId (link to Bengaluru Manufacturing Plant)
    const bevWh = await Warehouse.findOne({ code: 'WH-BEV-01' });
    if (bevWh) {
      const blrSite = await Site.findOne({ code: 'SITE-BLR' }) || await Site.findOne({ status: 'Active' });
      if (blrSite) {
        bevWh.siteId = blrSite._id;
        await bevWh.save();
        console.log(`2. Linked WH-BEV-01 to site ${blrSite.name} (${blrSite.code})`);

        await InventoryItem.updateMany(
          { warehouseId: bevWh._id },
          { $set: { siteId: blrSite._id } }
        );
      }
    }

    // 3. Ensure all active materials have an InventoryItem record in primary warehouse
    const primaryWh = await Warehouse.findOne({ code: 'WH-01' }) || warehouses[0];
    const materials = await Material.find({ status: 'Active' });
    let createdItemCount = 0;

    for (const mat of materials) {
      const exists = await InventoryItem.findOne({
        materialId: mat._id,
        warehouseId: primaryWh._id,
        batchNumber: 'DEFAULT'
      });
      if (!exists) {
        await InventoryItem.create({
          materialId: mat._id,
          warehouseId: primaryWh._id,
          siteId: primaryWh.siteId || null,
          batchNumber: 'DEFAULT',
          balance: 0,
          onHand: 0,
          available: 0,
          reserved: 0,
          allocated: 0,
          blocked: 0,
          reservedBalance: 0,
          uom: mat.unit || 'pcs'
        });
        createdItemCount++;
      }
    }
    console.log(`3. Initialized inventory balances for missing materials: ${createdItemCount} created.`);

    // 4. Verify Total InventoryItems now
    const totalItems = await InventoryItem.countDocuments();
    const withSite = await InventoryItem.countDocuments({ siteId: { $ne: null } });
    console.log(`4. Total InventoryItems in DB: ${totalItems} (With active site: ${withSite})`);

    console.log('\n=== RECONCILIATION COMPLETED SUCCESSFULLY ===\n');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Reconciliation error:', err);
    process.exit(1);
  }
}

syncAndVerify();
